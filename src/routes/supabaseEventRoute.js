const express = require('express');
const router = express.Router();
const { updateCacheFromWebhook } = require('../cron/eventAlert'); 
const SUPABASE_TOKEN = process.env.SUPABASE_WEBHOOK_TOKEN;

// Endpoint que o Supabase vai chamar via trigger
router.post('/', (req, res) => {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${SUPABASE_TOKEN}`) {
    console.warn('🚫 Tentativa de acesso não autorizado ao webhook Supabase.');
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { event, data } = req.body;

  if (!event || !data) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  console.log(`📩 Atualização recebida do Supabase: ${event} → ${data.title || data.id}`);

  // Atualiza o cache em memória
  updateCacheFromWebhook(event, data);

  res.sendStatus(200);
});

module.exports = router;