const express = require('express');
const router = express.Router();
const { getNowBRT } = require('../utils/utils');
const { processCommand } = require('../services/processCommand');
const { sendWhatsAppRaw, extractTextFromMsg } = require('../services/whatsappService');
const supabase = require('../services/supabase');
const { WEBHOOK_VERIFY_TOKEN } = require('../utils/config');
const createCheckoutPreference = require('../utils/mercadopago');
const processedIds = new Set();
setInterval(() => processedIds.clear(), 2 * 60 * 1000);
const { continueUserRegistration } = require('../services/userRegistration');
const { handleUploads } = require('../services/uploads');
const { handleUnregisteredUser } = require('../services/handleUnregisteredUser');
const { handleCommands, handleUserRegistrationCommand } = require("../services/handleCommands");

// ✅ GET webhook (verificação do Meta)
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode && token === WEBHOOK_VERIFY_TOKEN) return res.status(200).send(challenge);
  res.sendStatus(403);
});

// ✅ POST webhook (mensagens)
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
      if (processedIds.has(msg.id)) continue;
      processedIds.add(msg.id);
      const senderName = contact.profile?.name || 'Usuário';
      const senderNumber = contact.wa_id;
      if (!senderNumber) continue;

      const botNumber = value?.metadata?.phone_number_id?.replace(/\D/g, '');
      if (senderNumber === botNumber) continue;

      // Ignora mensagens muito antigas (mais de 90s)
      const msgTimestamp = Number(msg.timestamp) * 1000;
      if (Date.now() - msgTimestamp > 90000) continue;

      const myText = extractTextFromMsg(msg)?.trim();
      await supabase.rpc('cleanup_old_sessions');

      const { data: session } = await supabase
        .from('user_sessions')
        .select('*')
        .eq('telefone', senderNumber)
        .maybeSingle();

      const uploadHandled = await handleUploads(msg, session, senderNumber);
      if (uploadHandled) continue;

      // --- Cancelar cadastro ---
      if (session && /^cancelar$/i.test(myText)) {
        await supabase.from('user_sessions').delete().eq('telefone', senderNumber);
        await sendWhatsAppRaw({
          messaging_product: "whatsapp",
          to: senderNumber,
          type: "text",
          text: { body: "❌ Cadastro cancelado.\npara recomeçar digite Criar usuário" }
        });
        continue;
      }

      // --- Verifica se o usuário existe ---
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('telefone', senderNumber)
        .maybeSingle();

      const now = getNowBRT();
      const handledRegistration = await handleUserRegistrationCommand(myText, senderNumber, userData);
      if (handledRegistration) continue;

      // --- Trata comandos conhecidos ---
      const handled = await handleCommands(myText, senderNumber, userData, now);
      if (handled) continue;
      
      // --- Cadastro passo a passo ---
      if (session && session.step > 0) {
        await continueUserRegistration(session, senderNumber, myText);
        continue;
      }

      // --- Usuário sem cadastro ---
      if (!userData) {
        await handleUnregisteredUser(msg, value);
        continue;
      }

      // Ignora mensagens sem conteúdo relevante ou com menos de 2 palavras
      if (
        (!myText && !msg.type?.match(/text|interactive|image|document|audio|video|sticker/)) ||
        (myText && myText.split(/\s+/).length < 3)
      ) {
        continue;
      }

      // --- Processa comandos normais ---
      const responseText = await processCommand(myText, senderNumber);
      await sendWhatsAppRaw({
        messaging_product: "whatsapp",
        to: senderNumber,
        type: "text",
        text: { body: responseText }
      });
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Erro no webhook:", err);
    next(err);
  }
});

module.exports = router;