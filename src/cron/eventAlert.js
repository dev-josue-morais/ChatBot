const cron = require('node-cron');
const { DateTime } = require('luxon');
const { getNowBRT, formatLocal } = require('../utils/utils');
const supabase = require('../services/supabase');
const { sendWhatsAppMessage } = require('../services/whatsappService');
const {
  loadInitialEventsCache,
  getEventsCache,
  removeEventFromCache,
  startDayChangeWatcher
} = require('./eventCache');

function scheduleEventAlerts() {
  // 🔹 Carrega cache inicial e começa a monitorar virada do dia
  loadInitialEventsCache();
  startDayChangeWatcher();

  // 🔹 Executa a cada 1 minuto
  cron.schedule('*/1 * * * *', async () => {
    try {
      const eventsCache = getEventsCache();
      if (eventsCache.length === 0) return;

      const nowBRT = getNowBRT();

      for (const event of [...eventsCache]) {
        const eventDateBRT = DateTime.fromISO(event.date, { zone: 'America/Sao_Paulo' });
        const diffMinutes = eventDateBRT.diff(nowBRT, 'minutes').minutes;

        // Se o evento está dentro da janela de lembrete
        if (diffMinutes <= (event.reminder_minutes || 30) && diffMinutes >= 0) {
          const userPhone = event.user_telefone;
          if (!userPhone) continue;

          try {
            await sendWhatsAppMessage(
              userPhone,
              `⏰ Lembrete: "ID ${event.event_numero} ${event.title}" às ${formatLocal(event.date)}`
            );

            await supabase.from('events').update({ notified: true }).eq('id', event.id);
            removeEventFromCache(event.id);
          } catch (err) {
            console.error(`❌ Erro ao enviar lembrete para ${userPhone}:`, err);
          }
        }
      }
    } catch (err) {
      console.error('💥 Erro no cron de alerta de eventos:', err);
    }
  }, { timezone: 'America/Sao_Paulo' });
}

module.exports = { scheduleEventAlerts };