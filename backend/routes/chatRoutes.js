const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
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

// @route   GET /api/chats
// @desc    Get user's chats
// @access  Private
router.get('/',
  authenticate,
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be 1-50'),
  query('archived').optional().isBoolean().withMessage('Archived must be boolean'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, archived = false } = req.query;
    const userId = req.user._id;

    const chats = await Chat.findByUser(userId, archived);

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedChats = chats.slice(startIndex, endIndex);

    // Add unread count for each chat
    const chatsWithUnreadCount = paginatedChats.map(chat => {
      const chatObj = chat.toObject();
      chatObj.unreadCount = chat.getUnreadCount(userId);
      chatObj.isArchived = chat.isArchivedForUser(userId);
      return chatObj;
    });

    res.json({
      success: true,
      data: {
        chats: chatsWithUnreadCount,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(chats.length / limit),
          totalChats: chats.length,
          hasNext: endIndex < chats.length,
          hasPrev: page > 1,
        },
      },
    });
  })
);

// @route   POST /api/chats
// @desc    Create a new chat (private or group)
// @access  Private
router.post('/',
  authenticate,
  body('type').isIn(['private', 'group']).withMessage('Chat type must be private or group'),
  body('participants').isArray({ min: 1 }).withMessage('Participants array required'),
  body('name').optional().trim().isLength({ min: 1, max: 50 }).withMessage('Group name must be 1-50 characters'),
  body('description').optional().trim().isLength({ max: 200 }).withMessage('Description cannot exceed 200 characters'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { type, participants, name, description } = req.body;
    const userId = req.user._id;

    // Validate participants
    for (const participantId of participants) {
      if (!participantId.match(/^[0-9a-fA-F]{24}$/)) {
        throw validationError('Invalid participant ID');
      }
    }

    // Check if participants exist and are not blocked
    const participantUsers = await User.find({
      _id: { $in: participants },
      isActive: true,
      isDeleted: false,
    });

    if (participantUsers.length !== participants.length) {
      throw validationError('Some participants not found');
    }

    // Check for blocked users
    for (const participant of participantUsers) {
      if (req.user.isUserBlocked(participant._id) || participant.isUserBlocked(userId)) {
        throw validationError('Cannot create chat with blocked users');
      }
    }

    if (type === 'private') {
      // For private chats, only allow 2 participants
      if (participants.length !== 1) {
        throw validationError('Private chat must have exactly 1 other participant');
      }

      const otherUserId = participants[0];

      // Check if private chat already exists
      const existingChat = await Chat.findPrivateChat(userId, otherUserId);
      if (existingChat) {
        return res.json({
          success: true,
          message: 'Private chat already exists',
          data: { chat: existingChat },
        });
      }

      // Create private chat
      const chat = await Chat.createPrivateChat(userId, otherUserId);
      await chat.populate('participants.user', 'name username avatar isOnline lastSeen');

      res.status(201).json({
        success: true,
        message: 'Private chat created successfully',
        data: { chat },
      });
    } else {
      // Group chat
      if (!name) {
        throw validationError('Group name is required');
      }

      // Add creator to participants if not included
      if (!participants.includes(userId.toString())) {
        participants.push(userId.toString());
      }

      // Create group chat
      const chatData = {
        type: 'group',
        name,
        description,
        participants: participants.map((participantId, index) => ({
          user: participantId,
          role: participantId === userId.toString() ? 'owner' : 'member',
        })),
        createdBy: userId,
      };

      const chat = new Chat(chatData);
      await chat.save();
      await chat.populate('participants.user', 'name username avatar isOnline lastSeen');

      res.status(201).json({
        success: true,
        message: 'Group chat created successfully',
        data: { chat },
      });
    }
  })
);

// @route   GET /api/chats/:chatId
// @desc    Get chat details
// @access  Private
router.get('/:chatId',
  authenticate,
  asyncHandler(async (req, res) => {
    const { chatId } = req.params;
    const userId = req.user._id;

    // Validate chatId
    if (!chatId.match(/^[0-9a-fA-F]{24}$/)) {
      throw validationError('Invalid chat ID');
    }

    const chat = await Chat.findById(chatId)
      .populate('participants.user', 'name username avatar isOnline lastSeen')
      .populate('lastMessage.sender', 'name username avatar');

    if (!chat || !chat.isActive) {
      throw notFoundError('Chat not found');
    }

    // Check if user is participant
    if (!chat.isParticipant(userId)) {
      throw authorizationError('Not authorized to access this chat');
    }

    // Add additional info
    const chatObj = chat.toObject();
    chatObj.unreadCount = chat.getUnreadCount(userId);
    chatObj.isArchived = chat.isArchivedForUser(userId);

    res.json({
      success: true,
      data: { chat: chatObj },
    });
  })
);

// @route   PUT /api/chats/:chatId
// @desc    Update chat (group info)
// @access  Private
router.put('/:chatId',
  authenticate,
  body('name').optional().trim().isLength({ min: 1, max: 50 }).withMessage('Group name must be 1-50 characters'),
  body('description').optional().trim().isLength({ max: 200 }).withMessage('Description cannot exceed 200 characters'),
  body('avatar').optional().isURL().withMessage('Avatar must be a valid URL'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { chatId } = req.params;
    const { name, description, avatar } = req.body;
    const userId = req.user._id;

    const chat = await Chat.findById(chatId);
    if (!chat || !chat.isActive) {
      throw notFoundError('Chat not found');
    }

    // Check if user is participant
    if (!chat.isParticipant(userId)) {
      throw authorizationError('Not authorized to access this chat');
    }

    // Only group chats can be updated
    if (chat.type !== 'group') {
      throw validationError('Cannot update private chat info');
    }

    // Check permissions
    if (chat.settings.editInfoPermission === 'admins' && !chat.isAdmin(userId)) {
      throw authorizationError('Only admins can edit group info');
    }

    // Update chat
    if (name !== undefined) chat.name = name;
    if (description !== undefined) chat.description = description;
    if (avatar !== undefined) chat.avatar = avatar;

    await chat.save();

    res.json({
      success: true,
      message: 'Chat updated successfully',
      data: { chat },
    });
  })
);

// @route   POST /api/chats/:chatId/participants
// @desc    Add participants to group chat
// @access  Private
router.post('/:chatId/participants',
  authenticate,
  body('userIds').isArray({ min: 1 }).withMessage('User IDs array required'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { chatId } = req.params;
    const { userIds } = req.body;
    const userId = req.user._id;

    const chat = await Chat.findById(chatId);
    if (!chat || !chat.isActive) {
      throw notFoundError('Chat not found');
    }

    // Check if user is participant
    if (!chat.isParticipant(userId)) {
      throw authorizationError('Not authorized to access this chat');
    }

    // Only group chats can have participants added
    if (chat.type !== 'group') {
      throw validationError('Cannot add participants to private chat');
    }

    // Check permissions
    if (chat.settings.addMembersPermission === 'admins' && !chat.isAdmin(userId)) {
      throw authorizationError('Only admins can add members');
    }

    // Validate and add participants
    const addedUsers = [];
    for (const userIdToAdd of userIds) {
      if (!userIdToAdd.match(/^[0-9a-fA-F]{24}$/)) {
        continue; // Skip invalid IDs
      }

      const userToAdd = await User.findById(userIdToAdd);
      if (!userToAdd || !userToAdd.isActive || userToAdd.isDeleted) {
        continue; // Skip non-existent users
      }

      // Check if user is already a participant
      if (chat.isParticipant(userIdToAdd)) {
        continue; // Skip existing participants
      }

      // Check blocking
      if (req.user.isUserBlocked(userIdToAdd) || userToAdd.isUserBlocked(userId)) {
        continue; // Skip blocked users
      }

      // Add participant
      const success = await chat.addParticipant(userIdToAdd, 'member', userId);
      if (success) {
        addedUsers.push(userToAdd);
      }
    }

    res.json({
      success: true,
      message: `${addedUsers.length} participants added successfully`,
      data: {
        addedUsers: addedUsers.map(user => ({
          _id: user._id,
          name: user.name,
          username: user.username,
          avatar: user.avatar,
        })),
      },
    });
  })
);

// @route   DELETE /api/chats/:chatId/participants/:userId
// @desc    Remove participant from group chat
// @access  Private
router.delete('/:chatId/participants/:participantId',
  authenticate,
  asyncHandler(async (req, res) => {
    const { chatId, participantId } = req.params;
    const userId = req.user._id;

    const chat = await Chat.findById(chatId);
    if (!chat || !chat.isActive) {
      throw notFoundError('Chat not found');
    }

    // Check if user is participant
    if (!chat.isParticipant(userId)) {
      throw authorizationError('Not authorized to access this chat');
    }

    // Only group chats can have participants removed
    if (chat.type !== 'group') {
      throw validationError('Cannot remove participants from private chat');
    }

    // Check if trying to remove self (leave group)
    if (participantId === userId.toString()) {
      // User is leaving the group
      await chat.removeParticipant(userId);
      
      res.json({
        success: true,
        message: 'Left group successfully',
      });
      return;
    }

    // Check if user has permission to remove others
    if (!chat.isAdmin(userId)) {
      throw authorizationError('Only admins can remove members');
    }

    // Cannot remove owner
    if (chat.isOwner(participantId)) {
      throw validationError('Cannot remove group owner');
    }

    // Remove participant
    const success = await chat.removeParticipant(participantId);
    if (!success) {
      throw validationError('Participant not found or already removed');
    }

    res.json({
      success: true,
      message: 'Participant removed successfully',
    });
  })
);

// @route   PUT /api/chats/:chatId/participants/:participantId/role
// @desc    Update participant role
// @access  Private
router.put('/:chatId/participants/:participantId/role',
  authenticate,
  body('role').isIn(['member', 'admin']).withMessage('Role must be member or admin'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { chatId, participantId } = req.params;
    const { role } = req.body;
    const userId = req.user._id;

    const chat = await Chat.findById(chatId);
    if (!chat || !chat.isActive) {
      throw notFoundError('Chat not found');
    }

    // Check if user is participant
    if (!chat.isParticipant(userId)) {
      throw authorizationError('Not authorized to access this chat');
    }

    // Only group chats have roles
    if (chat.type !== 'group') {
      throw validationError('Cannot update roles in private chat');
    }

    // Only owner can change roles
    if (!chat.isOwner(userId)) {
      throw authorizationError('Only group owner can change roles');
    }

    // Cannot change owner role
    if (chat.isOwner(participantId)) {
      throw validationError('Cannot change owner role');
    }

    // Update role
    const success = await chat.updateParticipantRole(participantId, role);
    if (!success) {
      throw validationError('Participant not found');
    }

    res.json({
      success: true,
      message: 'Participant role updated successfully',
    });
  })
);

// @route   POST /api/chats/:chatId/archive
// @desc    Archive/unarchive chat
// @access  Private
router.post('/:chatId/archive',
  authenticate,
  body('archive').isBoolean().withMessage('Archive must be boolean'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { chatId } = req.params;
    const { archive } = req.body;
    const userId = req.user._id;

    const chat = await Chat.findById(chatId);
    if (!chat || !chat.isActive) {
      throw notFoundError('Chat not found');
    }

    // Check if user is participant
    if (!chat.isParticipant(userId)) {
      throw authorizationError('Not authorized to access this chat');
    }

    if (archive) {
      await chat.archiveForUser(userId);
    } else {
      await chat.unarchiveForUser(userId);
    }

    res.json({
      success: true,
      message: `Chat ${archive ? 'archived' : 'unarchived'} successfully`,
    });
  })
);

// @route   POST /api/chats/:chatId/read
// @desc    Mark chat as read
// @access  Private
router.post('/:chatId/read',
  authenticate,
  body('messageId').optional().isMongoId().withMessage('Invalid message ID'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { chatId } = req.params;
    const { messageId } = req.body;
    const userId = req.user._id;

    const chat = await Chat.findById(chatId);
    if (!chat || !chat.isActive) {
      throw notFoundError('Chat not found');
    }

    // Check if user is participant
    if (!chat.isParticipant(userId)) {
      throw authorizationError('Not authorized to access this chat');
    }

    // Mark as read
    await chat.markAsRead(userId, messageId);

    res.json({
      success: true,
      message: 'Chat marked as read',
    });
  })
);

// @route   GET /api/chats/:chatId/messages
// @desc    Get chat messages
// @access  Private
router.get('/:chatId/messages',
  authenticate,
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { chatId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const userId = req.user._id;

    const chat = await Chat.findById(chatId);
    if (!chat || !chat.isActive) {
      throw notFoundError('Chat not found');
    }

    // Check if user is participant
    if (!chat.isParticipant(userId)) {
      throw authorizationError('Not authorized to access this chat');
    }

    // Get messages
    const messages = await Message.findByChat(chatId, page, limit, userId);

    res.json({
      success: true,
      data: {
        messages: messages.reverse(), // Reverse to show oldest first
        pagination: {
          currentPage: parseInt(page),
          limit: parseInt(limit),
          hasMore: messages.length === parseInt(limit),
        },
      },
    });
  })
);

module.exports = router;