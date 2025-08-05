const express = require('express');
const http = require('http');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Basic middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'ChatApp Backend is running!',
    timestamp: new Date().toISOString(),
    server: '3.111.208.77:3000',
    status: 'healthy'
  });
});

// Basic API endpoint
app.get('/api/test', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API is working!',
    data: {
      server: '3.111.208.77:3000',
      timestamp: new Date().toISOString()
    }
  });
});

// Auth endpoint (minimal)
app.post('/api/auth/send-otp', (req, res) => {
  const { phoneNumber, countryCode } = req.body;
  
  res.status(200).json({
    success: true,
    message: 'OTP sent successfully (demo mode)',
    data: {
      phoneNumber: countryCode + phoneNumber,
      expiresIn: 300,
      isNewUser: true
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
      'POST /api/auth/send-otp'
    ]
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
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
🚀 ChatApp Backend (Minimal) Started!
📡 Server running on ${HOST}:${PORT}
🌐 Public URL: http://3.111.208.77:${PORT}
🔗 Health Check: http://3.111.208.77:${PORT}/health
📱 API Test: http://3.111.208.77:${PORT}/api/test
🌍 Environment: ${process.env.NODE_ENV || 'development'}
📱 Ready for testing!
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

module.exports = { app, server };
