const express = require('express');
const router = express.Router();

const { sendWhatsAppRaw } = require('../services/whatsappService');
const { DESTINO_FIXO } = require('../utils/config');

router.get('/', async (req, res) => {
  try {
    await sendWhatsAppRaw({
      messaging_product: "whatsapp",
      to: String(DESTINO_FIXO),
      type: "text",
      text: {
        body: "🔄 Auto Wakeup"
      }
    });

    console.log('✅ Auto Wakeup enviado com sucesso.');

    res.status(200).json({
      success: true,
      message: 'Auto Wakeup enviado com sucesso.'
    });

  } catch (error) {
    console.error(
      '❌ Erro no Auto Wakeup:',
      error.response?.data || error.message
    );

    res.status(500).json({
      success: false,
      message: 'Erro ao enviar Auto Wakeup.'
    });
  }
});

module.exports = router;