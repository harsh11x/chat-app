const mongoose = require('mongoose');

const storySchema = new mongoose.Schema({
  // Story Owner
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Story Content
  content: {
    type: {
      type: String,
      enum: ['text', 'image', 'video'],
      required: true
    },
    text: String,
    backgroundColor: String,
    textColor: String,
    font: String,
    media: {
      url: String,
      publicId: String,
      thumbnail: String,
      duration: Number, // For videos
      width: Number,
      height: Number,
      size: Number
    }
  },
  
  // Story Settings
  privacy: {
    type: String,
    enum: ['public', 'contacts', 'close_friends', 'custom'],
    default: 'contacts'
  },
  
  // Custom Privacy (when privacy is 'custom')
  allowedViewers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  hiddenFrom: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Story Analytics
  views: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    viewedAt: {
      type: Date,
      default: Date.now
    },
    viewDuration: Number // in seconds
  }],
  
  // Story Interactions
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
  
  replies: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    message: String,
    repliedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Story Status
  isActive: {
    type: Boolean,
    default: true
  },
  
  isHighlighted: {
    type: Boolean,
    default: false
  },
  
  // Story Expiry (24 hours by default)
  expiresAt: {
    type: Date,
    default: function() {
      return new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    }
  },
  
  // Highlight Information
  highlight: {
    title: String,
    cover: String,
    addedAt: Date
  },
  
  // Story Metadata
  location: {
    latitude: Number,
    longitude: Number,
    address: String,
    name: String
  },
  
  mentions: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    x: Number, // Position on story (0-1)
    y: Number  // Position on story (0-1)
  }],
  
  hashtags: [String],
  
  music: {
    title: String,
    artist: String,
    url: String,
    startTime: Number,
    duration: Number
  }
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
storySchema.index({ userId: 1, createdAt: -1 });
storySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
storySchema.index({ isActive: 1 });
storySchema.index({ privacy: 1 });

// Virtual for view count
storySchema.virtual('viewCount').get(function() {
  return this.views.length;
});

// Virtual for reaction count
storySchema.virtual('reactionCount').get(function() {
  return this.reactions.length;
});

// Virtual for reply count
storySchema.virtual('replyCount').get(function() {
  return this.replies.length;
});

// Virtual for story age
storySchema.virtual('age').get(function() {
  return Date.now() - this.createdAt.getTime();
});

// Virtual for time remaining
storySchema.virtual('timeRemaining').get(function() {
  return Math.max(0, this.expiresAt.getTime() - Date.now());
});

// Method to add view
storySchema.methods.addView = function(userId, viewDuration = 0) {
  const existingView = this.views.find(
    view => view.userId.toString() === userId.toString()
  );
  
  if (!existingView) {
    this.views.push({
      userId,
      viewedAt: new Date(),
      viewDuration
    });
  } else {
    // Update view duration if longer
    if (viewDuration > existingView.viewDuration) {
      existingView.viewDuration = viewDuration;
    }
  }
  
  return this.save();
};

// Method to add reaction
storySchema.methods.addReaction = function(userId, emoji) {
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
storySchema.methods.removeReaction = function(userId) {
  this.reactions = this.reactions.filter(
    reaction => reaction.userId.toString() !== userId.toString()
  );
  
  return this.save();
};

// Method to add reply
storySchema.methods.addReply = function(userId, message) {
  this.replies.push({
    userId,
    message,
    repliedAt: new Date()
  });
  
  return this.save();
};

// Method to check if user can view story
storySchema.methods.canUserView = function(userId, viewerContacts = []) {
  // Owner can always view
  if (this.userId.toString() === userId.toString()) {
    return true;
  }
  
  // Check if hidden from user
  if (this.hiddenFrom.some(id => id.toString() === userId.toString())) {
    return false;
  }
  
  switch (this.privacy) {
    case 'public':
      return true;
      
    case 'contacts':
      return viewerContacts.some(contact => 
        contact.userId.toString() === this.userId.toString()
      );
      
    case 'close_friends':
      // This would require a close friends list in User model
      return false; // Simplified for now
      
    case 'custom':
      return this.allowedViewers.some(id => 
        id.toString() === userId.toString()
      );
      
    default:
      return false;
  }
};

// Method to highlight story
storySchema.methods.addToHighlight = function(title, cover = null) {
  this.isHighlighted = true;
  this.highlight = {
    title,
    cover: cover || this.content.media?.thumbnail || this.content.media?.url,
    addedAt: new Date()
  };
  
  // Remove expiry for highlighted stories
  this.expiresAt = null;
  
  return this.save();
};

// Method to remove from highlight
storySchema.methods.removeFromHighlight = function() {
  this.isHighlighted = false;
  this.highlight = undefined;
  
  // Set expiry back if story is still within 24 hours
  const storyAge = Date.now() - this.createdAt.getTime();
  const twentyFourHours = 24 * 60 * 60 * 1000;
  
  if (storyAge < twentyFourHours) {
    this.expiresAt = new Date(this.createdAt.getTime() + twentyFourHours);
  } else {
    // Story is older than 24 hours, mark as inactive
    this.isActive = false;
  }
  
  return this.save();
};

// Static method to get user's active stories
storySchema.statics.getUserStories = function(userId) {
  return this.find({
    userId,
    isActive: true,
    $or: [
      { expiresAt: { $gt: new Date() } },
      { isHighlighted: true }
    ]
  }).sort({ createdAt: -1 });
};

// Static method to get stories for feed
storySchema.statics.getFeedStories = function(userId, userContacts = []) {
  const contactIds = userContacts.map(contact => contact.userId);
  
  return this.find({
    userId: { $in: contactIds },
    isActive: true,
    expiresAt: { $gt: new Date() },
    hiddenFrom: { $ne: userId }
  })
  .populate('userId', 'displayName profilePicture')
  .sort({ createdAt: -1 });
};

// Static method to get highlighted stories
storySchema.statics.getHighlightedStories = function(userId) {
  return this.find({
    userId,
    isHighlighted: true,
    isActive: true
  })
  .sort({ 'highlight.addedAt': -1 });
};

// Static method to cleanup expired stories
storySchema.statics.cleanupExpiredStories = function() {
  return this.updateMany(
    {
      expiresAt: { $lt: new Date() },
      isHighlighted: false,
      isActive: true
    },
    {
      isActive: false
    }
  );
};

module.exports = mongoose.model('Story', storySchema);
