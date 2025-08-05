const express = require('express');
const router = express.Router();

// Placeholder for stories routes
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Stories feature coming soon',
    data: { stories: [] }
  });
});

module.exports = router;
