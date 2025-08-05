const express = require('express');
const { body, query, validationResult } = require('express-validator');
const User = require('../models/User');
const Chat = require('../models/Chat');
const { authenticate, requireVerification } = require('../middleware/authMiddleware');
const { asyncHandler, validationError, notFoundError } = require('../middleware/errorMiddleware');
const { redisUtils } = require('../config/redis');

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

// @route   POST /api/contacts/discover
// @desc    Discover users by phone numbers
// @access  Private
router.post('/discover',
  authenticate,
  requireVerification('either'),
  body('phoneNumbers')
    .isArray({ min: 1, max: 100 })
    .withMessage('Phone numbers array required (max 100)'),
  body('phoneNumbers.*')
    .matches(/^\+[1-9]\d{1,14}$/)
    .withMessage('Each phone number must be in international format'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { phoneNumbers } = req.body;
    const currentUserId = req.user._id;

    // Remove current user's phone number from the list
    const filteredPhoneNumbers = phoneNumbers.filter(phone => phone !== req.user.phone);

    if (filteredPhoneNumbers.length === 0) {
      return res.json({
        success: true,
        data: {
          foundUsers: [],
          notFoundNumbers: phoneNumbers,
        },
      });
    }

    // Check cache first
    const cacheKey = `contact_discovery:${currentUserId}:${filteredPhoneNumbers.sort().join(',')}`;
    const cachedResult = await redisUtils.get(cacheKey);
    
    if (cachedResult) {
      return res.json({
        success: true,
        data: cachedResult,
        cached: true,
      });
    }

    // Find users by phone numbers
    const foundUsers = await User.findByPhoneNumbers(filteredPhoneNumbers);

    // Filter out blocked users and users who blocked current user
    const availableUsers = [];
    for (const user of foundUsers) {
      // Check if current user blocked this user
      const isBlocked = req.user.isUserBlocked(user._id);
      
      // Check if this user blocked current user
      const hasBlockedCurrentUser = user.isUserBlocked(currentUserId);
      
      if (!isBlocked && !hasBlockedCurrentUser) {
        availableUsers.push({
          _id: user._id,
          name: user.name,
          username: user.username,
          phone: user.phone,
          avatar: user.avatar,
          bio: user.bio,
          status: user.status,
          isOnline: user.isOnline,
          lastSeen: user.lastSeen,
          isContact: req.user.contacts.some(contact => 
            contact.user.toString() === user._id.toString()
          ),
        });
      }
    }

    // Determine which numbers were not found
    const foundPhoneNumbers = availableUsers.map(user => user.phone);
    const notFoundNumbers = filteredPhoneNumbers.filter(phone => 
      !foundPhoneNumbers.includes(phone)
    );

    const result = {
      foundUsers: availableUsers,
      notFoundNumbers,
    };

    // Cache the result for 5 minutes
    await redisUtils.setex(cacheKey, 300, result);

    res.json({
      success: true,
      data: result,
    });
  })
);

// @route   POST /api/contacts/add
// @desc    Add user to contacts
// @access  Private
router.post('/add',
  authenticate,
  body('userId').isMongoId().withMessage('Valid user ID required'),
  body('customName').optional().trim().isLength({ max: 50 }).withMessage('Custom name too long'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { userId, customName } = req.body;
    const currentUser = req.user;

    // Check if user exists
    const userToAdd = await User.findById(userId);
    if (!userToAdd || !userToAdd.isActive || userToAdd.isDeleted) {
      throw notFoundError('User not found');
    }

    // Check if trying to add self
    if (userId === currentUser._id.toString()) {
      throw validationError('Cannot add yourself as contact');
    }

    // Check if user is blocked
    if (currentUser.isUserBlocked(userId)) {
      throw validationError('Cannot add blocked user as contact');
    }

    // Check if this user has blocked current user
    if (userToAdd.isUserBlocked(currentUser._id)) {
      throw validationError('Cannot add this user as contact');
    }

    // Add contact
    const success = await currentUser.addContact(userId, customName);
    if (!success) {
      throw validationError('User is already in your contacts');
    }

    // Get updated contact info
    const updatedUser = await User.findById(currentUser._id)
      .populate('contacts.user', 'name username avatar isOnline lastSeen');
    
    const addedContact = updatedUser.contacts.find(
      contact => contact.user._id.toString() === userId
    );

    res.json({
      success: true,
      message: 'Contact added successfully',
      data: {
        contact: addedContact,
      },
    });
  })
);

// @route   DELETE /api/contacts/:userId
// @desc    Remove user from contacts
// @access  Private
router.delete('/:userId',
  authenticate,
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const currentUser = req.user;

    // Validate userId
    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      throw validationError('Invalid user ID');
    }

    // Remove contact
    await currentUser.removeContact(userId);

    res.json({
      success: true,
      message: 'Contact removed successfully',
    });
  })
);

// @route   GET /api/contacts
// @desc    Get user's contacts
// @access  Private
router.get('/',
  authenticate,
  query('search').optional().trim(),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { search, page = 1, limit = 50 } = req.query;
    const currentUser = req.user;

    // Get user with populated contacts
    const userWithContacts = await User.findById(currentUser._id)
      .populate({
        path: 'contacts.user',
        select: 'name username avatar bio status isOnline lastSeen',
        match: { isActive: true, isDeleted: false },
      });

    let contacts = userWithContacts.contacts.filter(contact => contact.user);

    // Apply search filter
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      contacts = contacts.filter(contact => {
        const user = contact.user;
        const customName = contact.name;
        return (
          searchRegex.test(user.name) ||
          searchRegex.test(user.username) ||
          (customName && searchRegex.test(customName))
        );
      });
    }

    // Sort contacts by name
    contacts.sort((a, b) => {
      const nameA = a.name || a.user.name;
      const nameB = b.name || b.user.name;
      return nameA.localeCompare(nameB);
    });

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedContacts = contacts.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        contacts: paginatedContacts,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(contacts.length / limit),
          totalContacts: contacts.length,
          hasNext: endIndex < contacts.length,
          hasPrev: page > 1,
        },
      },
    });
  })
);

// @route   PUT /api/contacts/:userId
// @desc    Update contact (custom name, favorite status)
// @access  Private
router.put('/:userId',
  authenticate,
  body('customName').optional().trim().isLength({ max: 50 }).withMessage('Custom name too long'),
  body('isFavorite').optional().isBoolean().withMessage('isFavorite must be boolean'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { customName, isFavorite } = req.body;
    const currentUser = req.user;

    // Validate userId
    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      throw validationError('Invalid user ID');
    }

    // Find the contact
    const contact = currentUser.contacts.find(
      contact => contact.user.toString() === userId
    );

    if (!contact) {
      throw notFoundError('Contact not found');
    }

    // Update contact
    if (customName !== undefined) {
      contact.name = customName;
    }
    if (isFavorite !== undefined) {
      contact.isFavorite = isFavorite;
    }

    await currentUser.save();

    // Get updated contact with populated user data
    const updatedUser = await User.findById(currentUser._id)
      .populate({
        path: 'contacts.user',
        select: 'name username avatar bio status isOnline lastSeen',
        match: { _id: userId },
      });

    const updatedContact = updatedUser.contacts.find(
      contact => contact.user && contact.user._id.toString() === userId
    );

    res.json({
      success: true,
      message: 'Contact updated successfully',
      data: {
        contact: updatedContact,
      },
    });
  })
);

// @route   POST /api/contacts/block
// @desc    Block a user
// @access  Private
router.post('/block',
  authenticate,
  body('userId').isMongoId().withMessage('Valid user ID required'),
  body('reason').optional().trim().isLength({ max: 200 }).withMessage('Reason too long'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { userId, reason } = req.body;
    const currentUser = req.user;

    // Check if user exists
    const userToBlock = await User.findById(userId);
    if (!userToBlock || !userToBlock.isActive || userToBlock.isDeleted) {
      throw notFoundError('User not found');
    }

    // Check if trying to block self
    if (userId === currentUser._id.toString()) {
      throw validationError('Cannot block yourself');
    }

    // Block user
    const success = await currentUser.blockUser(userId, reason);
    if (!success) {
      throw validationError('User is already blocked');
    }

    res.json({
      success: true,
      message: 'User blocked successfully',
    });
  })
);

// @route   POST /api/contacts/unblock
// @desc    Unblock a user
// @access  Private
router.post('/unblock',
  authenticate,
  body('userId').isMongoId().withMessage('Valid user ID required'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { userId } = req.body;
    const currentUser = req.user;

    // Unblock user
    await currentUser.unblockUser(userId);

    res.json({
      success: true,
      message: 'User unblocked successfully',
    });
  })
);

// @route   GET /api/contacts/blocked
// @desc    Get blocked users
// @access  Private
router.get('/blocked',
  authenticate,
  asyncHandler(async (req, res) => {
    const currentUser = req.user;

    // Get user with populated blocked users
    const userWithBlocked = await User.findById(currentUser._id)
      .populate({
        path: 'blockedUsers.user',
        select: 'name username avatar',
      });

    res.json({
      success: true,
      data: {
        blockedUsers: userWithBlocked.blockedUsers,
      },
    });
  })
);

// @route   POST /api/contacts/search
// @desc    Search for users to add as contacts
// @access  Private
router.post('/search',
  authenticate,
  requireVerification('either'),
  body('query').trim().isLength({ min: 2, max: 50 }).withMessage('Search query must be 2-50 characters'),
  body('limit').optional().isInt({ min: 1, max: 20 }).withMessage('Limit must be 1-20'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { query, limit = 10 } = req.body;
    const currentUserId = req.user._id;

    // Check cache first
    const cacheKey = `user_search:${currentUserId}:${query}:${limit}`;
    const cachedResult = await redisUtils.get(cacheKey);
    
    if (cachedResult) {
      return res.json({
        success: true,
        data: cachedResult,
        cached: true,
      });
    }

    // Search users
    const users = await User.searchUsers(query, currentUserId, limit);

    // Filter out blocked users and users who blocked current user
    const availableUsers = [];
    for (const user of users) {
      // Check if current user blocked this user
      const isBlocked = req.user.isUserBlocked(user._id);
      
      // Check if this user blocked current user
      const hasBlockedCurrentUser = user.isUserBlocked(currentUserId);
      
      if (!isBlocked && !hasBlockedCurrentUser) {
        availableUsers.push({
          _id: user._id,
          name: user.name,
          username: user.username,
          avatar: user.avatar,
          bio: user.bio,
          status: user.status,
          isOnline: user.isOnline,
          lastSeen: user.lastSeen,
          isContact: req.user.contacts.some(contact => 
            contact.user.toString() === user._id.toString()
          ),
        });
      }
    }

    const result = {
      users: availableUsers,
      query,
    };

    // Cache the result for 2 minutes
    await redisUtils.setex(cacheKey, 120, result);

    res.json({
      success: true,
      data: result,
    });
  })
);

// @route   POST /api/contacts/start-chat
// @desc    Start a chat with a contact
// @access  Private
router.post('/start-chat',
  authenticate,
  body('userId').isMongoId().withMessage('Valid user ID required'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { userId } = req.body;
    const currentUserId = req.user._id;

    // Check if user exists
    const otherUser = await User.findById(userId);
    if (!otherUser || !otherUser.isActive || otherUser.isDeleted) {
      throw notFoundError('User not found');
    }

    // Check if trying to chat with self
    if (userId === currentUserId.toString()) {
      throw validationError('Cannot start chat with yourself');
    }

    // Check if either user has blocked the other
    if (req.user.isUserBlocked(userId) || otherUser.isUserBlocked(currentUserId)) {
      throw validationError('Cannot start chat with this user');
    }

    // Check if private chat already exists
    let chat = await Chat.findPrivateChat(currentUserId, userId);

    if (!chat) {
      // Create new private chat
      chat = await Chat.createPrivateChat(currentUserId, userId);
      await chat.populate('participants.user', 'name username avatar isOnline lastSeen');
    }

    res.json({
      success: true,
      message: 'Chat started successfully',
      data: {
        chat,
      },
    });
  })
);

module.exports = router;