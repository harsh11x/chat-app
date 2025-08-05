const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  // Message Identification
  messageId: {
    type: String,
    unique: true,
    required: true
  },
  
  // Chat Reference
  chatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    required: true
  },
  
  // Sender Information
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Message Content
  content: {
    text: String,
    type: {
      type: String,
      enum: ['text', 'image', 'video', 'audio', 'document', 'location', 'contact', 'sticker', 'gif'],
      default: 'text'
    }
  },
  
  // Media Attachments
  media: [{
    type: {
      type: String,
      enum: ['image', 'video', 'audio', 'document']
    },
    url: String,
    publicId: String, // Cloudinary public ID
    filename: String,
    size: Number,
    duration: Number, // For audio/video
    thumbnail: String, // For videos
    mimeType: String,
    uploadedAt: Date
  }],
  
  // Location Data
  location: {
    latitude: Number,
    longitude: Number,
    address: String,
    name: String
  },
  
  // Contact Data
  contact: {
    name: String,
    phoneNumber: String,
    avatar: String
  },
  
  // Reply/Forward Information
  replyTo: {
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message'
    },
    content: String,
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  
  forwardedFrom: {
    originalSender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    originalChatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chat'
    },
    forwardedAt: Date
  },
  
  // Message Status
  status: {
    type: String,
    enum: ['sending', 'sent', 'delivered', 'read', 'failed'],
    default: 'sending'
  },
  
  // Delivery Information
  deliveredTo: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    deliveredAt: Date
  }],
  
  readBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: Date
  }],
  
  // Message Metadata
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: Date,
  editHistory: [{
    content: String,
    editedAt: Date
  }],
  
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date,
  deletedFor: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    deletedAt: Date
  }],
  
  // Reactions
  reactions: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    emoji: String,
    reactedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Message Priority
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  
  // Encryption
  isEncrypted: {
    type: Boolean,
    default: false
  },
  encryptionKey: String,
  
  // Mentions
  mentions: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    startIndex: Number,
    length: Number
  }],
  
  // Hashtags
  hashtags: [String],
  
  // Message Expiry (for disappearing messages)
  expiresAt: Date,
  autoDeleteAfter: Number, // seconds
  
  // Analytics
  analytics: {
    viewCount: {
      type: Number,
      default: 0
    },
    shareCount: {
      type: Number,
      default: 0
    }
  }
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
messageSchema.index({ chatId: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });
messageSchema.index({ messageId: 1 });
messageSchema.index({ 'content.type': 1 });
messageSchema.index({ status: 1 });
messageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual for message age
messageSchema.virtual('age').get(function() {
  return Date.now() - this.createdAt.getTime();
});

// Virtual for read status
messageSchema.virtual('isRead').get(function() {
  return this.readBy && this.readBy.length > 0;
});

// Method to mark as delivered
messageSchema.methods.markAsDelivered = function(userId) {
  const alreadyDelivered = this.deliveredTo.some(
    delivery => delivery.userId.toString() === userId.toString()
  );
  
  if (!alreadyDelivered) {
    this.deliveredTo.push({
      userId,
      deliveredAt: new Date()
    });
    
    if (this.status === 'sent') {
      this.status = 'delivered';
    }
  }
  
  return this.save();
};

// Method to mark as read
messageSchema.methods.markAsRead = function(userId) {
  const alreadyRead = this.readBy.some(
    read => read.userId.toString() === userId.toString()
  );
  
  if (!alreadyRead) {
    this.readBy.push({
      userId,
      readAt: new Date()
    });
    
    this.status = 'read';
  }
  
  return this.save();
};

// Method to add reaction
messageSchema.methods.addReaction = function(userId, emoji) {
  // Remove existing reaction from this user
  this.reactions = this.reactions.filter(
    reaction => reaction.userId.toString() !== userId.toString()
  );
  
  // Add new reaction
  this.reactions.push({
    userId,
    emoji,
    reactedAt: new Date()
  });
  
  return this.save();
};

// Method to remove reaction
messageSchema.methods.removeReaction = function(userId) {
  this.reactions = this.reactions.filter(
    reaction => reaction.userId.toString() !== userId.toString()
  );
  
  return this.save();
};

// Method to edit message
messageSchema.methods.editMessage = function(newContent) {
  // Save to edit history
  this.editHistory.push({
    content: this.content.text,
    editedAt: new Date()
  });
  
  // Update content
  this.content.text = newContent;
  this.isEdited = true;
  this.editedAt = new Date();
  
  return this.save();
};

// Method to delete message
messageSchema.methods.deleteMessage = function(userId, deleteForEveryone = false) {
  if (deleteForEveryone) {
    this.isDeleted = true;
    this.deletedAt = new Date();
  } else {
    // Delete for specific user
    const alreadyDeleted = this.deletedFor.some(
      deleted => deleted.userId.toString() === userId.toString()
    );
    
    if (!alreadyDeleted) {
      this.deletedFor.push({
        userId,
        deletedAt: new Date()
      });
    }
  }
  
  return this.save();
};

// Method to check if message is deleted for user
messageSchema.methods.isDeletedForUser = function(userId) {
  if (this.isDeleted) return true;
  
  return this.deletedFor.some(
    deleted => deleted.userId.toString() === userId.toString()
  );
};

// Static method to get chat messages
messageSchema.statics.getChatMessages = function(chatId, page = 1, limit = 50) {
  const skip = (page - 1) * limit;
  
  return this.find({ 
    chatId,
    isDeleted: false 
  })
  .populate('sender', 'displayName profilePicture')
  .populate('replyTo.sender', 'displayName')
  .sort({ createdAt: -1 })
  .skip(skip)
  .limit(limit);
};

// Static method to search messages
messageSchema.statics.searchMessages = function(chatId, query) {
  return this.find({
    chatId,
    isDeleted: false,
    'content.text': { $regex: query, $options: 'i' }
  })
  .populate('sender', 'displayName profilePicture')
  .sort({ createdAt: -1 })
  .limit(100);
};

// Pre-save middleware to set expiry
messageSchema.pre('save', function(next) {
  if (this.autoDeleteAfter && !this.expiresAt) {
    this.expiresAt = new Date(Date.now() + this.autoDeleteAfter * 1000);
  }
  next();
});

module.exports = mongoose.model('Message', messageSchema);
