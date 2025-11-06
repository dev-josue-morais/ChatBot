const express = require('express');
const router = express.Router();
const { updateCacheFromWebhook } = require('../cron/eventCache');
const { GITHUB_SECRET } = require('../utils/config');

router.post('/', (req, res) => {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${GITHUB_SECRET}`) {
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