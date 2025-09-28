// /routes/renewTokenRoute.js
const express = require('express');
const axios = require('axios');
const router = express.Router();
const { GITHUB_SECRET, RENDER_SERVICE_ID, RENDER_API_KEY, APP_ID, APP_SECRET, WHATSAPP_TOKEN } = require('../config');

router.post('/', async (req, res, next) => {
  if (req.headers.authorization !== `Bearer ${GITHUB_SECRET}`) {
    return res.status(403).send('Não autorizado');
  }

  try {
    // 1️⃣ Pegar novo token do WhatsApp
    const tokenResp = await axios.get('https://graph.facebook.com/v22.0/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: APP_ID,
        client_secret: APP_SECRET,
        fb_exchange_token: WHATSAPP_TOKEN
      }
    });

    const newToken = tokenResp.data.access_token;

    // 2️⃣ Buscar variáveis de ambiente do Render
    const envResp = await axios.get(
      `https://api.render.com/v1/services/${RENDER_SERVICE_ID}/env-vars`,
      { headers: { Authorization: `Bearer ${RENDER_API_KEY}` } }
    );

    // 3️⃣ Atualizar variável WHATSAPP_TOKEN
    const envVars = envResp.data.map(ev => ({
      key: ev.envVar.key,
      value: ev.envVar.key === 'WHATSAPP_TOKEN' ? newToken : ev.envVar.value,
      sync: true
    }));

    await axios.put(
      `https://api.render.com/v1/services/${RENDER_SERVICE_ID}/env-vars`,
      envVars,
      { headers: { Authorization: `Bearer ${RENDER_API_KEY}`, 'Content-Type': 'application/json' } }
    );

    res.send('Token renovado e variável atualizada com sucesso!');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
