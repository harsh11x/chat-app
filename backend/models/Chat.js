const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  // Chat Type
  type: {
    type: String,
    enum: ['private', 'group'],
    required: true
  },
  
  // Participants
  participants: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['member', 'admin', 'owner'],
      default: 'member'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    leftAt: Date,
    isActive: {
      type: Boolean,
      default: true
    },
    // Participant-specific settings
    settings: {
      notifications: {
        type: Boolean,
        default: true
      },
      customName: String, // Custom name for this chat
      isPinned: {
        type: Boolean,
        default: false
      },
      isArchived: {
        type: Boolean,
        default: false
      },
      isMuted: {
        type: Boolean,
        default: false
      },
      mutedUntil: Date
    }
  }],
  
  // Group Information (for group chats)
  groupInfo: {
    name: String,
    description: String,
    avatar: {
      url: String,
      publicId: String
    },
    inviteLink: String,
    settings: {
      whoCanAddMembers: {
        type: String,
        enum: ['admins', 'all'],
        default: 'admins'
      },
      whoCanEditGroupInfo: {
        type: String,
        enum: ['admins', 'all'],
        default: 'admins'
      },
      whoCanSendMessages: {
        type: String,
        enum: ['admins', 'all'],
        default: 'all'
      },
      approveNewMembers: {
        type: Boolean,
        default: false
      }
    }
  },
  
  // Last Message
  lastMessage: {
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message'
    },
    content: String,
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: Date,
    type: String
  },
  
  // Unread Counts per participant
  unreadCounts: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    count: {
      type: Number,
      default: 0
    },
    lastReadMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message'
    },
    lastReadAt: Date
  }],
  
  // Chat Status
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Encryption
  isEncrypted: {
    type: Boolean,
    default: false
  },
  encryptionKey: String,
  
  // Chat Settings
  settings: {
    // Disappearing messages
    disappearingMessages: {
      enabled: {
        type: Boolean,
        default: false
      },
      duration: {
        type: Number,
        default: 86400 // 24 hours in seconds
      }
    },
    
    // Media auto-download
    autoDownload: {
      photos: {
        type: Boolean,
        default: true
      },
      videos: {
        type: Boolean,
        default: false
      },
      documents: {
        type: Boolean,
        default: false
      }
    }
  },
  
  // Analytics
  analytics: {
    messageCount: {
      type: Number,
      default: 0
    },
    mediaCount: {
      type: Number,
      default: 0
    },
    lastActivity: Date
  }
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
chatSchema.index({ 'participants.userId': 1 });
chatSchema.index({ type: 1 });
chatSchema.index({ 'lastMessage.timestamp': -1 });
chatSchema.index({ updatedAt: -1 });

// Virtual for active participants
chatSchema.virtual('activeParticipants').get(function() {
  return this.participants.filter(p => p.isActive);
});

// Virtual for participant count
chatSchema.virtual('participantCount').get(function() {
  return this.activeParticipants.length;
});

// Virtual for chat name (for private chats)
chatSchema.virtual('chatName').get(function() {
  if (this.type === 'group') {
    return this.groupInfo?.name || 'Group Chat';
  }
  // For private chats, name would be determined by the other participant
  return null;
});

// Method to add participant
chatSchema.methods.addParticipant = function(userId, role = 'member', addedBy = null) {
  const existingParticipant = this.participants.find(
    p => p.userId.toString() === userId.toString()
  );
  
  if (existingParticipant) {
    if (!existingParticipant.isActive) {
      existingParticipant.isActive = true;
      existingParticipant.joinedAt = new Date();
      existingParticipant.leftAt = undefined;
    }
  } else {
    this.participants.push({
      userId,
      role,
      joinedAt: new Date(),
      isActive: true
    });
    
    // Initialize unread count
    this.unreadCounts.push({
      userId,
      count: 0
    });
  }
  
  return this.save();
};

// Method to remove participant
chatSchema.methods.removeParticipant = function(userId) {
  const participant = this.participants.find(
    p => p.userId.toString() === userId.toString()
  );
  
  if (participant) {
    participant.isActive = false;
    participant.leftAt = new Date();
  }
  
  return this.save();
};

// Method to update participant role
chatSchema.methods.updateParticipantRole = function(userId, newRole) {
  const participant = this.participants.find(
    p => p.userId.toString() === userId.toString() && p.isActive
  );
  
  if (participant) {
    participant.role = newRole;
  }
  
  return this.save();
};

// Method to check if user is participant
chatSchema.methods.isParticipant = function(userId) {
  return this.participants.some(
    p => p.userId.toString() === userId.toString() && p.isActive
  );
};

// Method to check if user is admin
chatSchema.methods.isAdmin = function(userId) {
  const participant = this.participants.find(
    p => p.userId.toString() === userId.toString() && p.isActive
  );
  
  return participant && (participant.role === 'admin' || participant.role === 'owner');
};

// Method to update last message
chatSchema.methods.updateLastMessage = function(message) {
  this.lastMessage = {
    messageId: message._id,
    content: message.content.text || `[${message.content.type}]`,
    sender: message.sender,
    timestamp: message.createdAt,
    type: message.content.type
  };
  
  this.analytics.lastActivity = new Date();
  this.analytics.messageCount += 1;
  
  if (message.content.type !== 'text') {
    this.analytics.mediaCount += 1;
  }
  
  return this.save();
};

// Method to increment unread count
chatSchema.methods.incrementUnreadCount = function(userId, messageId) {
  let unreadCount = this.unreadCounts.find(
    uc => uc.userId.toString() === userId.toString()
  );
  
  if (!unreadCount) {
    unreadCount = {
      userId,
      count: 0
    };
    this.unreadCounts.push(unreadCount);
  }
  
  unreadCount.count += 1;
  
  return this.save();
};

// Method to reset unread count
chatSchema.methods.resetUnreadCount = function(userId, lastReadMessageId = null) {
  const unreadCount = this.unreadCounts.find(
    uc => uc.userId.toString() === userId.toString()
  );
  
  if (unreadCount) {
    unreadCount.count = 0;
    unreadCount.lastReadAt = new Date();
    if (lastReadMessageId) {
      unreadCount.lastReadMessageId = lastReadMessageId;
    }
  }
  
  return this.save();
};

// Method to get unread count for user
chatSchema.methods.getUnreadCount = function(userId) {
  const unreadCount = this.unreadCounts.find(
    uc => uc.userId.toString() === userId.toString()
  );
  
  return unreadCount ? unreadCount.count : 0;
};

// Method to update chat settings
chatSchema.methods.updateSettings = function(userId, settings) {
  const participant = this.participants.find(
    p => p.userId.toString() === userId.toString() && p.isActive
  );
  
  if (participant) {
    participant.settings = { ...participant.settings, ...settings };
  }
  
  return this.save();
};

// Static method to find user's chats
chatSchema.statics.findUserChats = function(userId) {
  return this.find({
    'participants.userId': userId,
    'participants.isActive': true,
    isActive: true
  })
  .populate('participants.userId', 'displayName profilePicture isOnline lastSeen')
  .populate('lastMessage.sender', 'displayName')
  .sort({ 'lastMessage.timestamp': -1 });
};

// Static method to find private chat between two users
chatSchema.statics.findPrivateChat = function(userId1, userId2) {
  return this.findOne({
    type: 'private',
    'participants.userId': { $all: [userId1, userId2] },
    'participants.isActive': true,
    isActive: true
  });
};

// Static method to create private chat
chatSchema.statics.createPrivateChat = function(userId1, userId2) {
  return this.create({
    type: 'private',
    participants: [
      { userId: userId1, role: 'member' },
      { userId: userId2, role: 'member' }
    ],
    unreadCounts: [
      { userId: userId1, count: 0 },
      { userId: userId2, count: 0 }
    ]
  });
};

module.exports = mongoose.model('Chat', chatSchema);
