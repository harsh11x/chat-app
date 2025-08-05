const Message = require('../models/Message');
const Chat = require('../models/Chat');
const User = require('../models/User');
const { v4: uuidv4 } = require('uuid');

module.exports = (io, socket) => {
  
  // Join chat room
  socket.on('join_chat', async (data) => {
    try {
      const { chatId } = data;
      const userId = socket.userId;

      if (!userId || !chatId) {
        socket.emit('error', { message: 'Missing required data' });
        return;
      }

      // Verify user is participant in chat
      const chat = await Chat.findById(chatId);
      if (!chat || !chat.isParticipant(userId)) {
        socket.emit('error', { message: 'Unauthorized access to chat' });
        return;
      }

      // Join the chat room
      socket.join(chatId);
      socket.currentChatId = chatId;

      // Mark user as online in this chat
      socket.to(chatId).emit('user_joined_chat', {
        userId,
        chatId,
        timestamp: new Date()
      });

      console.log(`User ${userId} joined chat ${chatId}`);

    } catch (error) {
      console.error('Join chat error:', error);
      socket.emit('error', { message: 'Failed to join chat' });
    }
  });

  // Leave chat room
  socket.on('leave_chat', async (data) => {
    try {
      const { chatId } = data;
      const userId = socket.userId;

      if (chatId) {
        socket.leave(chatId);
        socket.to(chatId).emit('user_left_chat', {
          userId,
          chatId,
          timestamp: new Date()
        });
      }

      socket.currentChatId = null;
      console.log(`User ${userId} left chat ${chatId}`);

    } catch (error) {
      console.error('Leave chat error:', error);
    }
  });

  // Send message
  socket.on('send_message', async (data) => {
    try {
      const {
        chatId,
        content,
        replyTo,
        mentions,
        tempId // Client-side temporary ID
      } = data;
      
      const userId = socket.userId;

      if (!userId || !chatId || !content) {
        socket.emit('message_error', { 
          tempId,
          error: 'Missing required data' 
        });
        return;
      }

      // Verify user is participant in chat
      const chat = await Chat.findById(chatId);
      if (!chat || !chat.isParticipant(userId)) {
        socket.emit('message_error', { 
          tempId,
          error: 'Unauthorized access to chat' 
        });
        return;
      }

      // Create message
      const message = new Message({
        messageId: uuidv4(),
        chatId,
        sender: userId,
        content,
        replyTo,
        mentions: mentions || [],
        status: 'sent'
      });

      await message.save();

      // Populate sender info
      await message.populate('sender', 'displayName profilePicture');
      if (replyTo) {
        await message.populate('replyTo.sender', 'displayName');
      }

      // Update chat's last message
      await chat.updateLastMessage(message);

      // Update unread counts for other participants
      const otherParticipants = chat.activeParticipants.filter(
        p => p.userId.toString() !== userId.toString()
      );

      for (const participant of otherParticipants) {
        await chat.incrementUnreadCount(participant.userId, message._id);
      }

      // Emit message to all participants in the chat
      io.to(chatId).emit('new_message', {
        message: {
          _id: message._id,
          messageId: message.messageId,
          chatId: message.chatId,
          sender: message.sender,
          content: message.content,
          replyTo: message.replyTo,
          mentions: message.mentions,
          status: message.status,
          createdAt: message.createdAt,
          updatedAt: message.updatedAt
        },
        tempId // Send back temp ID for client to match
      });

      // Send push notifications to offline users
      // This would integrate with FCM/APNS
      const offlineParticipants = await User.find({
        _id: { $in: otherParticipants.map(p => p.userId) },
        isOnline: false
      });

      // TODO: Send push notifications to offline users

      console.log(`Message sent in chat ${chatId} by user ${userId}`);

    } catch (error) {
      console.error('Send message error:', error);
      socket.emit('message_error', { 
        tempId: data.tempId,
        error: 'Failed to send message' 
      });
    }
  });

  // Mark message as delivered
  socket.on('message_delivered', async (data) => {
    try {
      const { messageId } = data;
      const userId = socket.userId;

      const message = await Message.findById(messageId);
      if (message && message.sender.toString() !== userId.toString()) {
        await message.markAsDelivered(userId);

        // Notify sender about delivery
        io.to(message.chatId.toString()).emit('message_status_update', {
          messageId: message._id,
          status: 'delivered',
          userId,
          timestamp: new Date()
        });
      }

    } catch (error) {
      console.error('Message delivered error:', error);
    }
  });

  // Mark message as read
  socket.on('message_read', async (data) => {
    try {
      const { messageId, chatId } = data;
      const userId = socket.userId;

      if (messageId) {
        const message = await Message.findById(messageId);
        if (message && message.sender.toString() !== userId.toString()) {
          await message.markAsRead(userId);

          // Notify sender about read status
          io.to(message.chatId.toString()).emit('message_status_update', {
            messageId: message._id,
            status: 'read',
            userId,
            timestamp: new Date()
          });
        }
      }

      // Reset unread count for the chat
      if (chatId) {
        const chat = await Chat.findById(chatId);
        if (chat) {
          await chat.resetUnreadCount(userId, messageId);
          
          // Notify about unread count reset
          socket.emit('unread_count_reset', {
            chatId,
            timestamp: new Date()
          });
        }
      }

    } catch (error) {
      console.error('Message read error:', error);
    }
  });

  // Typing indicator
  socket.on('typing_start', (data) => {
    try {
      const { chatId } = data;
      const userId = socket.userId;

      if (chatId && userId) {
        socket.to(chatId).emit('user_typing', {
          userId,
          chatId,
          isTyping: true,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Typing start error:', error);
    }
  });

  socket.on('typing_stop', (data) => {
    try {
      const { chatId } = data;
      const userId = socket.userId;

      if (chatId && userId) {
        socket.to(chatId).emit('user_typing', {
          userId,
          chatId,
          isTyping: false,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Typing stop error:', error);
    }
  });

  // Message reactions
  socket.on('add_reaction', async (data) => {
    try {
      const { messageId, emoji } = data;
      const userId = socket.userId;

      const message = await Message.findById(messageId);
      if (!message) {
        socket.emit('error', { message: 'Message not found' });
        return;
      }

      await message.addReaction(userId, emoji);

      // Notify all participants in the chat
      io.to(message.chatId.toString()).emit('message_reaction', {
        messageId: message._id,
        userId,
        emoji,
        action: 'add',
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Add reaction error:', error);
      socket.emit('error', { message: 'Failed to add reaction' });
    }
  });

  socket.on('remove_reaction', async (data) => {
    try {
      const { messageId } = data;
      const userId = socket.userId;

      const message = await Message.findById(messageId);
      if (!message) {
        socket.emit('error', { message: 'Message not found' });
        return;
      }

      await message.removeReaction(userId);

      // Notify all participants in the chat
      io.to(message.chatId.toString()).emit('message_reaction', {
        messageId: message._id,
        userId,
        action: 'remove',
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Remove reaction error:', error);
      socket.emit('error', { message: 'Failed to remove reaction' });
    }
  });

  // Edit message
  socket.on('edit_message', async (data) => {
    try {
      const { messageId, newContent } = data;
      const userId = socket.userId;

      const message = await Message.findById(messageId);
      if (!message) {
        socket.emit('error', { message: 'Message not found' });
        return;
      }

      // Check if user is the sender
      if (message.sender.toString() !== userId.toString()) {
        socket.emit('error', { message: 'Unauthorized to edit this message' });
        return;
      }

      // Check if message is too old to edit (e.g., 15 minutes)
      const fifteenMinutes = 15 * 60 * 1000;
      if (Date.now() - message.createdAt.getTime() > fifteenMinutes) {
        socket.emit('error', { message: 'Message too old to edit' });
        return;
      }

      await message.editMessage(newContent);

      // Notify all participants in the chat
      io.to(message.chatId.toString()).emit('message_edited', {
        messageId: message._id,
        newContent,
        editedAt: message.editedAt,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Edit message error:', error);
      socket.emit('error', { message: 'Failed to edit message' });
    }
  });

  // Delete message
  socket.on('delete_message', async (data) => {
    try {
      const { messageId, deleteForEveryone } = data;
      const userId = socket.userId;

      const message = await Message.findById(messageId);
      if (!message) {
        socket.emit('error', { message: 'Message not found' });
        return;
      }

      // Check permissions for delete for everyone
      if (deleteForEveryone) {
        if (message.sender.toString() !== userId.toString()) {
          socket.emit('error', { message: 'Unauthorized to delete for everyone' });
          return;
        }

        // Check if message is too old to delete for everyone (e.g., 1 hour)
        const oneHour = 60 * 60 * 1000;
        if (Date.now() - message.createdAt.getTime() > oneHour) {
          socket.emit('error', { message: 'Message too old to delete for everyone' });
          return;
        }
      }

      await message.deleteMessage(userId, deleteForEveryone);

      // Notify participants
      const eventData = {
        messageId: message._id,
        deletedBy: userId,
        deleteForEveryone,
        timestamp: new Date()
      };

      if (deleteForEveryone) {
        io.to(message.chatId.toString()).emit('message_deleted', eventData);
      } else {
        socket.emit('message_deleted', eventData);
      }

    } catch (error) {
      console.error('Delete message error:', error);
      socket.emit('error', { message: 'Failed to delete message' });
    }
  });

  // Forward message
  socket.on('forward_message', async (data) => {
    try {
      const { messageId, targetChatIds } = data;
      const userId = socket.userId;

      const originalMessage = await Message.findById(messageId);
      if (!originalMessage) {
        socket.emit('error', { message: 'Original message not found' });
        return;
      }

      const forwardedMessages = [];

      for (const chatId of targetChatIds) {
        // Verify user is participant in target chat
        const chat = await Chat.findById(chatId);
        if (!chat || !chat.isParticipant(userId)) {
          continue;
        }

        // Create forwarded message
        const forwardedMessage = new Message({
          messageId: uuidv4(),
          chatId,
          sender: userId,
          content: originalMessage.content,
          media: originalMessage.media,
          location: originalMessage.location,
          contact: originalMessage.contact,
          forwardedFrom: {
            originalSender: originalMessage.sender,
            originalChatId: originalMessage.chatId,
            forwardedAt: new Date()
          },
          status: 'sent'
        });

        await forwardedMessage.save();
        await forwardedMessage.populate('sender', 'displayName profilePicture');

        // Update chat's last message
        await chat.updateLastMessage(forwardedMessage);

        // Emit to target chat
        io.to(chatId).emit('new_message', {
          message: forwardedMessage
        });

        forwardedMessages.push(forwardedMessage);
      }

      socket.emit('messages_forwarded', {
        originalMessageId: messageId,
        forwardedCount: forwardedMessages.length,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Forward message error:', error);
      socket.emit('error', { message: 'Failed to forward message' });
    }
  });

};
