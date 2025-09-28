// src/services/cronService.js
const cron = require('node-cron');
const { getNowBRT, formatLocal } = require('./utils');
const supabase = require('./supabaseClient');
const { sendWhatsAppMessage } = require('./whatsappService');
const { DESTINO_FIXO } = require('../config');

function scheduleDailySummary(destination = DESTINO_FIXO) {
  cron.schedule('0 7 * * *', async () => {
    try {
      console.log('Rodando cron job diário das 7h...');

      const start = getNowBRT().startOf("day").toUTC().toISO();
      const end = getNowBRT().endOf("day").toUTC().toISO();

      const { data: events, error } = await supabase
        .from('events')
        .select('*')
        .gte('date', start)
        .lte('date', end);

      if (error) {
        console.error('Erro ao buscar eventos para resumo diário:', error);
        return;
      }

      if (!events || events.length === 0) {
        console.log('Nenhum evento para o resumo diário.');
        return; // não envia mensagem
      }

      const list = events
        .map(e => `- ${e.title} às ${formatLocal(e.date)}`)
        .join('\n');

      await sendWhatsAppMessage(destination, `📅 Seus eventos de hoje:\n${list}`);
      console.log('Resumo diário enviado com sucesso.');

    } catch (err) {
      console.error('Erro no cron job diário:', err);
    }
  }, { timezone: "America/Sao_Paulo" });
}

module.exports = {
  scheduleDailySummary
};
