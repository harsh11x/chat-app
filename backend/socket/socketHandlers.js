const User = require('../models/User');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const { redisUtils } = require('../config/redis');

// Store active socket connections
const activeConnections = new Map();

const socketHandlers = (io, socket) => {
  const userId = socket.userId;
  const user = socket.user;

  // Store socket connection
  activeConnections.set(userId, {
    socketId: socket.id,
    userId,
    user,
    connectedAt: new Date(),
  });

  // Update user online status
  updateUserOnlineStatus(userId, true, socket.id);

  // Join user to their personal room
  socket.join(`user:${userId}`);

  // Join user to their chat rooms
  joinUserChatRooms(socket, userId);

  // Handle joining a specific chat
  socket.on('join_chat', async (data) => {
    try {
      const { chatId } = data;
      
      // Verify user is participant of this chat
      const chat = await Chat.findById(chatId);
      if (!chat || !chat.isParticipant(userId)) {
        socket.emit('error', { message: 'Not authorized to join this chat' });
        return;
      }

      socket.join(`chat:${chatId}`);
      
      // Mark messages as delivered for this user
      await markMessagesAsDelivered(chatId, userId);
      
      socket.emit('joined_chat', { chatId });
    } catch (error) {
      console.error('Error joining chat:', error);
      socket.emit('error', { message: 'Failed to join chat' });
    }
  });

  // Handle leaving a specific chat
  socket.on('leave_chat', (data) => {
    try {
      const { chatId } = data;
      socket.leave(`chat:${chatId}`);
      socket.emit('left_chat', { chatId });
    } catch (error) {
      console.error('Error leaving chat:', error);
    }
  });

  // Handle sending a message
  socket.on('send_message', async (data) => {
    try {
      const {
        chatId,
        content,
        type = 'text',
        replyTo,
        media,
        location,
        contact,
        clientMessageId,
      } = data;

      // Verify user is participant of this chat
      const chat = await Chat.findById(chatId);
      if (!chat || !chat.isParticipant(userId)) {
        socket.emit('message_error', { 
          clientMessageId,
          error: 'Not authorized to send message to this chat' 
        });
        return;
      }

      // Check chat permissions
      if (chat.type === 'group' && chat.settings.messagingPermission === 'admins') {
        if (!chat.isAdmin(userId)) {
          socket.emit('message_error', { 
            clientMessageId,
            error: 'Only admins can send messages in this group' 
          });
          return;
        }
      }

      // Create message
      const messageData = {
        chat: chatId,
        sender: userId,
        content,
        type,
        clientMessageId,
      };

      if (replyTo) {
        const replyMessage = await Message.findById(replyTo);
        if (replyMessage && replyMessage.chat.toString() === chatId) {
          messageData.replyTo = {
            message: replyTo,
            content: replyMessage.content,
            sender: replyMessage.sender,
            type: replyMessage.type,
          };
        }
      }

      if (media) messageData.media = media;
      if (location) messageData.location = location;
      if (contact) messageData.contact = contact;

      const message = new Message(messageData);
      await message.save();

      // Populate message data
      await message.populate([
        { path: 'sender', select: 'name username avatar' },
        { path: 'replyTo.sender', select: 'name username avatar' },
      ]);

      // Update chat's last message
      await chat.updateLastMessage(message);

      // Send message to all chat participants
      io.to(`chat:${chatId}`).emit('new_message', {
        message,
        chatId,
      });

      // Send push notifications to offline users
      await sendPushNotifications(chat, message, userId);

      // Mark message as delivered for online participants
      const onlineParticipants = await getOnlineChatParticipants(chatId);
      for (const participantId of onlineParticipants) {
        if (participantId !== userId) {
          await message.markAsDelivered(participantId);
        }
      }

      socket.emit('message_sent', {
        clientMessageId,
        message,
      });

    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('message_error', {
        clientMessageId: data.clientMessageId,
        error: 'Failed to send message',
      });
    }
  });

  // Handle message read receipt
  socket.on('mark_messages_read', async (data) => {
    try {
      const { chatId, messageIds } = data;

      // Verify user is participant of this chat
      const chat = await Chat.findById(chatId);
      if (!chat || !chat.isParticipant(userId)) {
        return;
      }

      // Mark messages as read
      if (messageIds && messageIds.length > 0) {
        await Message.updateMany(
          {
            _id: { $in: messageIds },
            chat: chatId,
            sender: { $ne: userId },
          },
          {
            $addToSet: {
              readBy: {
                user: userId,
                readAt: new Date(),
              },
            },
          }
        );

        // Update chat unread count
        await chat.markAsRead(userId, messageIds[messageIds.length - 1]);

        // Notify other participants about read receipts
        socket.to(`chat:${chatId}`).emit('messages_read', {
          chatId,
          messageIds,
          readBy: userId,
          readAt: new Date(),
        });
      }

    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  });

  // Handle typing indicator
  socket.on('typing_start', (data) => {
    try {
      const { chatId } = data;
      socket.to(`chat:${chatId}`).emit('user_typing', {
        chatId,
        userId,
        username: user.username,
      });
    } catch (error) {
      console.error('Error handling typing start:', error);
    }
  });

  socket.on('typing_stop', (data) => {
    try {
      const { chatId } = data;
      socket.to(`chat:${chatId}`).emit('user_stopped_typing', {
        chatId,
        userId,
      });
    } catch (error) {
      console.error('Error handling typing stop:', error);
    }
  });

  // Handle message reactions
  socket.on('add_reaction', async (data) => {
    try {
      const { messageId, emoji } = data;

      const message = await Message.findById(messageId);
      if (!message) {
        socket.emit('error', { message: 'Message not found' });
        return;
      }

      // Verify user is participant of the chat
      const chat = await Chat.findById(message.chat);
      if (!chat || !chat.isParticipant(userId)) {
        socket.emit('error', { message: 'Not authorized' });
        return;
      }

      await message.addReaction(userId, emoji);

      // Notify all chat participants
      io.to(`chat:${message.chat}`).emit('reaction_added', {
        messageId,
        userId,
        emoji,
        chatId: message.chat,
      });

    } catch (error) {
      console.error('Error adding reaction:', error);
      socket.emit('error', { message: 'Failed to add reaction' });
    }
  });

  socket.on('remove_reaction', async (data) => {
    try {
      const { messageId, emoji } = data;

      const message = await Message.findById(messageId);
      if (!message) {
        socket.emit('error', { message: 'Message not found' });
        return;
      }

      // Verify user is participant of the chat
      const chat = await Chat.findById(message.chat);
      if (!chat || !chat.isParticipant(userId)) {
        socket.emit('error', { message: 'Not authorized' });
        return;
      }

      await message.removeReaction(userId, emoji);

      // Notify all chat participants
      io.to(`chat:${message.chat}`).emit('reaction_removed', {
        messageId,
        userId,
        emoji,
        chatId: message.chat,
      });

    } catch (error) {
      console.error('Error removing reaction:', error);
      socket.emit('error', { message: 'Failed to remove reaction' });
    }
  });

  // Handle user status updates
  socket.on('update_status', async (data) => {
    try {
      const { status } = data;
      
      if (!['Available', 'Busy', 'Away', 'Invisible'].includes(status)) {
        socket.emit('error', { message: 'Invalid status' });
        return;
      }

      await User.findByIdAndUpdate(userId, { status });

      // Notify contacts about status change
      const userContacts = await getUserContacts(userId);
      for (const contactId of userContacts) {
        io.to(`user:${contactId}`).emit('contact_status_updated', {
          userId,
          status,
        });
      }

      socket.emit('status_updated', { status });

    } catch (error) {
      console.error('Error updating status:', error);
      socket.emit('error', { message: 'Failed to update status' });
    }
  });

  // Handle call events
  socket.on('call_initiate', async (data) => {
    try {
      const { chatId, callType, offer } = data; // callType: 'voice' or 'video'

      const chat = await Chat.findById(chatId);
      if (!chat || !chat.isParticipant(userId)) {
        socket.emit('call_error', { message: 'Not authorized' });
        return;
      }

      // For now, only support private calls
      if (chat.type !== 'private') {
        socket.emit('call_error', { message: 'Group calls not supported yet' });
        return;
      }

      const callId = `call_${Date.now()}_${userId}`;
      
      // Store call info in Redis
      await redisUtils.setex(`call:${callId}`, 300, { // 5 minutes
        callId,
        chatId,
        initiator: userId,
        callType,
        status: 'ringing',
        createdAt: new Date(),
      });

      // Notify other participants
      socket.to(`chat:${chatId}`).emit('incoming_call', {
        callId,
        chatId,
        callType,
        initiator: {
          id: userId,
          name: user.name,
          avatar: user.avatar,
        },
        offer,
      });

      socket.emit('call_initiated', { callId });

    } catch (error) {
      console.error('Error initiating call:', error);
      socket.emit('call_error', { message: 'Failed to initiate call' });
    }
  });

  socket.on('call_answer', async (data) => {
    try {
      const { callId, answer } = data;

      const callInfo = await redisUtils.get(`call:${callId}`);
      if (!callInfo) {
        socket.emit('call_error', { message: 'Call not found' });
        return;
      }

      // Update call status
      callInfo.status = 'active';
      await redisUtils.setex(`call:${callId}`, 1800, callInfo); // 30 minutes

      // Notify initiator
      io.to(`user:${callInfo.initiator}`).emit('call_answered', {
        callId,
        answer,
      });

    } catch (error) {
      console.error('Error answering call:', error);
      socket.emit('call_error', { message: 'Failed to answer call' });
    }
  });

  socket.on('call_reject', async (data) => {
    try {
      const { callId } = data;

      const callInfo = await redisUtils.get(`call:${callId}`);
      if (!callInfo) {
        return;
      }

      // Remove call from Redis
      await redisUtils.del(`call:${callId}`);

      // Notify initiator
      io.to(`user:${callInfo.initiator}`).emit('call_rejected', { callId });

    } catch (error) {
      console.error('Error rejecting call:', error);
    }
  });

  socket.on('call_end', async (data) => {
    try {
      const { callId } = data;

      const callInfo = await redisUtils.get(`call:${callId}`);
      if (!callInfo) {
        return;
      }

      // Remove call from Redis
      await redisUtils.del(`call:${callId}`);

      // Notify all participants
      io.to(`chat:${callInfo.chatId}`).emit('call_ended', { callId });

    } catch (error) {
      console.error('Error ending call:', error);
    }
  });

  // Handle ICE candidates for WebRTC
  socket.on('ice_candidate', (data) => {
    try {
      const { callId, candidate, chatId } = data;
      
      // Forward ICE candidate to other participants
      socket.to(`chat:${chatId}`).emit('ice_candidate', {
        callId,
        candidate,
        from: userId,
      });

    } catch (error) {
      console.error('Error handling ICE candidate:', error);
    }
  });

  // Handle disconnect
  socket.on('disconnect', async (reason) => {
    try {
      console.log(`User ${userId} disconnected: ${reason}`);

      // Remove from active connections
      activeConnections.delete(userId);

      // Update user online status
      await updateUserOnlineStatus(userId, false);

      // Notify contacts about offline status
      const userContacts = await getUserContacts(userId);
      for (const contactId of userContacts) {
        io.to(`user:${contactId}`).emit('contact_offline', {
          userId,
          lastSeen: new Date(),
        });
      }

    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  });
};

// Helper functions

async function updateUserOnlineStatus(userId, isOnline, socketId = null) {
  try {
    await User.findByIdAndUpdate(userId, {
      isOnline,
      socketId: isOnline ? socketId : null,
      lastSeen: isOnline ? null : new Date(),
    });

    // Store online status in Redis for quick access
    if (isOnline) {
      await redisUtils.setex(`online:${userId}`, 3600, { socketId, timestamp: Date.now() });
    } else {
      await redisUtils.del(`online:${userId}`);
    }
  } catch (error) {
    console.error('Error updating online status:', error);
  }
}

async function joinUserChatRooms(socket, userId) {
  try {
    const chats = await Chat.find({
      'participants.user': userId,
      'participants.isActive': true,
      isActive: true,
    }).select('_id');

    for (const chat of chats) {
      socket.join(`chat:${chat._id}`);
    }
  } catch (error) {
    console.error('Error joining chat rooms:', error);
  }
}

async function markMessagesAsDelivered(chatId, userId) {
  try {
    await Message.updateMany(
      {
        chat: chatId,
        sender: { $ne: userId },
        'deliveredTo.user': { $ne: userId },
      },
      {
        $addToSet: {
          deliveredTo: {
            user: userId,
            deliveredAt: new Date(),
          },
        },
      }
    );
  } catch (error) {
    console.error('Error marking messages as delivered:', error);
  }
}

async function getOnlineChatParticipants(chatId) {
  try {
    const chat = await Chat.findById(chatId).populate('participants.user', '_id');
    const participantIds = chat.participants
      .filter(p => p.isActive)
      .map(p => p.user._id.toString());

    const onlineParticipants = [];
    for (const participantId of participantIds) {
      const isOnline = await redisUtils.exists(`online:${participantId}`);
      if (isOnline) {
        onlineParticipants.push(participantId);
      }
    }

    return onlineParticipants;
  } catch (error) {
    console.error('Error getting online participants:', error);
    return [];
  }
}

async function getUserContacts(userId) {
  try {
    const user = await User.findById(userId).select('contacts');
    return user.contacts.map(contact => contact.user.toString());
  } catch (error) {
    console.error('Error getting user contacts:', error);
    return [];
  }
}

async function sendPushNotifications(chat, message, senderId) {
  try {
    // Get offline participants
    const participants = chat.participants.filter(p => 
      p.isActive && p.user.toString() !== senderId
    );

    for (const participant of participants) {
      const isOnline = await redisUtils.exists(`online:${participant.user}`);
      if (!isOnline) {
        // Send push notification (implement with FCM or similar service)
        // This is a placeholder for push notification logic
        console.log(`Send push notification to ${participant.user} for message: ${message.content}`);
      }
    }
  } catch (error) {
    console.error('Error sending push notifications:', error);
  }
}

// Export active connections for external use
const getActiveConnections = () => activeConnections;

const getUserSocket = (userId) => {
  const connection = activeConnections.get(userId);
  return connection ? connection.socketId : null;
};

const isUserOnline = (userId) => {
  return activeConnections.has(userId);
};

module.exports = {
  socketHandlers,
  getActiveConnections,
  getUserSocket,
  isUserOnline,
};