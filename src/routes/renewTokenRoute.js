// /routes/renewTokenRoute.js
const express = require('express');
const axios = require('axios');
const router = express.Router();
const { GITHUB_SECRET, RENDER_SERVICE_ID, RENDER_API_KEY, APP_ID, APP_SECRET, WHATSAPP_TOKEN } = require('../utils/config');

router.post('/', async (req, res, next) => {
  if (req.headers.authorization !== `Bearer ${GITHUB_SECRET}`) {
    return res.status(403).send('Não autorizado');
  }

  console.log('🔄 Iniciando renovação do token WhatsApp:', new Date().toISOString());

  try {
    // 1️⃣ Pega novo token
    const tokenResp = await axios.get('https://graph.facebook.com/v22.0/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: APP_ID,
        client_secret: APP_SECRET,
        fb_exchange_token: WHATSAPP_TOKEN
      }
    });

    const newToken = tokenResp.data?.access_token;
    if (!newToken) {
      console.error('❌ Não foi possível obter um novo token:', tokenResp.data);
      return res.status(500).send('Falha ao renovar token');
    }

    console.log('✅ Novo token obtido com sucesso.');

    // 2️⃣ Buscar variáveis de ambiente atuais
    const envResp = await axios.get(
      `https://api.render.com/v1/services/${RENDER_SERVICE_ID}/env-vars`,
      { headers: { Authorization: `Bearer ${RENDER_API_KEY}` } }
    );

    // 3️⃣ Atualizar apenas se realmente obteve token válido
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

    console.log('🚀 Variável WHATSAPP_TOKEN atualizada com sucesso no Render.');
    res.send('Token renovado com sucesso.');
  } catch (err) {
    console.error('❌ Erro ao renovar token:', err.response?.data || err.message);
    res.status(500).send('Erro ao renovar token');
  }
});

module.exports = router;
