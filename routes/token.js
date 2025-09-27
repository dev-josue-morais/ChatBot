const express = require("express");
const axios = require("axios");
const router = express.Router();

router.get("/token", async (req, res) => {
  try {
    const resp = await axios.get(
      `https://graph.facebook.com/v21.0/debug_token?input_token=${process.env.WHATSAPP_TOKEN}&access_token=${process.env.WHATSAPP_TOKEN}`
    );
    res.json(resp.data);
  } catch (err) {
    res.status(500).json({
      error: err.response?.data || err.message,
    });
  }
});

module.exports = router;
