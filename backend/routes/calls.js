const express = require('express');
const Call = require('../models/Call');
const router = express.Router();

// Get call history
router.get('/history', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const calls = await Call.getUserCallHistory(req.user._id, page, limit);
    
    res.status(200).json({
      success: true,
      data: { calls }
    });
  } catch (error) {
    console.error('Get call history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get call history'
    });
  }
});

module.exports = router;
