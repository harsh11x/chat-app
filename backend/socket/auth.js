const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = (io, socket) => {
  
  // Authenticate socket connection
  socket.on('authenticate', async (data) => {
    try {
      const { token } = data;
      
      if (!token) {
        socket.emit('authentication_error', { message: 'No token provided' });
        return;
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      
      // Get user from database
      const user = await User.findById(decoded.userId);
      if (!user) {
        socket.emit('authentication_error', { message: 'Invalid token' });
        return;
      }

      // Store user info in socket
      socket.userId = user._id.toString();
      socket.user = user;

      // Update user online status
      await user.setOnlineStatus(true);

      // Join user to their personal room
      socket.join(socket.userId);

      // Emit successful authentication
      socket.emit('authenticated', {
        user: {
          id: user._id,
          displayName: user.displayName,
          phoneNumber: user.fullPhoneNumber,
          profilePicture: user.profilePicture,
          isOnline: true
        }
      });

      console.log(`✅ User authenticated: ${user.displayName} (${socket.userId})`);

    } catch (error) {
      console.error('Socket authentication error:', error);
      socket.emit('authentication_error', { message: 'Authentication failed' });
    }
  });

  // Handle authentication on connection (if token provided in handshake)
  if (socket.handshake.auth && socket.handshake.auth.token) {
    socket.emit('authenticate', { token: socket.handshake.auth.token });
  }
};
