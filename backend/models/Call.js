const mongoose = require('mongoose');

const callSchema = new mongoose.Schema({
  // Call Identification
  callId: {
    type: String,
    unique: true,
    required: true
  },
  
  // Call Type
  type: {
    type: String,
    enum: ['voice', 'video'],
    required: true
  },
  
  // Call Participants
  caller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  participants: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['caller', 'receiver'],
      required: true
    },
    status: {
      type: String,
      enum: ['calling', 'ringing', 'connected', 'disconnected', 'declined', 'missed', 'busy'],
      default: 'calling'
    },
    joinedAt: Date,
    leftAt: Date,
    duration: Number, // in seconds
    connectionQuality: {
      type: String,
      enum: ['excellent', 'good', 'fair', 'poor'],
      default: 'good'
    }
  }],
  
  // Group Call Information
  groupCall: {
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chat'
    },
    maxParticipants: {
      type: Number,
      default: 8
    },
    isGroupCall: {
      type: Boolean,
      default: false
    }
  },
  
  // Call Status
  status: {
    type: String,
    enum: ['initiating', 'ringing', 'connecting', 'connected', 'ended', 'failed'],
    default: 'initiating'
  },
  
  // Call Timing
  startedAt: Date,
  endedAt: Date,
  duration: {
    type: Number,
    default: 0 // in seconds
  },
  
  // Call Quality & Technical Info
  quality: {
    overall: {
      type: String,
      enum: ['excellent', 'good', 'fair', 'poor'],
      default: 'good'
    },
    audio: {
      type: String,
      enum: ['excellent', 'good', 'fair', 'poor'],
      default: 'good'
    },
    video: {
      type: String,
      enum: ['excellent', 'good', 'fair', 'poor'],
      default: 'good'
    }
  },
  
  // Technical Details
  technical: {
    serverRegion: String,
    codec: String,
    bitrate: Number,
    resolution: String, // For video calls
    frameRate: Number,  // For video calls
    networkType: String, // wifi, cellular, etc.
    deviceType: String   // ios, android, web
  },
  
  // Call Settings
  settings: {
    isVideoEnabled: {
      type: Boolean,
      default: true
    },
    isAudioEnabled: {
      type: Boolean,
      default: true
    },
    isSpeakerEnabled: {
      type: Boolean,
      default: false
    },
    isRecording: {
      type: Boolean,
      default: false
    },
    recordingUrl: String,
    recordingDuration: Number
  },
  
  // Call End Reason
  endReason: {
    type: String,
    enum: ['completed', 'declined', 'missed', 'busy', 'failed', 'network_error', 'cancelled'],
    default: 'completed'
  },
  
  // Missed Call Information
  missedCall: {
    isMissed: {
      type: Boolean,
      default: false
    },
    missedBy: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    notificationSent: {
      type: Boolean,
      default: false
    }
  },
  
  // Call Feedback
  feedback: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    comment: String,
    issues: [{
      type: String,
      enum: ['audio_quality', 'video_quality', 'connection', 'echo', 'delay', 'other']
    }],
    submittedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Analytics
  analytics: {
    connectionTime: Number, // Time to establish connection
    reconnections: Number,
    packetsLost: Number,
    averageLatency: Number,
    peakParticipants: Number
  }
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
callSchema.index({ caller: 1, createdAt: -1 });
callSchema.index({ 'participants.userId': 1 });
callSchema.index({ callId: 1 });
callSchema.index({ status: 1 });
callSchema.index({ 'groupCall.chatId': 1 });

// Virtual for call duration in minutes
callSchema.virtual('durationInMinutes').get(function() {
  return Math.floor(this.duration / 60);
});

// Virtual for call duration formatted
callSchema.virtual('durationFormatted').get(function() {
  const hours = Math.floor(this.duration / 3600);
  const minutes = Math.floor((this.duration % 3600) / 60);
  const seconds = this.duration % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

// Virtual for active participants
callSchema.virtual('activeParticipants').get(function() {
  return this.participants.filter(p => 
    p.status === 'connected' || p.status === 'ringing'
  );
});

// Method to add participant
callSchema.methods.addParticipant = function(userId, role = 'receiver') {
  const existingParticipant = this.participants.find(
    p => p.userId.toString() === userId.toString()
  );
  
  if (!existingParticipant) {
    this.participants.push({
      userId,
      role,
      status: 'ringing'
    });
  }
  
  return this.save();
};

// Method to update participant status
callSchema.methods.updateParticipantStatus = function(userId, status) {
  const participant = this.participants.find(
    p => p.userId.toString() === userId.toString()
  );
  
  if (participant) {
    participant.status = status;
    
    if (status === 'connected' && !participant.joinedAt) {
      participant.joinedAt = new Date();
    }
    
    if (status === 'disconnected' && !participant.leftAt) {
      participant.leftAt = new Date();
      
      // Calculate participant duration
      if (participant.joinedAt) {
        participant.duration = Math.floor(
          (participant.leftAt - participant.joinedAt) / 1000
        );
      }
    }
  }
  
  return this.save();
};

// Method to start call
callSchema.methods.startCall = function() {
  this.status = 'connected';
  this.startedAt = new Date();
  
  return this.save();
};

// Method to end call
callSchema.methods.endCall = function(endReason = 'completed') {
  this.status = 'ended';
  this.endedAt = new Date();
  this.endReason = endReason;
  
  // Calculate total duration
  if (this.startedAt) {
    this.duration = Math.floor((this.endedAt - this.startedAt) / 1000);
  }
  
  // Update all connected participants
  this.participants.forEach(participant => {
    if (participant.status === 'connected') {
      participant.status = 'disconnected';
      participant.leftAt = this.endedAt;
      
      if (participant.joinedAt) {
        participant.duration = Math.floor(
          (participant.leftAt - participant.joinedAt) / 1000
        );
      }
    }
  });
  
  // Check for missed calls
  const missedParticipants = this.participants.filter(
    p => p.status === 'ringing' || p.status === 'calling'
  );
  
  if (missedParticipants.length > 0) {
    this.missedCall.isMissed = true;
    this.missedCall.missedBy = missedParticipants.map(p => p.userId);
  }
  
  return this.save();
};

// Method to decline call
callSchema.methods.declineCall = function(userId) {
  const participant = this.participants.find(
    p => p.userId.toString() === userId.toString()
  );
  
  if (participant) {
    participant.status = 'declined';
  }
  
  // If all participants declined, end the call
  const activeParticipants = this.participants.filter(
    p => p.status !== 'declined' && p.status !== 'disconnected'
  );
  
  if (activeParticipants.length <= 1) {
    return this.endCall('declined');
  }
  
  return this.save();
};

// Method to add feedback
callSchema.methods.addFeedback = function(userId, rating, comment, issues = []) {
  // Remove existing feedback from this user
  this.feedback = this.feedback.filter(
    f => f.userId.toString() !== userId.toString()
  );
  
  // Add new feedback
  this.feedback.push({
    userId,
    rating,
    comment,
    issues,
    submittedAt: new Date()
  });
  
  return this.save();
};

// Method to check if call is active
callSchema.methods.isActive = function() {
  return ['initiating', 'ringing', 'connecting', 'connected'].includes(this.status);
};

// Static method to get user's call history
callSchema.statics.getUserCallHistory = function(userId, page = 1, limit = 50) {
  const skip = (page - 1) * limit;
  
  return this.find({
    $or: [
      { caller: userId },
      { 'participants.userId': userId }
    ]
  })
  .populate('caller', 'displayName profilePicture')
  .populate('participants.userId', 'displayName profilePicture')
  .sort({ createdAt: -1 })
  .skip(skip)
  .limit(limit);
};

// Static method to get active calls for user
callSchema.statics.getActiveCalls = function(userId) {
  return this.find({
    $or: [
      { caller: userId },
      { 'participants.userId': userId }
    ],
    status: { $in: ['initiating', 'ringing', 'connecting', 'connected'] }
  })
  .populate('caller', 'displayName profilePicture')
  .populate('participants.userId', 'displayName profilePicture');
};

// Static method to get missed calls
callSchema.statics.getMissedCalls = function(userId) {
  return this.find({
    'missedCall.missedBy': userId,
    'missedCall.isMissed': true
  })
  .populate('caller', 'displayName profilePicture')
  .sort({ createdAt: -1 });
};

module.exports = mongoose.model('Call', callSchema);
