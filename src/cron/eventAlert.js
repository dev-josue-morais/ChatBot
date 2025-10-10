const cron = require('node-cron');
const { DateTime } = require('luxon');
const { getNowBRT, formatLocal } = require('../utils/utils');
const supabase = require('../services/supabase');
const { sendWhatsAppMessage } = require('../services/whatsappService');

function scheduleEventAlerts() {
  cron.schedule('*/10 * * * *', async () => {
    try {
      const nowBRT = getNowBRT(); // hora local (GMT-3)
      const limitTime = nowBRT.plus({ minutes: 75 }); // até 75 minutos no futuro

      // busca eventos dentro da janela e ainda não notificados
      const { data: events, error } = await supabase
        .from('events')
        .select('*')
        .lte('date', limitTime.toUTC().toISO())
        .gte('date', nowBRT.toUTC().toISO())
        .eq('notified', false);

      if (error) {
        console.error('❌ Erro ao buscar eventos para alerta:', error);
        return;
      }

      if (!events || events.length === 0) {
        console.log('⏰ Nenhum evento próximo para alerta.');
        return;
      }

      let notifiedCount = 0;

      for (let event of events) {
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

            await supabase
              .from('events')
              .update({ notified: true })
              .eq('id', event.id);

            console.log(`✅ Notificado: ${event.title} (${event.event_numero}) → ${userPhone}`);
            notifiedCount++;
          } catch (err) {
            console.error(`❌ Erro ao enviar lembrete para ${userPhone}:`, err);
          }
        }
      }

      console.log(`📨 Lembretes enviados: ${notifiedCount}`);
    } catch (err) {
      console.error('💥 Erro no cron de alerta de eventos:', err);
    }
  }, { timezone: 'America/Sao_Paulo' });
}

module.exports = { scheduleEventAlerts };