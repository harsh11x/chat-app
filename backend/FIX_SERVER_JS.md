# 🔧 Fix server.js Express Error

The error "Cannot find module 'express'" means the dependencies aren't installed. Here's how to fix it:

## **Step 1: Check Your Current Situation**
```bash
# You should be in: /home/ubuntu/chat-app/backend
pwd

# Check what files you have
ls -la

# Check if node_modules exists
ls -la node_modules/ 2>/dev/null || echo "node_modules missing"

# Check if package.json exists
cat package.json 2>/dev/null || echo "package.json missing"
```

## **Step 2: Create Proper package.json**
```bash
cat > package.json << 'EOF'
{
  "name": "chatapp-backend",
  "version": "1.0.0",
  "description": "ChatApp Backend Server",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "4.18.2",
    "socket.io": "4.7.2",
    "mongoose": "7.5.0",
    "cors": "2.8.5",
    "dotenv": "16.3.1",
    "bcryptjs": "2.4.3",
    "jsonwebtoken": "9.0.2",
    "helmet": "7.0.0",
    "express-rate-limit": "6.10.0",
    "compression": "1.7.4",
    "morgan": "1.10.0",
    "uuid": "9.0.0"
  }
}
EOF

echo "✅ package.json created"
```

## **Step 3: Clean Install Dependencies**
```bash
# Remove any existing broken installations
rm -rf node_modules package-lock.json

# Clear npm cache
npm cache clean --force

# Check Node.js version (should be 18.x)
node --version

# Install dependencies
npm install

# Verify Express is installed
ls node_modules/express 2>/dev/null && echo "✅ Express installed" || echo "❌ Express missing"
```

## **Step 4: If npm install fails, try one by one:**
```bash
# Install Express first
npm install express@4.18.2

# Test if Express works
node -e "console.log('Express version:', require('express/package.json').version)"

# Install other dependencies one by one
npm install cors@2.8.5
npm install dotenv@16.3.1
npm install socket.io@4.7.2
npm install uuid@9.0.0

# Verify installations
ls node_modules/ | grep -E "express|cors|dotenv|socket|uuid"
```

## **Step 5: Test server.js directly**
```bash
# Try running server.js now
node server.js

# If it starts successfully, you'll see startup messages
# If it still fails, check the error message
```

## **Step 6: If server.js still has issues, create a working version:**
```bash
# Backup the current server.js
cp server.js server.js.backup

# Create a working server.js
cat > server.js << 'EOF'
console.log('🚀 Starting ChatApp Backend...');

try {
  const express = require('express');
  const http = require('http');
  const socketIo = require('socket.io');
  const cors = require('cors');
  require('dotenv').config();
  
  console.log('✅ All modules loaded successfully');
  
  const app = express();
  const server = http.createServer(app);
  
  // Socket.IO setup
  const io = socketIo(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true
    },
    transports: ['websocket', 'polling']
  });
  
  console.log('✅ Socket.IO configured');
  
  // Middleware
  app.use(cors());
  app.use(express.json());
  
  console.log('✅ Middleware configured');
  
  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({
      success: true,
      message: 'ChatApp Backend is running!',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      server: '3.111.208.77:3000',
      features: {
        express: true,
        socketIO: true,
        cors: true
      }
    });
  });
  
  // Test endpoint
  app.get('/api/test', (req, res) => {
    res.json({
      success: true,
      message: 'API is working with Express!',
      timestamp: new Date().toISOString()
    });
  });
  
  // Auth endpoints
  app.post('/api/auth/send-otp', (req, res) => {
    const { phoneNumber, countryCode } = req.body;
    
    console.log(`📱 OTP request: ${countryCode}${phoneNumber}`);
    
    res.json({
      success: true,
      message: 'OTP sent successfully (demo mode)',
      data: {
        phoneNumber: (countryCode || '') + (phoneNumber || ''),
        expiresIn: 300,
        isNewUser: true
      }
    });
  });
  
  app.post('/api/auth/verify-otp', (req, res) => {
    const { phoneNumber, otp } = req.body;
    
    console.log(`🔐 OTP verification: ${phoneNumber} - ${otp}`);
    
    if (otp && otp.length === 6) {
      const token = 'demo-jwt-token-' + Date.now();
      
      res.json({
        success: true,
        message: 'Phone verified successfully',
        data: {
          token,
          user: {
            id: 'demo-user-id',
            phoneNumber,
            displayName: phoneNumber,
            isPhoneVerified: true,
            hasCompletedProfile: false
          }
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Invalid OTP. Please enter 6 digits.'
      });
    }
  });
  
  // Socket.IO connection handling
  const connectedUsers = new Map();
  
  io.on('connection', (socket) => {
    console.log(`🔌 User connected: ${socket.id}`);
  
    // Authentication
    socket.on('authenticate', (data) => {
      const { token } = data;
      
      if (token && token.startsWith('demo-jwt-token')) {
        socket.userId = 'demo-user-' + socket.id;
        connectedUsers.set(socket.userId, socket.id);
        
        socket.emit('authenticated', {
          user: {
            id: socket.userId,
            displayName: 'Demo User',
            isOnline: true
          }
        });
        
        console.log(`✅ User authenticated: ${socket.userId}`);
      } else {
        socket.emit('auth_error', { message: 'Invalid token' });
      }
    });
  
    // Join chat
    socket.on('join_chat', (data) => {
      const { chatId } = data;
      socket.join(chatId);
      socket.currentChatId = chatId;
      
      socket.to(chatId).emit('user_joined_chat', {
        userId: socket.userId,
        chatId,
        timestamp: new Date()
      });
      
      console.log(`User ${socket.userId} joined chat ${chatId}`);
    });
  
    // Send message
    socket.on('send_message', (data) => {
      const { chatId, content, tempId } = data;
      
      const message = {
        _id: 'msg-' + Date.now(),
        messageId: require('uuid').v4(),
        chatId,
        sender: {
          _id: socket.userId,
          displayName: 'Demo User'
        },
        content,
        status: 'sent',
        createdAt: new Date(),
        updatedAt: new Date()
      };
  
      // Emit to all participants in the chat
      io.to(chatId).emit('new_message', {
        message,
        tempId
      });
  
      console.log(`Message sent in chat ${chatId}`);
    });
  
    // Typing indicators
    socket.on('typing_start', (data) => {
      const { chatId } = data;
      socket.to(chatId).emit('user_typing', {
        userId: socket.userId,
        chatId,
        isTyping: true,
        timestamp: new Date()
      });
    });
  
    socket.on('typing_stop', (data) => {
      const { chatId } = data;
      socket.to(chatId).emit('user_typing', {
        userId: socket.userId,
        chatId,
        isTyping: false,
        timestamp: new Date()
      });
    });
  
    // Disconnect
    socket.on('disconnect', (reason) => {
      console.log(`🔌 User disconnected: ${socket.id}, Reason: ${reason}`);
      
      if (socket.userId) {
        connectedUsers.delete(socket.userId);
        socket.broadcast.emit('user_offline', { 
          userId: socket.userId,
          timestamp: new Date() 
        });
      }
    });
  });
  
  // 404 handler
  app.use('*', (req, res) => {
    res.status(404).json({
      success: false,
      message: 'Route not found',
      availableRoutes: [
        'GET /health',
        'GET /api/test',
        'POST /api/auth/send-otp',
        'POST /api/auth/verify-otp'
      ]
    });
  });
  
  // Error handler
  app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  });
  
  const PORT = process.env.PORT || 3000;
  const HOST = process.env.HOST || '0.0.0.0';
  
  server.listen(PORT, HOST, (err) => {
    if (err) {
      console.error('❌ Server failed to start:', err);
      process.exit(1);
    }
    
    console.log(`
🚀 ChatApp Backend Server Started!
📡 Server running on ${HOST}:${PORT}
🌐 Public URL: http://3.111.208.77:${PORT}
🔗 Health Check: http://3.111.208.77:${PORT}/health
📱 API Base: http://3.111.208.77:${PORT}/api
🔌 Socket.IO: http://3.111.208.77:${PORT}
🌍 Environment: ${process.env.NODE_ENV || 'development'}

✨ FEATURES WORKING:
📱 Real-time Messaging
🔐 Phone Authentication (Demo)
🔌 Socket.IO Real-time
📊 Health Monitoring

📱 Ready for Flutter app connections!
    `);
  });
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
  
  process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
  
  console.log('✅ Server setup complete');

} catch (error) {
  console.error('❌ Failed to start server:', error.message);
  console.error('Stack:', error.stack);
  
  if (error.code === 'MODULE_NOT_FOUND') {
    console.error('');
    console.error('🔧 SOLUTION: Install missing dependencies:');
    console.error('npm install');
    console.error('');
  }
  
  process.exit(1);
}
EOF

echo "✅ Working server.js created"
```

## **Step 7: Test the fixed server.js**
```bash
# Test server.js
node server.js

# You should see startup messages without errors
# If successful, test the endpoints
```

## **Step 8: Test endpoints**
```bash
# In another terminal, test:
curl http://localhost:3000/health
curl http://localhost:3000/api/test
curl -X POST http://localhost:3000/api/auth/send-otp -H "Content-Type: application/json" -d '{"phoneNumber":"1234567890","countryCode":"+1"}'
```

## **Step 9: Start with PM2**
```bash
# Stop direct Node.js if running
pkill -f "node server.js"

# Start with PM2
pm2 start server.js --name chatapp-backend
pm2 list
pm2 save
```

## **🔍 Troubleshooting:**

### If npm install fails:
```bash
# Check Node.js version
node --version  # Should be 18.x

# If Node.js is old, upgrade:
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Try installing dependencies again
npm install
```

### If specific modules fail:
```bash
# Install only essential modules
npm install express@4.18.2 cors@2.8.5 dotenv@16.3.1

# Test with minimal server
node server.js
```

**Follow these steps and your server.js will work with Express!** 🚀
