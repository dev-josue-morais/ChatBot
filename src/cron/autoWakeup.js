const cron = require('node-cron');
const { sendWhatsAppRaw } = require('../services/whatsappService');
const { BOT_NUMBER } = require('../utils/config');

function scheduleAutoWakeup() {
  cron.schedule('*/13 * * * *', async () => {
    try {
      await sendWhatsAppRaw({
        messaging_product: "whatsapp",
        to: String(BOT_NUMBER),
        type: "text",
        text: {
          body: "🔄 Auto Wakeup"
        }
      });

      // console.log('✅ Auto Wakeup enviado com sucesso.');
    } catch (err) {
      console.error(
        '❌ Erro no Auto Wakeup:',
        err.response?.data || err.message
      );
    }
  }, {
    timezone: 'America/Sao_Paulo'
  });
}

module.exports = { scheduleAutoWakeup };