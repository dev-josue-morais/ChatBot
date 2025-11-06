const cron = require('node-cron');
const { DateTime } = require('luxon');
const { getNowBRT, formatLocal } = require('../utils/utils');
const supabase = require('../services/supabase');
const { sendWhatsAppMessage } = require('../services/whatsappService');
const {
  loadInitialEventsCache,
  getEventsCache,
  removeEventFromCache
} = require('./eventCache');

function scheduleEventAlerts() {
  loadInitialEventsCache(); // carrega cache no startup

  cron.schedule('*/1 * * * *', async () => {
    try {
      const eventsCache = getEventsCache();
      const nowBRT = getNowBRT();

    if (eventsCache.length === 0) return; // sem log
      let notifiedCount = 0;

      for (const event of [...eventsCache]) {
        const eventDateBRT = DateTime.fromISO(event.date, { zone: 'America/Sao_Paulo' });
        const diffMinutes = eventDateBRT.diff(nowBRT, 'minutes').minutes;

        if (diffMinutes <= (event.reminder_minutes || 30) && diffMinutes >= 0) {
          const userPhone = event.user_telefone;

          if (!userPhone) {
            console.warn(`⚠️ Evento ${event.id} sem telefone vinculado.`);
            continue;
          }

          try {
            await sendWhatsAppMessage(
              userPhone,
              `⏰ Lembrete: "ID ${event.event_numero} ${event.title}" às ${formatLocal(event.date)}`
            );

            await supabase.from('events').update({ notified: true }).eq('id', event.id);
            removeEventFromCache(event.id);

            console.log(`✅ Notificado e removido do cache: ${event.title} (${event.event_numero}) → ${userPhone}`);
            notifiedCount++;
          } catch (err) {
            console.error(`❌ Erro ao enviar lembrete para ${userPhone}:`, err);
          }
        }
      }

      console.log(`📨 Lembretes enviados: ${notifiedCount}`);
      console.log(`🧠 Eventos restantes no cache: ${getEventsCache().length}`);
    } catch (err) {
      console.error('💥 Erro no cron de alerta de eventos:', err);
    }
  }, { timezone: 'America/Sao_Paulo' });
}

module.exports = { scheduleEventAlerts };