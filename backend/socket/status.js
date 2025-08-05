const User = require('../models/User');

module.exports = (io, socket) => {
  
  // Update user online status
  socket.on('update_status', async (data) => {
    try {
      const { status } = data; // 'online', 'away', 'busy', 'offline'
      const userId = socket.userId;

      if (!userId) return;

      const user = await User.findById(userId);
      if (!user) return;

      // Update user status
      user.status = status;
      user.isOnline = status === 'online';
      if (status !== 'online') {
        user.lastSeen = new Date();
      }
      await user.save();

      // Broadcast status update to user's contacts
      // This would require getting user's contacts and emitting to them
      socket.broadcast.emit('user_status_update', {
        userId,
        status,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen,
        timestamp: new Date()
      });

      console.log(`👤 User status updated: ${userId} -> ${status}`);

    } catch (error) {
      console.error('Update status error:', error);
    }
  });

  // Set custom status
  socket.on('set_custom_status', async (data) => {
    try {
      const { text, emoji, expiresAt } = data;
      const userId = socket.userId;

      if (!userId) return;

      const user = await User.findById(userId);
      if (!user) return;

      // Update custom status
      user.customStatus = {
        text,
        emoji,
        expiresAt: expiresAt ? new Date(expiresAt) : null
      };
      await user.save();

      // Broadcast custom status update
      socket.broadcast.emit('user_custom_status_update', {
        userId,
        customStatus: user.customStatus,
        timestamp: new Date()
      });

      console.log(`✨ Custom status set: ${userId} -> ${text}`);

    } catch (error) {
      console.error('Set custom status error:', error);
    }
  });

  // Handle user going online
  socket.on('user_online', async () => {
    try {
      const userId = socket.userId;
      if (!userId) return;

      const user = await User.findById(userId);
      if (!user) return;

      await user.setOnlineStatus(true);

      // Broadcast online status
      socket.broadcast.emit('user_online', {
        userId,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('User online error:', error);
    }
  });

  // Handle user going offline (on disconnect)
  socket.on('disconnect', async () => {
    try {
      const userId = socket.userId;
      if (!userId) return;

      const user = await User.findById(userId);
      if (!user) return;

      await user.setOnlineStatus(false);

      // Broadcast offline status
      socket.broadcast.emit('user_offline', {
        userId,
        lastSeen: user.lastSeen,
        timestamp: new Date()
      });

      console.log(`👤 User went offline: ${userId}`);

    } catch (error) {
      console.error('User offline error:', error);
    }
  });
};
