const express = require('express');
const router = express.Router();
const { getNowBRT, formatLocal } = require('../utils/utils');
const { sendWhatsAppMessage } = require('../services/whatsappService');
const supabase = require('../services/supabase');
const { DateTime } = require('luxon');

router.get('/', async (req, res, next) => {
  try {
    const nowBRT = getNowBRT(); // horário atual GMT-3

    // Busca todos os eventos ainda não notificados e futuros (hora local)
    const { data: events, error } = await supabase
      .from('events')
      .select('*')
      .gte('date', nowBRT.toISO()) // removido .toUTC()
      .eq('notified', false);

    if (error) {
      console.error('Erro ao buscar eventos para alerta:', error);
      return res.status(500).send('Erro ao buscar eventos');
    }

    if (!events || events.length === 0) {
      console.log('Nenhum evento para alerta neste momento.');
      return res.send('Nenhum evento encontrado');
    }

    let notifiedCount = 0;

    for (let event of events) {
      const now = getNowBRT(); // hora local
      const eventDateBRT = DateTime.fromISO(event.date, { zone: 'America/Sao_Paulo' }); // mantém GMT-3
      const diffMinutes = eventDateBRT.diff(now, 'minutes').minutes;

      // Envia se estiver dentro da janela de lembrete
      if (diffMinutes <= (event.reminder_minutes || 30) && diffMinutes >= 0) {
        const userPhone = event.user_telefone;

        if (!userPhone) {
          console.warn(`Evento ${event.id} sem telefone de usuário vinculado.`);
          continue;
        }

        // Envia mensagem ao dono do evento
        await sendWhatsAppMessage(
          userPhone,
          `⏰ Lembrete: "ID ${event.event_numero} ${event.title}" às ${formatLocal(event.date)}`
        );

        // Marca como notificado
        await supabase
          .from('events')
          .update({ notified: true })
          .eq('id', event.id);

        console.log(`✅ Evento ID ${event.event_numero} "${event.title}" notificado para ${userPhone}`);
        notifiedCount++;
      }
    }

    res.send(`✅ Eventos processados: ${notifiedCount}`);
  } catch (err) {
    console.error('Erro no lembrete de eventos:', err);
    next(err);
  }
});

module.exports = router;