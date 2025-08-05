# 🚀 ChatApp Backend - Real-Time Chat Server

A complete Node.js backend for real-time chat application with phone authentication, messaging, stories, calls, and groups.

## ✨ Features

### 🔐 Authentication
- **Phone Number Authentication** with SMS OTP
- **JWT Token-based** authentication
- **Country Code Support** for 195+ countries
- **Rate Limiting** for security
- **Profile Management** with pictures and bio

### 💬 Real-Time Messaging
- **Socket.IO** for real-time communication
- **Message Types**: Text, Images, Videos, Audio, Documents, Location
- **Message Status**: Sent, Delivered, Read
- **Message Reactions** with emojis
- **Message Editing** and deletion
- **Message Forwarding** to multiple chats
- **Reply to Messages** functionality
- **Typing Indicators** in real-time

### 👥 Chat Management
- **Private Chats** between users
- **Group Chats** with admin controls
- **Unread Message Counts**
- **Chat Settings** and customization
- **Message Search** within chats

### 📱 Stories
- **24-hour Stories** with auto-expiry
- **Story Types**: Text, Image, Video
- **Story Privacy** controls
- **Story Views** and reactions
- **Story Highlights** for permanent stories

### 📞 Voice & Video Calls
- **WebRTC Integration** for calls
- **Call History** and analytics
- **Group Calls** support
- **Call Quality** monitoring
- **Missed Call** notifications

### 🔧 Technical Features
- **MongoDB** for data persistence
- **Redis** for caching and sessions
- **Cloudinary** for media storage
- **Twilio** for SMS delivery
- **Push Notifications** (FCM/APNS)
- **File Upload** with validation
- **Error Handling** and logging
- **API Rate Limiting**
- **Security Headers**

## 🛠️ Installation & Setup

### Prerequisites
- Node.js 16+ 
- MongoDB 4.4+
- Redis (optional, for caching)

### 1. Clone and Install
```bash
cd /Users/harsh/Documents/Projects/chatapp/backend
npm install
```

### 2. Environment Setup
```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Required Services

#### MongoDB Setup
```bash
# Install MongoDB locally or use MongoDB Atlas
# Local installation:
brew install mongodb-community
brew services start mongodb-community

# Or use Docker:
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

#### Twilio Setup (for SMS OTP)
1. Create account at [Twilio](https://www.twilio.com)
2. Get Account SID and Auth Token
3. Purchase a phone number
4. Add credentials to `.env`

#### Cloudinary Setup (for media uploads)
1. Create account at [Cloudinary](https://cloudinary.com)
2. Get Cloud Name, API Key, and API Secret
3. Add credentials to `.env`

### 4. Start the Server
```bash
# Development mode
npm run dev

# Production mode
npm start
```

## 📡 API Endpoints

### Authentication
```
POST /api/auth/send-otp          # Send OTP to phone number
POST /api/auth/verify-otp        # Verify OTP and login
POST /api/auth/complete-profile  # Complete user profile
POST /api/auth/refresh-token     # Refresh JWT token
POST /api/auth/logout           # Logout user
```

### Users
```
GET  /api/users/profile         # Get user profile
PUT  /api/users/profile         # Update user profile
POST /api/users/upload-avatar   # Upload profile picture
GET  /api/users/search          # Search users
POST /api/users/add-contact     # Add contact
```

### Chats
```
GET  /api/chats                 # Get user's chats
POST /api/chats/private         # Create private chat
POST /api/chats/group           # Create group chat
GET  /api/chats/:id/messages    # Get chat messages
PUT  /api/chats/:id/settings    # Update chat settings
```

### Messages
```
POST /api/messages              # Send message (REST fallback)
GET  /api/messages/:id          # Get message details
PUT  /api/messages/:id          # Edit message
DELETE /api/messages/:id        # Delete message
POST /api/messages/:id/react    # Add reaction
```

### Stories
```
GET  /api/stories               # Get stories feed
POST /api/stories               # Create story
GET  /api/stories/:id/views     # Get story views
POST /api/stories/:id/react     # React to story
```

### Calls
```
GET  /api/calls/history         # Get call history
POST /api/calls/initiate        # Initiate call
PUT  /api/calls/:id/end         # End call
POST /api/calls/:id/feedback    # Submit call feedback
```

## 🔌 Socket.IO Events

### Connection
```javascript
// Client connects
socket.emit('authenticate', { token: 'jwt-token' });

// Server response
socket.on('authenticated', { user: userData });
socket.on('authentication_error', { message: 'Invalid token' });
```

### Chat Events
```javascript
// Join chat room
socket.emit('join_chat', { chatId: 'chat-id' });

// Send message
socket.emit('send_message', {
  chatId: 'chat-id',
  content: { type: 'text', text: 'Hello!' },
  tempId: 'temp-id'
});

// Receive message
socket.on('new_message', { message: messageData, tempId: 'temp-id' });

// Typing indicators
socket.emit('typing_start', { chatId: 'chat-id' });
socket.emit('typing_stop', { chatId: 'chat-id' });
socket.on('user_typing', { userId: 'user-id', isTyping: true });
```

### Message Status
```javascript
// Mark as delivered
socket.emit('message_delivered', { messageId: 'message-id' });

// Mark as read
socket.emit('message_read', { messageId: 'message-id', chatId: 'chat-id' });

// Status updates
socket.on('message_status_update', { 
  messageId: 'message-id', 
  status: 'read', 
  userId: 'user-id' 
});
```

### Reactions & Interactions
```javascript
// Add reaction
socket.emit('add_reaction', { messageId: 'message-id', emoji: '👍' });

// Edit message
socket.emit('edit_message', { messageId: 'message-id', newContent: 'Edited text' });

// Delete message
socket.emit('delete_message', { messageId: 'message-id', deleteForEveryone: true });
```

## 🏗️ Project Structure

```
backend/
├── models/           # MongoDB schemas
│   ├── User.js      # User model with profile, contacts, settings
│   ├── Chat.js      # Chat model for private/group chats
│   ├── Message.js   # Message model with all message types
│   ├── Story.js     # Story model with 24h expiry
│   └── Call.js      # Call model with history and analytics
├── routes/          # Express routes
│   ├── auth.js      # Authentication endpoints
│   ├── users.js     # User management
│   ├── chats.js     # Chat management
│   ├── messages.js  # Message operations
│   ├── stories.js   # Story operations
│   └── calls.js     # Call operations
├── socket/          # Socket.IO handlers
│   ├── auth.js      # Socket authentication
│   ├── chat.js      # Real-time messaging
│   ├── call.js      # Call signaling
│   └── status.js    # User status updates
├── services/        # Business logic
│   ├── otpService.js    # SMS/WhatsApp OTP sending
│   ├── uploadService.js # File upload handling
│   ├── pushService.js   # Push notifications
│   └── callService.js   # WebRTC signaling
├── middleware/      # Express middleware
│   ├── auth.js      # JWT authentication
│   ├── upload.js    # File upload middleware
│   └── errorHandler.js # Error handling
├── utils/           # Utility functions
├── config/          # Configuration files
└── server.js        # Main server file
```

## 🔒 Security Features

- **JWT Authentication** with refresh tokens
- **Rate Limiting** on all endpoints
- **Input Validation** with express-validator
- **File Upload Validation** with size and type limits
- **CORS Configuration** for cross-origin requests
- **Helmet.js** for security headers
- **bcrypt** for password hashing
- **MongoDB Injection** protection

## 📊 Monitoring & Analytics

- **Winston Logging** with different log levels
- **Morgan** for HTTP request logging
- **Call Quality** metrics and analytics
- **Message Delivery** statistics
- **User Activity** tracking
- **Error Tracking** and reporting

## 🚀 Deployment

### Docker Deployment
```bash
# Build image
docker build -t chatapp-backend .

# Run container
docker run -d -p 3000:3000 --env-file .env chatapp-backend
```

### Production Checklist
- [ ] Set `NODE_ENV=production`
- [ ] Configure MongoDB Atlas or production database
- [ ] Set up Redis for caching
- [ ] Configure Cloudinary for media storage
- [ ] Set up Twilio for SMS delivery
- [ ] Configure push notification services
- [ ] Set up monitoring and logging
- [ ] Configure SSL/TLS certificates
- [ ] Set up load balancing if needed

## 🧪 Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage
```

## 📱 Flutter Integration

The backend is designed to work seamlessly with your Flutter app:

1. **Authentication**: Use the phone OTP flow
2. **Real-time**: Connect via Socket.IO
3. **Media Upload**: Use multipart form data
4. **Push Notifications**: Integrate FCM tokens

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes
4. Add tests
5. Submit pull request

## 📄 License

MIT License - see LICENSE file for details

---

## 🎯 Next Steps

1. **Start the backend server**
2. **Test API endpoints** with Postman
3. **Integrate with Flutter app**
4. **Set up production services**
5. **Deploy to cloud platform**

Your real-time chat backend is ready! 🚀📱
