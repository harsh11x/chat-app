const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { sendOTP } = require('../services/otpService');
const router = express.Router();

// Rate limiting for OTP requests
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 OTP requests per windowMs
  message: {
    success: false,
    message: 'Too many OTP requests, please try again later.'
  }
});

// Rate limiting for OTP verification
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 verification attempts per windowMs
  message: {
    success: false,
    message: 'Too many verification attempts, please try again later.'
  }
});

/**
 * @route   POST /api/auth/send-otp
 * @desc    Send OTP to phone number
 * @access  Public
 */
router.post('/send-otp', 
  otpLimiter,
  [
    body('phoneNumber')
      .isMobilePhone()
      .withMessage('Please provide a valid phone number'),
    body('countryCode')
      .notEmpty()
      .withMessage('Country code is required')
  ],
  async (req, res) => {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { phoneNumber, countryCode } = req.body;
      const fullPhoneNumber = countryCode + phoneNumber;

      // Check if user exists
      let user = await User.findByPhoneNumber(fullPhoneNumber);
      
      if (!user) {
        // Create new user
        user = new User({
          phoneNumber,
          countryCode,
          fullPhoneNumber,
          displayName: phoneNumber, // Temporary, will be updated during signup
          isPhoneVerified: false
        });
      }

      // Check OTP rate limiting per user
      if (user.lastOtpSent) {
        const timeSinceLastOTP = Date.now() - user.lastOtpSent.getTime();
        const oneMinute = 60 * 1000;
        
        if (timeSinceLastOTP < oneMinute) {
          return res.status(429).json({
            success: false,
            message: 'Please wait before requesting another OTP',
            retryAfter: Math.ceil((oneMinute - timeSinceLastOTP) / 1000)
          });
        }
      }

      // Generate and save OTP
      const otp = user.generateOTP();
      await user.save();

      // Send OTP via SMS
      const otpSent = await sendOTP(fullPhoneNumber, otp);
      
      if (!otpSent) {
        return res.status(500).json({
          success: false,
          message: 'Failed to send OTP. Please try again.'
        });
      }

      res.status(200).json({
        success: true,
        message: 'OTP sent successfully',
        data: {
          phoneNumber: fullPhoneNumber,
          expiresIn: 300, // 5 minutes
          isNewUser: !user.isPhoneVerified
        }
      });

    } catch (error) {
      console.error('Send OTP error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

/**
 * @route   POST /api/auth/verify-otp
 * @desc    Verify OTP and authenticate user
 * @access  Public
 */
router.post('/verify-otp',
  verifyLimiter,
  [
    body('phoneNumber')
      .isMobilePhone()
      .withMessage('Please provide a valid phone number'),
    body('otp')
      .isLength({ min: 6, max: 6 })
      .isNumeric()
      .withMessage('OTP must be 6 digits')
  ],
  async (req, res) => {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { phoneNumber, otp } = req.body;

      // Find user
      const user = await User.findByPhoneNumber(phoneNumber);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found. Please request OTP first.'
        });
      }

      // Check OTP attempts
      if (user.otpAttempts >= 5) {
        return res.status(429).json({
          success: false,
          message: 'Too many failed attempts. Please request a new OTP.'
        });
      }

      // Check if OTP is valid
      if (!user.isOTPValid()) {
        return res.status(400).json({
          success: false,
          message: 'OTP has expired. Please request a new one.'
        });
      }

      // Verify OTP
      const isOTPValid = await user.compareOTP(otp);
      if (!isOTPValid) {
        user.otpAttempts += 1;
        await user.save();
        
        return res.status(400).json({
          success: false,
          message: 'Invalid OTP. Please try again.',
          attemptsLeft: 5 - user.otpAttempts
        });
      }

      // OTP is valid - clear OTP data and verify phone
      user.isPhoneVerified = true;
      user.otpCode = undefined;
      user.otpExpiry = undefined;
      user.otpAttempts = 0;
      await user.save();

      // Generate JWT token
      const token = jwt.sign(
        { 
          userId: user._id,
          phoneNumber: user.fullPhoneNumber 
        },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '30d' }
      );

      // Update user online status
      await user.setOnlineStatus(true);

      res.status(200).json({
        success: true,
        message: 'Phone number verified successfully',
        data: {
          token,
          user: {
            id: user._id,
            phoneNumber: user.fullPhoneNumber,
            displayName: user.displayName,
            profilePicture: user.profilePicture,
            bio: user.bio,
            isPhoneVerified: user.isPhoneVerified,
            hasCompletedProfile: user.displayName !== user.phoneNumber
          }
        }
      });

    } catch (error) {
      console.error('Verify OTP error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

/**
 * @route   POST /api/auth/complete-profile
 * @desc    Complete user profile after phone verification
 * @access  Private
 */
router.post('/complete-profile',
  [
    body('displayName')
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Display name must be between 1 and 50 characters'),
    body('bio')
      .optional()
      .isLength({ max: 150 })
      .withMessage('Bio must be less than 150 characters'),
    body('username')
      .optional()
      .isLength({ min: 3, max: 30 })
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Username must be 3-30 characters and contain only letters, numbers, and underscores')
  ],
  async (req, res) => {
    try {
      // This would use auth middleware in a complete implementation
      const { displayName, bio, username } = req.body;
      
      // For now, we'll extract user from token manually
      const token = req.header('Authorization')?.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'No token provided'
        });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      const user = await User.findById(decoded.userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      // Check if username is already taken
      if (username) {
        const existingUser = await User.findOne({ 
          username: username.toLowerCase(),
          _id: { $ne: user._id }
        });
        
        if (existingUser) {
          return res.status(400).json({
            success: false,
            message: 'Username is already taken'
          });
        }
      }

      // Update user profile
      user.displayName = displayName;
      if (bio) user.bio = bio;
      if (username) user.username = username.toLowerCase();
      
      await user.save();

      res.status(200).json({
        success: true,
        message: 'Profile completed successfully',
        data: {
          user: {
            id: user._id,
            phoneNumber: user.fullPhoneNumber,
            displayName: user.displayName,
            username: user.username,
            bio: user.bio,
            profilePicture: user.profilePicture,
            isPhoneVerified: user.isPhoneVerified
          }
        }
      });

    } catch (error) {
      console.error('Complete profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

/**
 * @route   POST /api/auth/refresh-token
 * @desc    Refresh JWT token
 * @access  Private
 */
router.post('/refresh-token', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Generate new token
    const newToken = jwt.sign(
      { 
        userId: user._id,
        phoneNumber: user.fullPhoneNumber 
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '30d' }
    );

    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        token: newToken
      }
    });

  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
});

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.post('/logout', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const user = await User.findById(decoded.userId);
    
    if (user) {
      // Update user offline status
      await user.setOnlineStatus(false);
    }

    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
