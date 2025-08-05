const express = require('express');
const router = express.Router();

// Placeholder for group routes
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Groups feature coming soon',
    data: { groups: [] }
  });
});

module.exports = router;
