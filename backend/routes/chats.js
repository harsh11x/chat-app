const express = require('express');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const router = express.Router();

// Get user's chats
router.get('/', async (req, res) => {
  try {
    const chats = await Chat.findUserChats(req.user._id);
    
    res.status(200).json({
      success: true,
      data: { chats }
    });
  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get chats'
    });
  }
});

// Create private chat
router.post('/private', async (req, res) => {
  try {
    const { userId } = req.body;
    
    // Check if chat already exists
    let chat = await Chat.findPrivateChat(req.user._id, userId);
    
    if (!chat) {
      chat = await Chat.createPrivateChat(req.user._id, userId);
    }
    
    await chat.populate('participants.userId', 'displayName profilePicture');
    
    res.status(200).json({
      success: true,
      data: { chat }
    });
  } catch (error) {
    console.error('Create private chat error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create chat'
    });
  }
});

// Get chat messages
router.get('/:chatId/messages', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { page = 1 } = req.query;
    
    // Verify user is participant
    const chat = await Chat.findById(chatId);
    if (!chat || !chat.isParticipant(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const messages = await Message.getChatMessages(chatId, page);
    
    res.status(200).json({
      success: true,
      data: { messages }
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get messages'
    });
  }
});

module.exports = router;
