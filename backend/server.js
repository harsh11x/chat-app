const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
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
  transports: ['websocket', 'polling']
});

// Security middleware
app.use(helmet());
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// MongoDB connection
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chatapp', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Connect to database
connectDB();

// Make io accessible to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Import routes (with error handling)
let authRoutes, userRoutes, chatRoutes, messageRoutes, groupRoutes, storyRoutes, callRoutes;
let authMiddleware, errorHandler;
let socketAuth, socketChat, socketCall, socketStatus;

try {
  authRoutes = require('./routes/auth');
  userRoutes = require('./routes/users');
  chatRoutes = require('./routes/chats');
  messageRoutes = require('./routes/messages');
  groupRoutes = require('./routes/groups');
  storyRoutes = require('./routes/stories');
  callRoutes = require('./routes/calls');
  
  authMiddleware = require('./middleware/auth');
  errorHandler = require('./middleware/errorHandler');
  
  socketAuth = require('./socket/auth');
  socketChat = require('./socket/chat');
  socketCall = require('./socket/call');
  socketStatus = require('./socket/status');
  
  console.log('✅ All modules loaded successfully');
} catch (error) {
  console.error('❌ Error loading modules:', error.message);
}

// Health check endpoint (before auth middleware)
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'ChatApp Backend is running!',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    server: '3.111.208.77:3000'
  });
});

// API Routes
if (authRoutes) app.use('/api/auth', authRoutes);
if (userRoutes && authMiddleware) app.use('/api/users', authMiddleware, userRoutes);
if (chatRoutes && authMiddleware) app.use('/api/chats', authMiddleware, chatRoutes);
if (messageRoutes && authMiddleware) app.use('/api/messages', authMiddleware, messageRoutes);
if (groupRoutes && authMiddleware) app.use('/api/groups', authMiddleware, groupRoutes);
if (storyRoutes && authMiddleware) app.use('/api/stories', authMiddleware, storyRoutes);
if (callRoutes && authMiddleware) app.use('/api/calls', authMiddleware, callRoutes);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`🔌 User connected: ${socket.id}`);

  // Socket handlers (with error handling)
  try {
    if (socketAuth) socketAuth(io, socket);
    if (socketChat) socketChat(io, socket);
    if (socketCall) socketCall(io, socket);
    if (socketStatus) socketStatus(io, socket);
  } catch (error) {
    console.error('Socket handler error:', error);
  }

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log(`🔌 User disconnected: ${socket.id}, Reason: ${reason}`);
    // Update user status to offline
    if (socket.userId) {
      socket.broadcast.emit('user_offline', { userId: socket.userId });
    }
  });

  // Handle errors
  socket.on('error', (error) => {
    console.error('Socket error:', error);
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
      'GET /api/chats',
      'GET /api/calls/history'
    ]
  });
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`
🚀 ChatApp Backend Server Started!
📡 Server running on ${HOST}:${PORT}
🌐 Public URL: http://3.111.208.77:${PORT}
🔗 Health Check: http://3.111.208.77:${PORT}/health
📱 API Base: http://3.111.208.77:${PORT}/api
🔌 Socket.IO: http://3.111.208.77:${PORT}
🌍 Environment: ${process.env.NODE_ENV || 'development'}
📊 Socket.IO enabled for real-time communication
🔒 Security middleware active
📱 Ready for Flutter app connections!
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    mongoose.connection.close();
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    mongoose.connection.close();
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  process.exit(1);
});

module.exports = { app, server, io };
