const express = require('express');
const router = express.Router();
const { updateCacheFromWebhook } = require('../cron/eventCache');
const { GITHUB_SECRET } = require('../utils/config');

router.post('/', (req, res) => {
  try {
    let body = req.body;

    // 🔹 Caso o Supabase envie string JSON
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        console.warn('⚠️ Webhook recebeu payload não parseável:', body);
      }
    }

    const auth = req.headers.authorization;
    const { event, data, secret } = body;

    if (auth !== `Bearer ${GITHUB_SECRET}` && secret !== GITHUB_SECRET) {
      console.warn('🚫 Tentativa de acesso não autorizado ao webhook Supabase.');
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!event || !data) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    console.log(`📩 Atualização recebida do Supabase: ${event} → ${data.title || data.id}`);
    updateCacheFromWebhook(event, data);

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('❌ Erro no webhook Supabase:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;