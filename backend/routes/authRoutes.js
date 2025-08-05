const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const { redisUtils } = require('../config/redis');
const { 
  authenticate, 
  validateRefreshToken, 
  rateLimitSensitive,
  logActivity 
} = require('../middleware/authMiddleware');
const { 
  asyncHandler, 
  validationError, 
  authError, 
  notFoundError,
  conflictError 
} = require('../middleware/errorMiddleware');
const { sendOTP, verifyOTP } = require('../services/otpService');
const { sendEmail } = require('../services/emailService');

const router = express.Router();

// Validation middleware
const validateRegistration = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('username')
    .trim()
    .isLength({ min: 3, max: 20 })
    .withMessage('Username must be between 3 and 20 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('phone')
    .matches(/^\+[1-9]\d{1,14}$/)
    .withMessage('Please provide a valid phone number with country code'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
];

const validateLogin = [
  body('identifier')
    .notEmpty()
    .withMessage('Email or phone number is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
];

const validateOTP = [
  body('identifier')
    .notEmpty()
    .withMessage('Email or phone number is required'),
  body('otp')
    .isLength({ min: 4, max: 6 })
    .withMessage('OTP must be 4-6 digits'),
];

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

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', 
  validateRegistration, 
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { name, username, email, phone, password, bio } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [
        { email },
        { phone },
        { username: username.toLowerCase() }
      ]
    });

    if (existingUser) {
      if (existingUser.email === email) {
        throw conflictError('Email already registered');
      }
      if (existingUser.phone === phone) {
        throw conflictError('Phone number already registered');
      }
      if (existingUser.username === username.toLowerCase()) {
        throw conflictError('Username already taken');
      }
    }

    // Create new user
    const user = new User({
      name: name.trim(),
      username: username.toLowerCase().trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      password,
      bio: bio?.trim() || 'Hey there! I am using ChatApp.',
    });

    await user.save();

    // Generate tokens
    const token = user.generateAuthToken();
    const refreshToken = user.generateRefreshToken();

    // Store refresh token in Redis
    await redisUtils.setex(`refresh_token:${user._id}`, 30 * 24 * 60 * 60, refreshToken);

    // Send verification OTP
    try {
      await sendOTP(phone, 'registration');
    } catch (error) {
      console.error('Failed to send registration OTP:', error);
      // Don't fail registration if OTP fails
    }

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: user.toSafeObject(),
        token,
        refreshToken,
      },
    });
  })
);

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login',
  validateLogin,
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { identifier, password } = req.body;

    // Find user by email or phone
    const user = await User.findOne({
      $or: [
        { email: identifier.toLowerCase() },
        { phone: identifier },
        { username: identifier.toLowerCase() }
      ],
      isActive: true,
      isDeleted: false,
    }).select('+password');

    if (!user) {
      throw authError('Invalid credentials');
    }

    // Check if account is locked
    if (user.isLocked) {
      throw authError('Account is temporarily locked due to multiple failed login attempts');
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      await user.incLoginAttempts();
      throw authError('Invalid credentials');
    }

    // Reset login attempts on successful login
    if (user.loginAttempts > 0) {
      await user.resetLoginAttempts();
    }

    // Generate tokens
    const token = user.generateAuthToken();
    const refreshToken = user.generateRefreshToken();

    // Store refresh token in Redis
    await redisUtils.setex(`refresh_token:${user._id}`, 30 * 24 * 60 * 60, refreshToken);

    // Update last login
    user.lastSeen = new Date();
    await user.save();

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: user.toSafeObject(),
        token,
        refreshToken,
      },
    });
  })
);

// @route   POST /api/auth/send-otp
// @desc    Send OTP for phone verification
// @access  Public
router.post('/send-otp',
  rateLimitSensitive,
  body('phone').matches(/^\+[1-9]\d{1,14}$/).withMessage('Valid phone number required'),
  body('purpose').isIn(['registration', 'login', 'password_reset']).withMessage('Valid purpose required'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { phone, purpose } = req.body;

    // For login purpose, check if user exists
    if (purpose === 'login') {
      const user = await User.findOne({ phone, isActive: true, isDeleted: false });
      if (!user) {
        throw notFoundError('Phone number not registered');
      }
    }

    // For registration purpose, check if phone is already registered
    if (purpose === 'registration') {
      const existingUser = await User.findOne({ phone });
      if (existingUser) {
        throw conflictError('Phone number already registered');
      }
    }

    // Send OTP
    await sendOTP(phone, purpose);

    res.json({
      success: true,
      message: 'OTP sent successfully',
    });
  })
);

// @route   POST /api/auth/verify-otp
// @desc    Verify OTP and login/register user
// @access  Public
router.post('/verify-otp',
  validateOTP,
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { identifier, otp, purpose, userData } = req.body;

    // Verify OTP
    const isOTPValid = await verifyOTP(identifier, otp, purpose);
    if (!isOTPValid) {
      throw authError('Invalid or expired OTP');
    }

    let user;

    if (purpose === 'registration') {
      // Create new user for registration
      if (!userData) {
        throw validationError('User data required for registration');
      }

      const { name, username, email, password, bio } = userData;

      // Check if user already exists
      const existingUser = await User.findOne({
        $or: [
          { email },
          { phone: identifier },
          { username: username.toLowerCase() }
        ]
      });

      if (existingUser) {
        throw conflictError('User already exists');
      }

      user = new User({
        name: name.trim(),
        username: username.toLowerCase().trim(),
        email: email.toLowerCase().trim(),
        phone: identifier,
        password,
        bio: bio?.trim() || 'Hey there! I am using ChatApp.',
        isPhoneVerified: true,
      });

      await user.save();
    } else {
      // Find existing user for login
      user = await User.findOne({
        $or: [
          { email: identifier.toLowerCase() },
          { phone: identifier }
        ],
        isActive: true,
        isDeleted: false,
      });

      if (!user) {
        throw notFoundError('User not found');
      }

      // Mark phone as verified if it was phone OTP
      if (identifier.startsWith('+') && !user.isPhoneVerified) {
        user.isPhoneVerified = true;
        await user.save();
      }
    }

    // Generate tokens
    const token = user.generateAuthToken();
    const refreshToken = user.generateRefreshToken();

    // Store refresh token in Redis
    await redisUtils.setex(`refresh_token:${user._id}`, 30 * 24 * 60 * 60, refreshToken);

    res.json({
      success: true,
      message: purpose === 'registration' ? 'Registration successful' : 'Login successful',
      data: {
        user: user.toSafeObject(),
        token,
        refreshToken,
      },
    });
  })
);

// @route   POST /api/auth/refresh-token
// @desc    Refresh access token
// @access  Public
router.post('/refresh-token',
  validateRefreshToken,
  asyncHandler(async (req, res) => {
    const { user, refreshToken } = req;

    // Check if refresh token exists in Redis
    const storedToken = await redisUtils.get(`refresh_token:${user._id}`);
    if (!storedToken || storedToken !== refreshToken) {
      throw authError('Invalid refresh token');
    }

    // Generate new tokens
    const newToken = user.generateAuthToken();
    const newRefreshToken = user.generateRefreshToken();

    // Update refresh token in Redis
    await redisUtils.setex(`refresh_token:${user._id}`, 30 * 24 * 60 * 60, newRefreshToken);

    // Blacklist old refresh token
    await redisUtils.setex(`refresh_blacklist:${refreshToken}`, 24 * 60 * 60, true);

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        token: newToken,
        refreshToken: newRefreshToken,
      },
    });
  })
);

// @route   POST /api/auth/logout
// @desc    Logout user
// @access  Private
router.post('/logout',
  authenticate,
  logActivity('logout'),
  asyncHandler(async (req, res) => {
    const { user, token } = req;
    const { refreshToken } = req.body;

    // Blacklist access token
    await redisUtils.setex(`blacklist:${token}`, 24 * 60 * 60, true);

    // Blacklist refresh token if provided
    if (refreshToken) {
      await redisUtils.setex(`refresh_blacklist:${refreshToken}`, 24 * 60 * 60, true);
    }

    // Remove refresh token from Redis
    await redisUtils.del(`refresh_token:${user._id}`);

    // Update user online status
    await user.updateOnlineStatus(false);

    res.json({
      success: true,
      message: 'Logout successful',
    });
  })
);

// @route   POST /api/auth/forgot-password
// @desc    Send password reset OTP
// @access  Public
router.post('/forgot-password',
  rateLimitSensitive,
  body('identifier').notEmpty().withMessage('Email or phone number required'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { identifier } = req.body;

    // Find user
    const user = await User.findOne({
      $or: [
        { email: identifier.toLowerCase() },
        { phone: identifier }
      ],
      isActive: true,
      isDeleted: false,
    });

    if (!user) {
      // Don't reveal if user exists or not
      return res.json({
        success: true,
        message: 'If the account exists, a password reset code has been sent',
      });
    }

    // Send OTP
    if (identifier.includes('@')) {
      // Send email OTP
      await sendOTP(user.email, 'password_reset');
    } else {
      // Send SMS OTP
      await sendOTP(user.phone, 'password_reset');
    }

    res.json({
      success: true,
      message: 'Password reset code sent successfully',
    });
  })
);

// @route   POST /api/auth/reset-password
// @desc    Reset password with OTP
// @access  Public
router.post('/reset-password',
  body('identifier').notEmpty().withMessage('Email or phone number required'),
  body('otp').isLength({ min: 4, max: 6 }).withMessage('Valid OTP required'),
  body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { identifier, otp, newPassword } = req.body;

    // Verify OTP
    const isOTPValid = await verifyOTP(identifier, otp, 'password_reset');
    if (!isOTPValid) {
      throw authError('Invalid or expired OTP');
    }

    // Find user
    const user = await User.findOne({
      $or: [
        { email: identifier.toLowerCase() },
        { phone: identifier }
      ],
      isActive: true,
      isDeleted: false,
    });

    if (!user) {
      throw notFoundError('User not found');
    }

    // Update password
    user.password = newPassword;
    await user.save();

    // Reset login attempts
    await user.resetLoginAttempts();

    res.json({
      success: true,
      message: 'Password reset successfully',
    });
  })
);

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me',
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

// @route   POST /api/auth/verify-email
// @desc    Send email verification
// @access  Private
router.post('/verify-email',
  authenticate,
  rateLimitSensitive,
  asyncHandler(async (req, res) => {
    const { user } = req;

    if (user.isEmailVerified) {
      return res.json({
        success: true,
        message: 'Email is already verified',
      });
    }

    // Send verification email
    await sendOTP(user.email, 'email_verification');

    res.json({
      success: true,
      message: 'Verification email sent successfully',
    });
  })
);

// @route   POST /api/auth/confirm-email
// @desc    Confirm email verification
// @access  Private
router.post('/confirm-email',
  authenticate,
  body('otp').isLength({ min: 4, max: 6 }).withMessage('Valid OTP required'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { user } = req;
    const { otp } = req.body;

    // Verify OTP
    const isOTPValid = await verifyOTP(user.email, otp, 'email_verification');
    if (!isOTPValid) {
      throw authError('Invalid or expired OTP');
    }

    // Mark email as verified
    user.isEmailVerified = true;
    await user.save();

    res.json({
      success: true,
      message: 'Email verified successfully',
    });
  })
);

module.exports = router;