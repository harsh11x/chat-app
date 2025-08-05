const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { redisUtils } = require('../config/redis');

// Middleware to authenticate JWT token
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided or invalid format.',
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Check if token is blacklisted
    const isBlacklisted = await redisUtils.get(`blacklist:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({
        success: false,
        message: 'Token has been invalidated.',
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user exists and is active
    const user = await User.findById(decoded.id).select('-password');
    if (!user || !user.isActive || user.isDeleted) {
      return res.status(401).json({
        success: false,
        message: 'User not found or account deactivated.',
      });
    }

    // Check if account is locked
    if (user.isLocked) {
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked due to multiple failed login attempts.',
      });
    }

    // Attach user to request
    req.user = user;
    req.token = token;
    
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.',
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token has expired.',
      });
    }

    console.error('Authentication error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during authentication.',
    });
  }
};

// Middleware to authenticate socket connections
const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.substring(7);
    
    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    // Check if token is blacklisted
    const isBlacklisted = await redisUtils.get(`blacklist:${token}`);
    if (isBlacklisted) {
      return next(new Error('Authentication error: Token has been invalidated'));
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user exists and is active
    const user = await User.findById(decoded.id).select('-password');
    if (!user || !user.isActive || user.isDeleted) {
      return next(new Error('Authentication error: User not found or account deactivated'));
    }

    // Check if account is locked
    if (user.isLocked) {
      return next(new Error('Authentication error: Account is temporarily locked'));
    }

    // Attach user info to socket
    socket.userId = user._id.toString();
    socket.user = user;
    socket.token = token;
    
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return next(new Error('Authentication error: Invalid token'));
    }
    
    if (error.name === 'TokenExpiredError') {
      return next(new Error('Authentication error: Token has expired'));
    }

    console.error('Socket authentication error:', error);
    return next(new Error('Authentication error: Internal server error'));
  }
};

// Middleware to check if user is admin (for group operations)
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.',
    });
  }

  // This would be used in chat-specific contexts where we check if user is admin of a specific chat
  // The actual admin check would be done in the route handler with chat context
  next();
};

// Middleware to check if user owns the resource
const requireOwnership = (resourceField = 'userId') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    // This will be used in route handlers where we have the resource
    // The actual ownership check would be done in the route handler
    next();
  };
};

// Middleware to validate refresh token
const validateRefreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token is required.',
      });
    }

    // Check if refresh token is blacklisted
    const isBlacklisted = await redisUtils.get(`refresh_blacklist:${refreshToken}`);
    if (isBlacklisted) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token has been invalidated.',
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    
    // Check if user exists and is active
    const user = await User.findById(decoded.id).select('-password');
    if (!user || !user.isActive || user.isDeleted) {
      return res.status(401).json({
        success: false,
        message: 'User not found or account deactivated.',
      });
    }

    req.user = user;
    req.refreshToken = refreshToken;
    
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token.',
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Refresh token has expired.',
      });
    }

    console.error('Refresh token validation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during token validation.',
    });
  }
};

// Middleware to check rate limiting for sensitive operations
const rateLimitSensitive = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const ip = req.ip || req.connection.remoteAddress;
    const key = `rate_limit:sensitive:${userId || ip}`;
    
    const attempts = await redisUtils.get(key) || 0;
    const maxAttempts = 5;
    const windowMs = 15 * 60 * 1000; // 15 minutes

    if (attempts >= maxAttempts) {
      return res.status(429).json({
        success: false,
        message: 'Too many sensitive operations. Please try again later.',
      });
    }

    // Increment attempts
    await redisUtils.setex(key, windowMs / 1000, attempts + 1);
    
    next();
  } catch (error) {
    console.error('Rate limiting error:', error);
    next(); // Continue on error
  }
};

// Middleware to log user activity
const logActivity = (action) => {
  return async (req, res, next) => {
    try {
      if (req.user) {
        const activityData = {
          userId: req.user.id,
          action,
          ip: req.ip || req.connection.remoteAddress,
          userAgent: req.get('User-Agent'),
          timestamp: new Date(),
        };

        // Store activity in Redis for recent activities
        const key = `activity:${req.user.id}`;
        await redisUtils.lpush(key, activityData);
        
        // Keep only last 100 activities
        const activities = await redisUtils.lrange(key, 0, 99);
        if (activities.length > 100) {
          await redisUtils.del(key);
          await redisUtils.lpush(key, ...activities.slice(0, 100));
        }
        
        // Set expiration for activity log (30 days)
        await redisUtils.expire(key, 30 * 24 * 60 * 60);
      }
    } catch (error) {
      console.error('Activity logging error:', error);
    }
    
    next();
  };
};

// Middleware to check if user has verified phone/email
const requireVerification = (type = 'either') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    const { isEmailVerified, isPhoneVerified } = req.user;

    switch (type) {
      case 'email':
        if (!isEmailVerified) {
          return res.status(403).json({
            success: false,
            message: 'Email verification required.',
          });
        }
        break;
      case 'phone':
        if (!isPhoneVerified) {
          return res.status(403).json({
            success: false,
            message: 'Phone verification required.',
          });
        }
        break;
      case 'both':
        if (!isEmailVerified || !isPhoneVerified) {
          return res.status(403).json({
            success: false,
            message: 'Both email and phone verification required.',
          });
        }
        break;
      case 'either':
      default:
        if (!isEmailVerified && !isPhoneVerified) {
          return res.status(403).json({
            success: false,
            message: 'Email or phone verification required.',
          });
        }
        break;
    }

    next();
  };
};

module.exports = {
  authenticate,
  authenticateSocket,
  requireAdmin,
  requireOwnership,
  validateRefreshToken,
  rateLimitSensitive,
  logActivity,
  requireVerification,
};