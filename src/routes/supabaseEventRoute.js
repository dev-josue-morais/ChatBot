const express = require('express');
const router = express.Router();
const { updateCacheFromWebhook } = require('../cron/eventCache');
const { GITHUB_SECRET } = require('../utils/config');

// 🔹 Middleware: força corpo em texto cru (Supabase envia como texto JSON)
router.use(express.text({ type: '*/*' }));

router.post('/', (req, res) => {
  try {
    let body = req.body;

    // 🔹 Se o corpo for string JSON, faz o parse manual
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        console.warn('⚠️ Webhook recebeu payload não parseável:', body);
      }
    }

    const auth = req.headers.authorization;
    const { event, data, secret } = body;

    // 🔐 Autenticação via header ou body
    if (auth !== `Bearer ${GITHUB_SECRET}` && secret !== GITHUB_SECRET) {
      console.warn('🚫 Tentativa de acesso não autorizado ao webhook Supabase.');
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!event || !data) {
      console.warn('⚠️ Payload inválido recebido:', body);
      return res.status(400).json({ error: 'Invalid payload' });
    }

    console.log(`📩 Atualização recebida do Supabase: ${event} → ${data.title || data.id}`);
    updateCacheFromWebhook(event, data);

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('💥 Erro no webhook Supabase:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;