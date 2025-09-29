const express = require('express');
const router = express.Router();
const { getNowBRT, formatLocal } = require('../utils/utils');
const { sendWhatsAppMessage } = require('../services/whatsappService');
const supabase = require('../services/supabase');
const { DateTime } = require('luxon');
const { DESTINO_FIXO } = require('../utils/config');

router.get('/', async (req, res, next) => {
  try {
    const nowBRT = getNowBRT();
    const { data: events, error } = await supabase
      .from('events')
      .select('*')
      .gte('date', nowBRT.toUTC().toISO())
      .eq('notified', false);

    if (error) {
      console.error('Erro ao buscar eventos para alerta:', error);
      return res.status(500).send('Erro ao buscar eventos');
    }

    if (!events || events.length === 0) {
      console.log('Nenhum evento para alerta neste momento.');
      return res.send('Nenhum evento encontrado');
    }

    for (let event of events) {
      const nowBRT = getNowBRT();
      const eventDateBRT = DateTime.fromISO(event.date, { zone: 'utc' }).setZone('America/Sao_Paulo');
      const diffMinutes = eventDateBRT.diff(nowBRT, 'minutes').minutes;

      if (diffMinutes <= (event.reminder_minutes || 30) && diffMinutes >= 0) {
        await sendWhatsAppMessage(
          DESTINO_FIXO,
          `⏰ Lembrete: "${event.title}" às ${formatLocal(event.date)}`
        );

        await supabase
          .from('events')
          .update({ notified: true })
          .eq('id', event.id);

        console.log(`Evento "${event.title}" notificado com sucesso.`);
      }
    }

    res.send(`✅ Eventos processados: ${events.length}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
