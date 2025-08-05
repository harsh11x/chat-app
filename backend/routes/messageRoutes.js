const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Message = require('../models/Message');
const Chat = require('../models/Chat');
const { authenticate } = require('../middleware/authMiddleware');
const { asyncHandler, validationError, notFoundError, authorizationError } = require('../middleware/errorMiddleware');

const router = express.Router();

// Helper function to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array(),
    });
  }
  next();
};

// @route   POST /api/messages
// @desc    Send a message
// @access  Private
router.post('/',
  authenticate,
  body('chatId').isMongoId().withMessage('Valid chat ID required'),
  body('content').optional().trim().isLength({ min: 1, max: 4000 }).withMessage('Content must be 1-4000 characters'),
  body('type').isIn(['text', 'image', 'video', 'audio', 'file', 'location', 'contact', 'poll', 'sticker', 'gif']).withMessage('Invalid message type'),
  body('replyTo').optional().isMongoId().withMessage('Invalid reply message ID'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const {
      chatId,
      content,
      type = 'text',
      replyTo,
      media,
      location,
      contact,
      poll,
      clientMessageId,
    } = req.body;
    const userId = req.user._id;

    // Verify chat exists and user is participant
    const chat = await Chat.findById(chatId);
    if (!chat || !chat.isActive) {
      throw notFoundError('Chat not found');
    }

    if (!chat.isParticipant(userId)) {
      throw authorizationError('Not authorized to send message to this chat');
    }

    // Check chat permissions
    if (chat.type === 'group' && chat.settings.messagingPermission === 'admins') {
      if (!chat.isAdmin(userId)) {
        throw authorizationError('Only admins can send messages in this group');
      }
    }

    // Validate content based on type
    if (type === 'text' && !content) {
      throw validationError('Content is required for text messages');
    }

    // Create message data
    const messageData = {
      chat: chatId,
      sender: userId,
      content,
      type,
      clientMessageId,
    };

    // Handle reply
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

    // Handle different message types
    if (media) messageData.media = media;
    if (location) messageData.location = location;
    if (contact) messageData.contact = contact;
    if (poll) messageData.poll = poll;

    // Create and save message
    const message = new Message(messageData);
    await message.save();

    // Populate message data
    await message.populate([
      { path: 'sender', select: 'name username avatar' },
      { path: 'replyTo.sender', select: 'name username avatar' },
    ]);

    // Update chat's last message
    await chat.updateLastMessage(message);

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: { message },
    });
  })
);

// @route   GET /api/messages/:messageId
// @desc    Get message details
// @access  Private
router.get('/:messageId',
  authenticate,
  asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const userId = req.user._id;

    const message = await Message.findById(messageId)
      .populate('sender', 'name username avatar')
      .populate('replyTo.sender', 'name username avatar')
      .populate('reactions.user', 'name username avatar')
      .populate('readBy.user', 'name username avatar');

    if (!message) {
      throw notFoundError('Message not found');
    }

    // Check if message is deleted for this user
    if (message.isDeletedForUser(userId)) {
      throw notFoundError('Message not found');
    }

    // Verify user is participant of the chat
    const chat = await Chat.findById(message.chat);
    if (!chat || !chat.isParticipant(userId)) {
      throw authorizationError('Not authorized to access this message');
    }

    res.json({
      success: true,
      data: { message },
    });
  })
);

// @route   PUT /api/messages/:messageId
// @desc    Edit message
// @access  Private
router.put('/:messageId',
  authenticate,
  body('content').trim().isLength({ min: 1, max: 4000 }).withMessage('Content must be 1-4000 characters'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const { content } = req.body;
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      throw notFoundError('Message not found');
    }

    // Check if user is the sender
    if (message.sender.toString() !== userId.toString()) {
      throw authorizationError('Can only edit your own messages');
    }

    // Check if message is deleted
    if (message.isDeleted || message.isDeletedForUser(userId)) {
      throw validationError('Cannot edit deleted message');
    }

    // Check if message type allows editing
    if (message.type !== 'text') {
      throw validationError('Can only edit text messages');
    }

    // Edit message
    await message.editContent(content);

    res.json({
      success: true,
      message: 'Message edited successfully',
      data: { message },
    });
  })
);

// @route   DELETE /api/messages/:messageId
// @desc    Delete message
// @access  Private
router.delete('/:messageId',
  authenticate,
  body('deleteFor').optional().isIn(['me', 'everyone']).withMessage('deleteFor must be "me" or "everyone"'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const { deleteFor = 'me' } = req.body;
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      throw notFoundError('Message not found');
    }

    // Check if user is the sender for "everyone" deletion
    if (deleteFor === 'everyone' && message.sender.toString() !== userId.toString()) {
      throw authorizationError('Can only delete for everyone your own messages');
    }

    // Check if message is already deleted
    if (message.isDeleted || message.isDeletedForUser(userId)) {
      throw validationError('Message is already deleted');
    }

    // Delete message
    await message.deleteMessage(userId, deleteFor);

    res.json({
      success: true,
      message: `Message deleted ${deleteFor === 'everyone' ? 'for everyone' : 'for you'}`,
    });
  })
);

// @route   POST /api/messages/:messageId/react
// @desc    Add reaction to message
// @access  Private
router.post('/:messageId/react',
  authenticate,
  body('emoji').notEmpty().withMessage('Emoji is required'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      throw notFoundError('Message not found');
    }

    // Check if message is deleted for this user
    if (message.isDeletedForUser(userId)) {
      throw notFoundError('Message not found');
    }

    // Verify user is participant of the chat
    const chat = await Chat.findById(message.chat);
    if (!chat || !chat.isParticipant(userId)) {
      throw authorizationError('Not authorized to react to this message');
    }

    // Add reaction
    await message.addReaction(userId, emoji);

    res.json({
      success: true,
      message: 'Reaction added successfully',
    });
  })
);

// @route   DELETE /api/messages/:messageId/react
// @desc    Remove reaction from message
// @access  Private
router.delete('/:messageId/react',
  authenticate,
  body('emoji').optional().notEmpty().withMessage('Emoji cannot be empty'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      throw notFoundError('Message not found');
    }

    // Check if message is deleted for this user
    if (message.isDeletedForUser(userId)) {
      throw notFoundError('Message not found');
    }

    // Verify user is participant of the chat
    const chat = await Chat.findById(message.chat);
    if (!chat || !chat.isParticipant(userId)) {
      throw authorizationError('Not authorized to react to this message');
    }

    // Remove reaction
    await message.removeReaction(userId, emoji);

    res.json({
      success: true,
      message: 'Reaction removed successfully',
    });
  })
);

// @route   POST /api/messages/:messageId/forward
// @desc    Forward message to other chats
// @access  Private
router.post('/:messageId/forward',
  authenticate,
  body('chatIds').isArray({ min: 1 }).withMessage('Chat IDs array required'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const { chatIds } = req.body;
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      throw notFoundError('Message not found');
    }

    // Check if message is deleted for this user
    if (message.isDeletedForUser(userId)) {
      throw notFoundError('Message not found');
    }

    // Verify user is participant of the original chat
    const originalChat = await Chat.findById(message.chat);
    if (!originalChat || !originalChat.isParticipant(userId)) {
      throw authorizationError('Not authorized to forward this message');
    }

    const forwardedMessages = [];
    const errors = [];

    // Forward to each chat
    for (const chatId of chatIds) {
      try {
        // Verify target chat exists and user is participant
        const targetChat = await Chat.findById(chatId);
        if (!targetChat || !targetChat.isActive) {
          errors.push({ chatId, error: 'Chat not found' });
          continue;
        }

        if (!targetChat.isParticipant(userId)) {
          errors.push({ chatId, error: 'Not authorized to send to this chat' });
          continue;
        }

        // Check chat permissions
        if (targetChat.type === 'group' && targetChat.settings.messagingPermission === 'admins') {
          if (!targetChat.isAdmin(userId)) {
            errors.push({ chatId, error: 'Only admins can send messages in this group' });
            continue;
          }
        }

        // Create forwarded message
        const forwardedMessage = message.createForward(chatId, userId);
        await forwardedMessage.save();

        // Update target chat's last message
        await targetChat.updateLastMessage(forwardedMessage);

        forwardedMessages.push({
          chatId,
          messageId: forwardedMessage._id,
        });

      } catch (error) {
        errors.push({ chatId, error: error.message });
      }
    }

    res.json({
      success: true,
      message: `Message forwarded to ${forwardedMessages.length} chats`,
      data: {
        forwardedMessages,
        errors,
      },
    });
  })
);

// @route   POST /api/messages/:messageId/pin
// @desc    Pin/unpin message
// @access  Private
router.post('/:messageId/pin',
  authenticate,
  body('pin').isBoolean().withMessage('Pin must be boolean'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const { pin } = req.body;
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      throw notFoundError('Message not found');
    }

    // Check if message is deleted for this user
    if (message.isDeletedForUser(userId)) {
      throw notFoundError('Message not found');
    }

    // Verify user is participant of the chat
    const chat = await Chat.findById(message.chat);
    if (!chat || !chat.isParticipant(userId)) {
      throw authorizationError('Not authorized to pin messages in this chat');
    }

    // Check if user has permission to pin messages (admins only for groups)
    if (chat.type === 'group' && !chat.isAdmin(userId)) {
      throw authorizationError('Only admins can pin messages in groups');
    }

    if (pin) {
      await message.pinMessage(userId);
      await chat.pinMessage(messageId, userId);
    } else {
      await message.unpinMessage();
      await chat.unpinMessage(messageId);
    }

    res.json({
      success: true,
      message: `Message ${pin ? 'pinned' : 'unpinned'} successfully`,
    });
  })
);

// @route   POST /api/messages/:messageId/vote
// @desc    Vote in poll message
// @access  Private
router.post('/:messageId/vote',
  authenticate,
  body('optionIndex').isInt({ min: 0 }).withMessage('Valid option index required'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const { optionIndex } = req.body;
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      throw notFoundError('Message not found');
    }

    // Check if message is deleted for this user
    if (message.isDeletedForUser(userId)) {
      throw notFoundError('Message not found');
    }

    // Verify user is participant of the chat
    const chat = await Chat.findById(message.chat);
    if (!chat || !chat.isParticipant(userId)) {
      throw authorizationError('Not authorized to vote in this poll');
    }

    // Vote in poll
    try {
      await message.voteInPoll(userId, optionIndex);
      
      res.json({
        success: true,
        message: 'Vote recorded successfully',
      });
    } catch (error) {
      throw validationError(error.message);
    }
  })
);

// @route   GET /api/messages/search
// @desc    Search messages
// @access  Private
router.get('/search',
  authenticate,
  query('q').trim().isLength({ min: 2, max: 100 }).withMessage('Search query must be 2-100 characters'),
  query('chatId').optional().isMongoId().withMessage('Invalid chat ID'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be 1-50'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { q: searchTerm, chatId, limit = 20 } = req.query;
    const userId = req.user._id;

    let messages;

    if (chatId) {
      // Search in specific chat
      const chat = await Chat.findById(chatId);
      if (!chat || !chat.isParticipant(userId)) {
        throw authorizationError('Not authorized to search in this chat');
      }

      messages = await Message.searchMessages(chatId, searchTerm, userId);
    } else {
      // Search in all user's chats
      const userChats = await Chat.findByUser(userId);
      const chatIds = userChats.map(chat => chat._id);

      messages = await Message.find({
        chat: { $in: chatIds },
        content: { $regex: searchTerm, $options: 'i' },
        isDeleted: false,
        isExpired: false,
        $nor: [{ 'deletedFor.user': userId }],
      })
      .populate('sender', 'name username avatar')
      .populate('chat', 'name type participants')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    }

    res.json({
      success: true,
      data: {
        messages,
        searchTerm,
        chatId: chatId || null,
      },
    });
  })
);

module.exports = router;