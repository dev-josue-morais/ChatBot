const express = require('express');
const router = express.Router();
const { getNowBRT, formatPhone } = require('../services/utils');
const { processAgendaCommand } = require('../services/agendaService');
const { sendWhatsAppRaw, extractTextFromMsg, forwardMediaIfAny } = require('../services/whatsappService');
const supabase = require('../services/supabase');
const { WEBHOOK_VERIFY_TOKEN, DESTINO_FIXO } = require('../../config');

// GET webhook (verificação do Facebook)
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token === WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// POST webhook (mensagens)
router.post('/', async (req, res, next) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const messages = value?.messages;
    if (!messages) return res.sendStatus(200);

    for (let msg of messages) {
      const contact = value.contacts?.[0];
      if (!contact) continue;

      const senderName = contact.profile?.name || 'Usuário';
      const senderNumber = contact.wa_id;
      if (!senderNumber) continue;
      const formattedNumber = formatPhone(senderNumber);

      if (!/Eletricaldas/i.test(senderName)) {
        const text = extractTextFromMsg(msg);
        if (text) {
          const forwardText = `📥 Mensagem de ${senderName} ${formattedNumber}:\n\n${text}`;
          await sendWhatsAppRaw({ messaging_product: "whatsapp", to: DESTINO_FIXO, type: "text", text: { body: forwardText } });
        }

        await forwardMediaIfAny(msg, value, DESTINO_FIXO);

        const { data: alreadySent } = await supabase.from('redirects').select('*').eq('phone', senderNumber).maybeSingle();
        if (!alreadySent) {
          await supabase.from('redirects').delete().lt('sent_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

          const hour = getNowBRT().hour;
          let saudacao = "Olá";
          if (hour >= 5 && hour < 12) saudacao = "Bom dia";
          else if (hour >= 12 && hour < 18) saudacao = "Boa tarde";
          else saudacao = "Boa noite";

          await sendWhatsAppRaw({
            messaging_product: "whatsapp",
            to: senderNumber,
            type: "text",
            text: { body: `${saudacao}! Você está tentando falar com Josué Eletricista.\nFavor entrar em contato no novo número (064) 99286-9608.` }
          });

          await supabase.from('redirects').insert([{ phone: senderNumber }]);
        }

        continue;
      }

      // Mensagens de Eletricaldas
      if (/Eletricaldas/i.test(senderName)) {
        const myText = extractTextFromMsg(msg);
        const responseText = await processAgendaCommand(myText);
        await sendWhatsAppRaw({ messaging_product: "whatsapp", to: DESTINO_FIXO, type: "text", text: { body: responseText } });
      }
    }

    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
