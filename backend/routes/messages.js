const express = require('express');
const Message = require('../models/Message');
const router = express.Router();

// Get message details
router.get('/:messageId', async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId)
      .populate('sender', 'displayName profilePicture');
    
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: { message }
    });
  } catch (error) {
    console.error('Get message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get message'
    });
  }
});

module.exports = router;
