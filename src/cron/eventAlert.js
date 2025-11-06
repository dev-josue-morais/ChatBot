const cron = require('node-cron');
const { DateTime } = require('luxon');
const { getNowBRT, formatLocal } = require('../utils/utils');
const supabase = require('../services/supabase');
const { sendWhatsAppMessage } = require('../services/whatsappService');

let eventsCache = []; // 🧠 memória local para eventos futuros e não notificados

// Carrega eventos futuros ainda não notificados no startup
async function loadInitialEventsCache() {
  const now = getNowBRT();

  const { data, error } = await supabase
    .from('events')
    .select('*')
    .gte('date', now.toUTC().toISO())
    .eq('notified', false);

  if (error) {
    console.error('❌ Erro ao carregar cache inicial:', error);
    return;
  }

  eventsCache = data || [];
  console.log(`✅ Cache inicial carregado com ${eventsCache.length} eventos futuros.`);
}

// Remove evento do cache após ser notificado
function removeEventFromCache(id) {
  eventsCache = eventsCache.filter(e => e.id !== id);
}

// Função principal do cron
function scheduleEventAlerts() {
  // Carregar cache assim que o Render acordar
  loadInitialEventsCache();

  // Rodar cron a cada 10 minutos (usando apenas o cache)
  cron.schedule('*/10 * * * *', async () => {
    try {
      if (eventsCache.length === 0) {
        console.log('📭 Nenhum evento no cache.');
        return;
      }

      const nowBRT = getNowBRT();
      let notifiedCount = 0;

      for (let event of [...eventsCache]) { // copiar pra evitar mutação durante loop
        const eventDateBRT = DateTime.fromISO(event.date, { zone: 'America/Sao_Paulo' });
        const diffMinutes = eventDateBRT.diff(nowBRT, 'minutes').minutes;

        // Verifica se está dentro do tempo de alerta
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

            // Marca como notificado no Supabase
            await supabase
              .from('events')
              .update({ notified: true })
              .eq('id', event.id);

            // Remove do cache
            removeEventFromCache(event.id);

            console.log(`✅ Notificado e removido do cache: ${event.title} (${event.event_numero}) → ${userPhone}`);
            notifiedCount++;
          } catch (err) {
            console.error(`❌ Erro ao enviar lembrete para ${userPhone}:`, err);
          }
        }
      }

      console.log(`📨 Lembretes enviados nesta execução: ${notifiedCount}`);
      console.log(`🧠 Eventos restantes no cache: ${eventsCache.length}`);
    } catch (err) {
      console.error('💥 Erro no cron de alerta de eventos:', err);
    }
  }, { timezone: 'America/Sao_Paulo' });
}

module.exports = { scheduleEventAlerts, eventsCache, loadInitialEventsCache };