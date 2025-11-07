const express = require('express');
const router = express.Router();

// Rota de debug: ver exatamente o que o Supabase envia
router.post('/', express.text({ type: '*/*' }), (req, res) => {
  console.log('==============================');
  console.log('📬 NOVO POST RECEBIDO DO SUPABASE');
  console.log('Headers:', req.headers);
  console.log('Body (raw text):', req.body);
  console.log('==============================');

  res.status(200).json({ ok: true });
});

module.exports = router;