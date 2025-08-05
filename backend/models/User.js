const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Basic Information
  phoneNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  countryCode: {
    type: String,
    required: true
  },
  fullPhoneNumber: {
    type: String,
    required: true,
    unique: true
  },
  
  // Profile Information
  displayName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  username: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    lowercase: true,
    minlength: 3,
    maxlength: 30
  },
  bio: {
    type: String,
    maxlength: 150,
    default: 'Hey there! I am using ChatApp.'
  },
  
  // Profile Media
  profilePicture: {
    url: String,
    publicId: String, // Cloudinary public ID
    uploadedAt: Date
  },
  profilePictureHistory: [{
    url: String,
    publicId: String,
    uploadedAt: Date
  }],
  
  // Authentication
  isPhoneVerified: {
    type: Boolean,
    default: false
  },
  otpCode: String,
  otpExpiry: Date,
  otpAttempts: {
    type: Number,
    default: 0
  },
  lastOtpSent: Date,
  
  // Status & Activity
  isOnline: {
    type: Boolean,
    default: false
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['online', 'offline', 'away', 'busy'],
    default: 'offline'
  },
  customStatus: {
    text: String,
    emoji: String,
    expiresAt: Date
  },
  
  // Privacy Settings
  privacy: {
    profilePhoto: {
      type: String,
      enum: ['everyone', 'contacts', 'nobody'],
      default: 'everyone'
    },
    lastSeen: {
      type: String,
      enum: ['everyone', 'contacts', 'nobody'],
      default: 'everyone'
    },
    status: {
      type: String,
      enum: ['everyone', 'contacts', 'nobody'],
      default: 'everyone'
    },
    readReceipts: {
      type: Boolean,
      default: true
    },
    groups: {
      type: String,
      enum: ['everyone', 'contacts', 'nobody'],
      default: 'everyone'
    }
  },
  
  // Notification Settings
  notifications: {
    messages: {
      type: Boolean,
      default: true
    },
    groups: {
      type: Boolean,
      default: true
    },
    calls: {
      type: Boolean,
      default: true
    },
    stories: {
      type: Boolean,
      default: true
    },
    sound: {
      type: Boolean,
      default: true
    },
    vibration: {
      type: Boolean,
      default: true
    }
  },
  
  // Contacts & Relationships
  contacts: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    displayName: String,
    addedAt: {
      type: Date,
      default: Date.now
    },
    isBlocked: {
      type: Boolean,
      default: false
    }
  }],
  
  blockedUsers: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    blockedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Device Information
  devices: [{
    deviceId: String,
    deviceType: {
      type: String,
      enum: ['ios', 'android', 'web']
    },
    deviceName: String,
    fcmToken: String,
    lastActive: Date,
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  
  // Stories
  stories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Story'
  }],
  
  // Groups
  groups: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group'
  }],
  
  // Call History
  callHistory: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Call'
  }],
  
  // App Settings
  settings: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'dark'
    },
    language: {
      type: String,
      default: 'en'
    },
    fontSize: {
      type: String,
      enum: ['small', 'medium', 'large'],
      default: 'medium'
    },
    autoDownloadMedia: {
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
  
  // Security
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  backupCodes: [String],
  
  // Analytics
  analytics: {
    messagesCount: {
      type: Number,
      default: 0
    },
    callsCount: {
      type: Number,
      default: 0
    },
    storiesCount: {
      type: Number,
      default: 0
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  },
  
  // Account Status
  isActive: {
    type: Boolean,
    default: true
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date,
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
userSchema.index({ phoneNumber: 1 });
userSchema.index({ fullPhoneNumber: 1 });
userSchema.index({ username: 1 });
userSchema.index({ displayName: 'text' });
userSchema.index({ isOnline: 1 });
userSchema.index({ lastSeen: -1 });

// Virtual for full name
userSchema.virtual('initials').get(function() {
  return this.displayName
    .split(' ')
    .map(name => name.charAt(0).toUpperCase())
    .join('')
    .substring(0, 2);
});

// Hash OTP before saving
userSchema.pre('save', async function(next) {
  if (this.isModified('otpCode') && this.otpCode) {
    this.otpCode = await bcrypt.hash(this.otpCode, 10);
  }
  next();
});

// Method to compare OTP
userSchema.methods.compareOTP = async function(candidateOTP) {
  if (!this.otpCode) return false;
  return await bcrypt.compare(candidateOTP, this.otpCode);
};

// Method to generate OTP
userSchema.methods.generateOTP = function() {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  this.otpCode = otp;
  this.otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
  this.lastOtpSent = new Date();
  return otp;
};

// Method to check if OTP is valid
userSchema.methods.isOTPValid = function() {
  return this.otpExpiry && this.otpExpiry > new Date();
};

// Method to update last seen
userSchema.methods.updateLastSeen = function() {
  this.lastSeen = new Date();
  return this.save();
};

// Method to set online status
userSchema.methods.setOnlineStatus = function(isOnline) {
  this.isOnline = isOnline;
  this.status = isOnline ? 'online' : 'offline';
  if (!isOnline) {
    this.lastSeen = new Date();
  }
  return this.save();
};

// Method to add contact
userSchema.methods.addContact = function(userId, displayName) {
  const existingContact = this.contacts.find(
    contact => contact.userId.toString() === userId.toString()
  );
  
  if (!existingContact) {
    this.contacts.push({
      userId,
      displayName,
      addedAt: new Date()
    });
  }
  
  return this.save();
};

// Method to block user
userSchema.methods.blockUser = function(userId) {
  const isAlreadyBlocked = this.blockedUsers.some(
    blocked => blocked.userId.toString() === userId.toString()
  );
  
  if (!isAlreadyBlocked) {
    this.blockedUsers.push({
      userId,
      blockedAt: new Date()
    });
  }
  
  return this.save();
};

// Method to unblock user
userSchema.methods.unblockUser = function(userId) {
  this.blockedUsers = this.blockedUsers.filter(
    blocked => blocked.userId.toString() !== userId.toString()
  );
  
  return this.save();
};

// Method to check if user is blocked
userSchema.methods.isUserBlocked = function(userId) {
  return this.blockedUsers.some(
    blocked => blocked.userId.toString() === userId.toString()
  );
};

// Static method to find by phone number
userSchema.statics.findByPhoneNumber = function(phoneNumber) {
  return this.findOne({ fullPhoneNumber: phoneNumber });
};

// Static method to search users
userSchema.statics.searchUsers = function(query, currentUserId) {
  return this.find({
    $and: [
      { _id: { $ne: currentUserId } },
      { isActive: true },
      { isDeleted: false },
      {
        $or: [
          { displayName: { $regex: query, $options: 'i' } },
          { username: { $regex: query, $options: 'i' } },
          { phoneNumber: { $regex: query, $options: 'i' } }
        ]
      }
    ]
  }).select('displayName username profilePicture phoneNumber bio isOnline lastSeen');
};

module.exports = mongoose.model('User', userSchema);
