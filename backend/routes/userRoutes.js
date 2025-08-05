const express = require('express');
const { body, query, validationResult } = require('express-validator');
const User = require('../models/User');
const { authenticate, requireVerification } = require('../middleware/authMiddleware');
const { asyncHandler, validationError, notFoundError } = require('../middleware/errorMiddleware');

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

// @route   GET /api/users/profile
// @desc    Get current user profile
// @access  Private
router.get('/profile',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: {
        user: req.user.toSafeObject(),
      },
    });
  })
);

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private
router.put('/profile',
  authenticate,
  body('name').optional().trim().isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 characters'),
  body('bio').optional().trim().isLength({ max: 150 }).withMessage('Bio cannot exceed 150 characters'),
  body('status').optional().isIn(['Available', 'Busy', 'Away', 'Invisible']).withMessage('Invalid status'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { name, bio, status } = req.body;
    const user = req.user;

    // Update fields if provided
    if (name !== undefined) user.name = name;
    if (bio !== undefined) user.bio = bio;
    if (status !== undefined) user.status = status;

    await user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: user.toSafeObject(),
      },
    });
  })
);

// @route   PUT /api/users/privacy
// @desc    Update privacy settings
// @access  Private
router.put('/privacy',
  authenticate,
  body('lastSeen').optional().isIn(['everyone', 'contacts', 'nobody']).withMessage('Invalid lastSeen setting'),
  body('profilePhoto').optional().isIn(['everyone', 'contacts', 'nobody']).withMessage('Invalid profilePhoto setting'),
  body('status').optional().isIn(['everyone', 'contacts', 'nobody']).withMessage('Invalid status setting'),
  body('readReceipts').optional().isBoolean().withMessage('readReceipts must be boolean'),
  body('groupInvites').optional().isIn(['everyone', 'contacts', 'nobody']).withMessage('Invalid groupInvites setting'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { lastSeen, profilePhoto, status, readReceipts, groupInvites } = req.body;
    const user = req.user;

    // Update privacy settings
    if (lastSeen !== undefined) user.privacy.lastSeen = lastSeen;
    if (profilePhoto !== undefined) user.privacy.profilePhoto = profilePhoto;
    if (status !== undefined) user.privacy.status = status;
    if (readReceipts !== undefined) user.privacy.readReceipts = readReceipts;
    if (groupInvites !== undefined) user.privacy.groupInvites = groupInvites;

    await user.save();

    res.json({
      success: true,
      message: 'Privacy settings updated successfully',
      data: {
        privacy: user.privacy,
      },
    });
  })
);

// @route   PUT /api/users/notifications
// @desc    Update notification settings
// @access  Private
router.put('/notifications',
  authenticate,
  body('messageNotifications').optional().isBoolean().withMessage('messageNotifications must be boolean'),
  body('groupNotifications').optional().isBoolean().withMessage('groupNotifications must be boolean'),
  body('callNotifications').optional().isBoolean().withMessage('callNotifications must be boolean'),
  body('emailNotifications').optional().isBoolean().withMessage('emailNotifications must be boolean'),
  body('pushNotifications').optional().isBoolean().withMessage('pushNotifications must be boolean'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { 
      messageNotifications, 
      groupNotifications, 
      callNotifications, 
      emailNotifications, 
      pushNotifications 
    } = req.body;
    const user = req.user;

    // Update notification settings
    if (messageNotifications !== undefined) user.notifications.messageNotifications = messageNotifications;
    if (groupNotifications !== undefined) user.notifications.groupNotifications = groupNotifications;
    if (callNotifications !== undefined) user.notifications.callNotifications = callNotifications;
    if (emailNotifications !== undefined) user.notifications.emailNotifications = emailNotifications;
    if (pushNotifications !== undefined) user.notifications.pushNotifications = pushNotifications;

    await user.save();

    res.json({
      success: true,
      message: 'Notification settings updated successfully',
      data: {
        notifications: user.notifications,
      },
    });
  })
);

// @route   POST /api/users/device
// @desc    Register device for push notifications
// @access  Private
router.post('/device',
  authenticate,
  body('deviceId').notEmpty().withMessage('Device ID is required'),
  body('deviceType').isIn(['ios', 'android', 'web', 'desktop']).withMessage('Invalid device type'),
  body('deviceName').optional().trim().isLength({ max: 100 }).withMessage('Device name too long'),
  body('fcmToken').optional().notEmpty().withMessage('FCM token cannot be empty'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { deviceId, deviceType, deviceName, fcmToken } = req.body;
    const user = req.user;

    // Check if device already exists
    const existingDevice = user.devices.find(device => device.deviceId === deviceId);

    if (existingDevice) {
      // Update existing device
      existingDevice.deviceType = deviceType;
      existingDevice.deviceName = deviceName || existingDevice.deviceName;
      existingDevice.fcmToken = fcmToken || existingDevice.fcmToken;
      existingDevice.lastActive = new Date();
      existingDevice.isActive = true;
    } else {
      // Add new device
      user.devices.push({
        deviceId,
        deviceType,
        deviceName: deviceName || `${deviceType} Device`,
        fcmToken,
        lastActive: new Date(),
        isActive: true,
      });
    }

    await user.save();

    res.json({
      success: true,
      message: 'Device registered successfully',
      data: {
        devices: user.devices,
      },
    });
  })
);

// @route   DELETE /api/users/device/:deviceId
// @desc    Unregister device
// @access  Private
router.delete('/device/:deviceId',
  authenticate,
  asyncHandler(async (req, res) => {
    const { deviceId } = req.params;
    const user = req.user;

    // Find and deactivate device
    const device = user.devices.find(device => device.deviceId === deviceId);
    if (device) {
      device.isActive = false;
    }

    await user.save();

    res.json({
      success: true,
      message: 'Device unregistered successfully',
    });
  })
);

// @route   GET /api/users/search
// @desc    Search users
// @access  Private
router.get('/search',
  authenticate,
  requireVerification('either'),
  query('q').trim().isLength({ min: 2, max: 50 }).withMessage('Search query must be 2-50 characters'),
  query('limit').optional().isInt({ min: 1, max: 20 }).withMessage('Limit must be 1-20'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { q: query, limit = 10 } = req.query;
    const currentUserId = req.user._id;

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

    res.json({
      success: true,
      data: {
        users: availableUsers,
        query,
      },
    });
  })
);

// @route   GET /api/users/:userId
// @desc    Get user profile by ID
// @access  Private
router.get('/:userId',
  authenticate,
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    // Validate userId
    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      throw validationError('Invalid user ID');
    }

    // Find user
    const user = await User.findById(userId).select('-password');
    if (!user || !user.isActive || user.isDeleted) {
      throw notFoundError('User not found');
    }

    // Check if users have blocked each other
    const isBlocked = req.user.isUserBlocked(userId);
    const hasBlockedCurrentUser = user.isUserBlocked(currentUserId);

    if (isBlocked || hasBlockedCurrentUser) {
      throw notFoundError('User not found');
    }

    // Check privacy settings and filter data accordingly
    const isContact = req.user.contacts.some(contact => 
      contact.user.toString() === userId
    );

    const userProfile = {
      _id: user._id,
      name: user.name,
      username: user.username,
      avatar: user.avatar,
      bio: user.bio,
      createdAt: user.createdAt,
      isContact,
    };

    // Add status based on privacy settings
    if (user.privacy.status === 'everyone' || 
        (user.privacy.status === 'contacts' && isContact)) {
      userProfile.status = user.status;
    }

    // Add online status and last seen based on privacy settings
    if (user.privacy.lastSeen === 'everyone' || 
        (user.privacy.lastSeen === 'contacts' && isContact)) {
      userProfile.isOnline = user.isOnline;
      userProfile.lastSeen = user.lastSeen;
    }

    res.json({
      success: true,
      data: {
        user: userProfile,
      },
    });
  })
);

// @route   PUT /api/users/username
// @desc    Update username
// @access  Private
router.put('/username',
  authenticate,
  body('username')
    .trim()
    .isLength({ min: 3, max: 20 })
    .withMessage('Username must be 3-20 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { username } = req.body;
    const user = req.user;

    // Check if username is already taken
    const existingUser = await User.findOne({ 
      username: username.toLowerCase(),
      _id: { $ne: user._id }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Username is already taken',
      });
    }

    user.username = username.toLowerCase();
    await user.save();

    res.json({
      success: true,
      message: 'Username updated successfully',
      data: {
        username: user.username,
      },
    });
  })
);

// @route   DELETE /api/users/account
// @desc    Delete user account
// @access  Private
router.delete('/account',
  authenticate,
  body('password').notEmpty().withMessage('Password is required for account deletion'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { password } = req.body;
    const user = req.user;

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid password',
      });
    }

    // Soft delete user account
    user.isActive = false;
    user.isDeleted = true;
    user.deletedAt = new Date();
    user.email = `deleted_${Date.now()}_${user.email}`;
    user.phone = `deleted_${Date.now()}_${user.phone}`;
    user.username = `deleted_${Date.now()}_${user.username}`;

    await user.save();

    res.json({
      success: true,
      message: 'Account deleted successfully',
    });
  })
);

// @route   GET /api/users/activity/recent
// @desc    Get recent user activity
// @access  Private
router.get('/activity/recent',
  authenticate,
  asyncHandler(async (req, res) => {
    // This would typically fetch from a logging service or database
    // For now, return a placeholder response
    res.json({
      success: true,
      data: {
        activities: [
          {
            type: 'login',
            timestamp: new Date(),
            device: 'Mobile App',
            location: 'Unknown',
          },
        ],
      },
    });
  })
);

module.exports = router;