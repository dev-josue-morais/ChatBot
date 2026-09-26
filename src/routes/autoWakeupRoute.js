const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  console.log('🔄 Keep Alive recebido:', new Date().toISOString());

  res.status(200).json({
    success: true,
    message: 'Keep Alive OK',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;