const express = require('express');
const router = express.Router();
const { updateCacheFromWebhook } = require('../cron/eventCache');
const { GITHUB_SECRET } = require('../utils/config');

router.post('/', (req, res) => {
const auth = req.headers.authorization;
const { event, data, secret } = req.body;

// Permite autenticar via header OU corpo
if (auth !== Bearer ${GITHUB_SECRET} && secret !== GITHUB_SECRET) {
console.warn('🚫 Tentativa de acesso não autorizado ao webhook Supabase.');
return res.status(403).json({ error: 'Forbidden' });
}

if (!event || !data) {
return res.status(400).json({ error: 'Invalid payload' });
}

console.log(📩 Atualização recebida do Supabase: ${event} → ${data.title || data.id});

updateCacheFromWebhook(event, data);

res.status(200).json({ ok: true });
});

module.exports = router;