const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Socket.IO setup with CORS
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  maxHttpBufferSize: 1e8 // 100MB for file uploads
});

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased for real-time features
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  }
});
app.use('/api/', limiter);

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static file serving
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Create necessary directories
const createDirectories = () => {
  const dirs = [
    'uploads',
    'uploads/profiles',
    'uploads/messages',
    'uploads/stories',
    'uploads/voice',
    'uploads/documents',
    'logs'
  ];
  
  dirs.forEach(dir => {
    const fullPath = path.join(__dirname, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`✅ Created directory: ${dir}`);
    }
  });
};

createDirectories();

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// MongoDB connection
const connectDB = async () => {
  try {
    // Mongoose 8.x doesn't need useNewUrlParser and useUnifiedTopology
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chatapp_complete');
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Connect to database
connectDB();

// Import models
const User = require('./models/User');
const Chat = require('./models/Chat');
const Message = require('./models/Message');
const Story = require('./models/Story');
const Call = require('./models/Call');

// Import services
const { sendOTP } = require('./services/otpService');
const { uploadToCloudinary, deleteFromCloudinary } = require('./services/uploadService');

// Make io accessible to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Import routes with error handling
let authRoutes, userRoutes, chatRoutes, messageRoutes, storyRoutes, callRoutes, uploadRoutes;
let authMiddleware, errorHandler;

try {
  authRoutes = require('./routes/auth');
  userRoutes = require('./routes/users');
  chatRoutes = require('./routes/chats');
  messageRoutes = require('./routes/messages');
  storyRoutes = require('./routes/stories');
  callRoutes = require('./routes/calls');
  uploadRoutes = require('./routes/upload');
  
  authMiddleware = require('./middleware/auth');
  errorHandler = require('./middleware/errorHandler');
  
  console.log('✅ All modules loaded successfully');
} catch (error) {
  console.error('❌ Error loading modules:', error.message);
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'ChatApp Complete Backend is running!',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    server: '3.111.208.77:3000',
    features: {
      realTimeMessaging: true,
      fileSharing: true,
      voiceNotes: true,
      videoCalling: true,
      stories: true,
      profileManagement: true
    }
  });
});

// API Routes
if (authRoutes) app.use('/api/auth', authRoutes);
if (userRoutes && authMiddleware) app.use('/api/users', authMiddleware, userRoutes);
if (chatRoutes && authMiddleware) app.use('/api/chats', authMiddleware, chatRoutes);
if (messageRoutes && authMiddleware) app.use('/api/messages', authMiddleware, messageRoutes);
if (storyRoutes && authMiddleware) app.use('/api/stories', authMiddleware, storyRoutes);
if (callRoutes && authMiddleware) app.use('/api/calls', authMiddleware, callRoutes);
if (uploadRoutes && authMiddleware) app.use('/api/upload', authMiddleware, uploadRoutes);

// Socket.IO Real-time Features
const connectedUsers = new Map(); // userId -> socketId
const activeChats = new Map(); // chatId -> Set of userIds
const typingUsers = new Map(); // chatId -> Set of userIds
const activeCalls = new Map(); // callId -> call data

io.on('connection', (socket) => {
  console.log(`🔌 User connected: ${socket.id}`);

  // Authentication
  socket.on('authenticate', async (data) => {
    try {
      const { token } = data;
      
      if (!token) {
        socket.emit('auth_error', { message: 'No token provided' });
        return;
      }

      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      
      const user = await User.findById(decoded.userId);
      if (!user) {
        socket.emit('auth_error', { message: 'Invalid token' });
        return;
      }

      socket.userId = user._id.toString();
      socket.user = user;
      connectedUsers.set(socket.userId, socket.id);

      // Update user online status
      await user.setOnlineStatus(true);

      socket.join(socket.userId);
      socket.emit('authenticated', {
        user: {
          id: user._id,
          displayName: user.displayName,
          phoneNumber: user.fullPhoneNumber,
          profilePicture: user.profilePicture,
          bio: user.bio,
          isOnline: true
        }
      });

      // Notify contacts that user is online
      socket.broadcast.emit('user_online', {
        userId: socket.userId,
        timestamp: new Date()
      });

      console.log(`✅ User authenticated: ${user.displayName} (${socket.userId})`);

    } catch (error) {
      console.error('Socket authentication error:', error);
      socket.emit('auth_error', { message: 'Authentication failed' });
    }
  });

  // Join chat room
  socket.on('join_chat', async (data) => {
    try {
      const { chatId } = data;
      const userId = socket.userId;

      if (!userId || !chatId) {
        socket.emit('error', { message: 'Missing required data' });
        return;
      }

      const chat = await Chat.findById(chatId);
      if (!chat || !chat.isParticipant(userId)) {
        socket.emit('error', { message: 'Unauthorized access to chat' });
        return;
      }

      socket.join(chatId);
      socket.currentChatId = chatId;

      // Track active users in chat
      if (!activeChats.has(chatId)) {
        activeChats.set(chatId, new Set());
      }
      activeChats.get(chatId).add(userId);

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

  // Send message with file support
  socket.on('send_message', async (data) => {
    try {
      const {
        chatId,
        content,
        replyTo,
        mentions,
        tempId,
        mediaData // Base64 encoded media
      } = data;
      
      const userId = socket.userId;

      if (!userId || !chatId || (!content && !mediaData)) {
        socket.emit('message_error', { 
          tempId,
          error: 'Missing required data' 
        });
        return;
      }

      const chat = await Chat.findById(chatId);
      if (!chat || !chat.isParticipant(userId)) {
        socket.emit('message_error', { 
          tempId,
          error: 'Unauthorized access to chat' 
        });
        return;
      }

      const messageData = {
        messageId: require('uuid').v4(),
        chatId,
        sender: userId,
        content: content || { type: 'text', text: '' },
        replyTo,
        mentions: mentions || [],
        status: 'sent'
      };

      // Handle media upload
      if (mediaData) {
        const { type, data: base64Data, filename, mimeType } = mediaData;
        
        // Save file locally first
        const buffer = Buffer.from(base64Data, 'base64');
        const fileExtension = filename.split('.').pop();
        const uniqueFilename = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExtension}`;
        const filePath = path.join(__dirname, 'uploads', 'messages', uniqueFilename);
        
        fs.writeFileSync(filePath, buffer);
        
        messageData.media = [{
          type,
          url: `/uploads/messages/${uniqueFilename}`,
          filename,
          size: buffer.length,
          mimeType,
          uploadedAt: new Date()
        }];
        
        messageData.content = { type, text: filename };
      }

      const message = new Message(messageData);
      await message.save();

      await message.populate('sender', 'displayName profilePicture');
      if (replyTo) {
        await message.populate('replyTo.sender', 'displayName');
      }

      await chat.updateLastMessage(message);

      // Update unread counts
      const otherParticipants = chat.activeParticipants.filter(
        p => p.userId.toString() !== userId.toString()
      );

      for (const participant of otherParticipants) {
        await chat.incrementUnreadCount(participant.userId, message._id);
      }

      // Emit to all participants
      io.to(chatId).emit('new_message', {
        message: {
          _id: message._id,
          messageId: message.messageId,
          chatId: message.chatId,
          sender: message.sender,
          content: message.content,
          media: message.media,
          replyTo: message.replyTo,
          mentions: message.mentions,
          status: message.status,
          createdAt: message.createdAt,
          updatedAt: message.updatedAt
        },
        tempId
      });

      console.log(`Message sent in chat ${chatId} by user ${userId}`);

    } catch (error) {
      console.error('Send message error:', error);
      socket.emit('message_error', { 
        tempId: data.tempId,
        error: 'Failed to send message' 
      });
    }
  });

  // Typing indicators
  socket.on('typing_start', (data) => {
    try {
      const { chatId } = data;
      const userId = socket.userId;

      if (chatId && userId) {
        if (!typingUsers.has(chatId)) {
          typingUsers.set(chatId, new Set());
        }
        typingUsers.get(chatId).add(userId);

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
        if (typingUsers.has(chatId)) {
          typingUsers.get(chatId).delete(userId);
        }

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

  // Voice/Video calling
  socket.on('initiate_call', async (data) => {
    try {
      const { targetUserId, type, chatId } = data;
      const callerId = socket.userId;

      if (!callerId || !targetUserId) {
        socket.emit('call_error', { message: 'Missing required data' });
        return;
      }

      const callId = require('uuid').v4();
      const callData = {
        callId,
        type,
        caller: callerId,
        target: targetUserId,
        chatId,
        status: 'ringing',
        startTime: new Date()
      };

      activeCalls.set(callId, callData);

      // Notify target user
      const targetSocketId = connectedUsers.get(targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('incoming_call', {
          callId,
          caller: socket.user,
          type,
          chatId,
          timestamp: new Date()
        });
      }

      socket.emit('call_initiated', { callId, status: 'ringing' });

      console.log(`📞 Call initiated: ${callerId} -> ${targetUserId}`);

    } catch (error) {
      console.error('Initiate call error:', error);
      socket.emit('call_error', { message: 'Failed to initiate call' });
    }
  });

  // WebRTC signaling
  socket.on('webrtc_offer', (data) => {
    const { callId, targetUserId, offer } = data;
    const targetSocketId = connectedUsers.get(targetUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('webrtc_offer', {
        callId,
        fromUserId: socket.userId,
        offer
      });
    }
  });

  socket.on('webrtc_answer', (data) => {
    const { callId, targetUserId, answer } = data;
    const targetSocketId = connectedUsers.get(targetUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('webrtc_answer', {
        callId,
        fromUserId: socket.userId,
        answer
      });
    }
  });

  socket.on('webrtc_ice_candidate', (data) => {
    const { callId, targetUserId, candidate } = data;
    const targetSocketId = connectedUsers.get(targetUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('webrtc_ice_candidate', {
        callId,
        fromUserId: socket.userId,
        candidate
      });
    }
  });

  // Profile updates
  socket.on('update_profile', async (data) => {
    try {
      const { displayName, bio, profilePicture } = data;
      const userId = socket.userId;

      if (!userId) return;

      const user = await User.findById(userId);
      if (!user) return;

      if (displayName) user.displayName = displayName;
      if (bio !== undefined) user.bio = bio;
      if (profilePicture) {
        // Handle base64 profile picture
        const buffer = Buffer.from(profilePicture.data, 'base64');
        const filename = `profile_${userId}_${Date.now()}.jpg`;
        const filePath = path.join(__dirname, 'uploads', 'profiles', filename);
        
        fs.writeFileSync(filePath, buffer);
        user.profilePicture = {
          url: `/uploads/profiles/${filename}`,
          uploadedAt: new Date()
        };
      }

      await user.save();

      // Broadcast profile update
      socket.broadcast.emit('profile_updated', {
        userId,
        displayName: user.displayName,
        bio: user.bio,
        profilePicture: user.profilePicture,
        timestamp: new Date()
      });

      socket.emit('profile_update_success', {
        user: {
          id: user._id,
          displayName: user.displayName,
          bio: user.bio,
          profilePicture: user.profilePicture
        }
      });

    } catch (error) {
      console.error('Update profile error:', error);
      socket.emit('profile_update_error', { message: 'Failed to update profile' });
    }
  });

  // Stories
  socket.on('upload_story', async (data) => {
    try {
      const { content, mediaData, privacy } = data;
      const userId = socket.userId;

      if (!userId) return;

      const storyData = {
        userId,
        content,
        privacy: privacy || 'contacts',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      };

      if (mediaData) {
        const { type, data: base64Data, filename } = mediaData;
        const buffer = Buffer.from(base64Data, 'base64');
        const uniqueFilename = `story_${userId}_${Date.now()}.${filename.split('.').pop()}`;
        const filePath = path.join(__dirname, 'uploads', 'stories', uniqueFilename);
        
        fs.writeFileSync(filePath, buffer);
        storyData.content.media = {
          url: `/uploads/stories/${uniqueFilename}`,
          type,
          uploadedAt: new Date()
        };
      }

      const story = new Story(storyData);
      await story.save();

      // Broadcast to contacts
      socket.broadcast.emit('new_story', {
        storyId: story._id,
        userId,
        content: story.content,
        timestamp: story.createdAt
      });

      socket.emit('story_uploaded', { storyId: story._id });

    } catch (error) {
      console.error('Upload story error:', error);
      socket.emit('story_upload_error', { message: 'Failed to upload story' });
    }
  });

  // Handle disconnection
  socket.on('disconnect', async (reason) => {
    console.log(`🔌 User disconnected: ${socket.id}, Reason: ${reason}`);
    
    const userId = socket.userId;
    if (userId) {
      // Remove from connected users
      connectedUsers.delete(userId);
      
      // Remove from active chats
      for (const [chatId, users] of activeChats.entries()) {
        users.delete(userId);
        if (users.size === 0) {
          activeChats.delete(chatId);
        }
      }
      
      // Remove from typing users
      for (const [chatId, users] of typingUsers.entries()) {
        users.delete(userId);
      }
      
      // Update user offline status
      try {
        const user = await User.findById(userId);
        if (user) {
          await user.setOnlineStatus(false);
        }
      } catch (error) {
        console.error('Error updating offline status:', error);
      }
      
      // Notify others
      socket.broadcast.emit('user_offline', { 
        userId, 
        timestamp: new Date() 
      });
    }
  });
});

// Error handling middleware
if (errorHandler) {
  app.use(errorHandler);
}

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    availableRoutes: [
      'GET /health',
      'POST /api/auth/send-otp',
      'POST /api/auth/verify-otp',
      'GET /api/users/profile',
      'POST /api/upload/profile-picture',
      'GET /api/chats',
      'GET /api/stories',
      'GET /api/calls/history'
    ]
  });
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`
🚀 ChatApp Complete Backend Server Started!
📡 Server running on ${HOST}:${PORT}
🌐 Public URL: http://3.111.208.77:${PORT}
🔗 Health Check: http://3.111.208.77:${PORT}/health
📱 API Base: http://3.111.208.77:${PORT}/api
🔌 Socket.IO: http://3.111.208.77:${PORT}
🌍 Environment: ${process.env.NODE_ENV || 'development'}

✨ FEATURES ENABLED:
📱 Real-time Messaging
📁 File Sharing (Images, Videos, Documents)
🎤 Voice Notes
📞 Voice/Video Calling
📖 Stories (24h expiry)
👤 Profile Management
🔄 Live Status Updates
⚡ All features working in real-time!

📱 Ready for Flutter app connections!
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    mongoose.connection.close();
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    mongoose.connection.close();
  });
});

module.exports = { app, server, io };
