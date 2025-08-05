const Call = require('../models/Call');
const { v4: uuidv4 } = require('uuid');

module.exports = (io, socket) => {
  
  // Initiate call
  socket.on('initiate_call', async (data) => {
    try {
      const { targetUserId, type } = data; // type: 'voice' or 'video'
      const callerId = socket.userId;

      if (!callerId || !targetUserId) {
        socket.emit('call_error', { message: 'Missing required data' });
        return;
      }

      // Create call record
      const call = new Call({
        callId: uuidv4(),
        type,
        caller: callerId,
        participants: [
          { userId: callerId, role: 'caller', status: 'calling' },
          { userId: targetUserId, role: 'receiver', status: 'ringing' }
        ],
        status: 'ringing'
      });

      await call.save();

      // Notify target user
      io.to(targetUserId).emit('incoming_call', {
        callId: call.callId,
        caller: socket.user,
        type,
        timestamp: new Date()
      });

      // Confirm to caller
      socket.emit('call_initiated', {
        callId: call.callId,
        status: 'ringing'
      });

      console.log(`📞 Call initiated: ${callerId} -> ${targetUserId}`);

    } catch (error) {
      console.error('Initiate call error:', error);
      socket.emit('call_error', { message: 'Failed to initiate call' });
    }
  });

  // Accept call
  socket.on('accept_call', async (data) => {
    try {
      const { callId } = data;
      const userId = socket.userId;

      const call = await Call.findOne({ callId });
      if (!call) {
        socket.emit('call_error', { message: 'Call not found' });
        return;
      }

      // Update call status
      await call.updateParticipantStatus(userId, 'connected');
      await call.startCall();

      // Notify all participants
      const participantIds = call.participants.map(p => p.userId.toString());
      participantIds.forEach(id => {
        io.to(id).emit('call_accepted', {
          callId,
          acceptedBy: userId,
          timestamp: new Date()
        });
      });

      console.log(`📞 Call accepted: ${callId} by ${userId}`);

    } catch (error) {
      console.error('Accept call error:', error);
      socket.emit('call_error', { message: 'Failed to accept call' });
    }
  });

  // Decline call
  socket.on('decline_call', async (data) => {
    try {
      const { callId } = data;
      const userId = socket.userId;

      const call = await Call.findOne({ callId });
      if (!call) {
        socket.emit('call_error', { message: 'Call not found' });
        return;
      }

      // Update call status
      await call.declineCall(userId);

      // Notify all participants
      const participantIds = call.participants.map(p => p.userId.toString());
      participantIds.forEach(id => {
        io.to(id).emit('call_declined', {
          callId,
          declinedBy: userId,
          timestamp: new Date()
        });
      });

      console.log(`📞 Call declined: ${callId} by ${userId}`);

    } catch (error) {
      console.error('Decline call error:', error);
      socket.emit('call_error', { message: 'Failed to decline call' });
    }
  });

  // End call
  socket.on('end_call', async (data) => {
    try {
      const { callId } = data;
      const userId = socket.userId;

      const call = await Call.findOne({ callId });
      if (!call) {
        socket.emit('call_error', { message: 'Call not found' });
        return;
      }

      // End call
      await call.endCall('completed');

      // Notify all participants
      const participantIds = call.participants.map(p => p.userId.toString());
      participantIds.forEach(id => {
        io.to(id).emit('call_ended', {
          callId,
          endedBy: userId,
          duration: call.duration,
          timestamp: new Date()
        });
      });

      console.log(`📞 Call ended: ${callId} by ${userId}`);

    } catch (error) {
      console.error('End call error:', error);
      socket.emit('call_error', { message: 'Failed to end call' });
    }
  });

  // WebRTC signaling
  socket.on('webrtc_offer', (data) => {
    const { callId, targetUserId, offer } = data;
    io.to(targetUserId).emit('webrtc_offer', {
      callId,
      fromUserId: socket.userId,
      offer
    });
  });

  socket.on('webrtc_answer', (data) => {
    const { callId, targetUserId, answer } = data;
    io.to(targetUserId).emit('webrtc_answer', {
      callId,
      fromUserId: socket.userId,
      answer
    });
  });

  socket.on('webrtc_ice_candidate', (data) => {
    const { callId, targetUserId, candidate } = data;
    io.to(targetUserId).emit('webrtc_ice_candidate', {
      callId,
      fromUserId: socket.userId,
      candidate
    });
  });
};
