const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.send("✅ API Online - Eletricaldas");
});

module.exports = router;
