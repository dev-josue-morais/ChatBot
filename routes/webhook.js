const express = require("express");
const router = express.Router();
const { sendWhatsAppRaw, sendWhatsAppMessage } = require("../services/whatsapp");
const { reuploadMedia } = require("../services/media");
const { formatPhone, getNowBRT, formatLocal } = require("../services/utils");
const { processAgendaCommand } = require("../services/agenda");
const { supabase } = require("../config/supabase");

const DESTINO_FIXO = process.env.DESTINO_FIXO;

router.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

router.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const messages = value?.messages;
    if (!messages) return res.sendStatus(200);

    // extrair texto
    function extractTextFromMsg(msg) {
      return (
        msg.text?.body ||
        msg.button?.text ||
        msg.interactive?.button_reply?.title ||
        msg.interactive?.list_reply?.title ||
        msg.system?.body ||
        msg.caption ||
        ""
      );
    }

    async function forwardMediaIfAny(msg, dest = DESTINO_FIXO) {
      try {
        const docId =
          msg.document?.id || msg.document?.media_id || msg.document?.wa_id;
        const audioId =
          msg.audio?.id || msg.audio?.media_id || msg.audio?.wa_id;
        const imageId =
          msg.image?.id || msg.image?.media_id || msg.image?.wa_id;
        const videoId =
          msg.video?.id || msg.video?.media_id || msg.video?.wa_id;

        let mediaId = docId || audioId || imageId || videoId;
        if (!mediaId) return false;

        const type = docId
          ? "document"
          : audioId
          ? "audio"
          : imageId
          ? "image"
          : videoId
          ? "video"
          : "unknown";
        const mimeType =
          msg.document?.mime_type ||
          msg.audio?.mime_type ||
          msg.image?.mime_type ||
          msg.video?.mime_type;
        const filename = msg.document?.filename || "arquivo";

        const contact = value.contacts?.[0];
        if (!contact) return false;
        const senderName = contact.profile?.name || "Usuário";
        const senderNumber = contact.wa_id || "noNumber";
        const formattedNumber = formatPhone(senderNumber);

        const newId = await reuploadMedia(mediaId, mimeType, filename);
        if (!newId) return false;

        const aviso = `📥 Nova mensagem de ${senderName} ${formattedNumber}`;
        await sendWhatsAppRaw({
          messaging_product: "whatsapp",
          to: dest,
          type: "text",
          text: { body: aviso },
        });

        let payload;
        if (type === "document") {
          payload = {
            messaging_product: "whatsapp",
            to: dest,
            type: "document",
            document: { id: newId, filename },
          };
        } else if (type === "audio") {
          payload = {
            messaging_product: "whatsapp",
            to: dest,
            type: "audio",
            audio: { id: newId },
          };
        } else if (type === "image") {
          payload = {
            messaging_product: "whatsapp",
            to: dest,
            type: "image",
            image: { id: newId },
          };
        } else if (type === "video") {
          payload = {
            messaging_product: "whatsapp",
            to: dest,
            type: "video",
            video: { id: newId },
          };
        }

        await sendWhatsAppRaw(payload);
        return true;
      } catch (err) {
        console.error(
          "Erro em forwardMediaIfAny:",
          err.response?.data || err.message || err
        );
        return false;
      }
    }

    for (let msg of messages) {
      const contact = value.contacts?.[0];
      if (!contact) continue;

      const senderName = contact.profile?.name || "Usuário";
      const senderNumber = contact.wa_id;
      if (!senderNumber) continue;
      const formattedNumber = formatPhone(senderNumber);

      // Cliente
      if (!/Eletricaldas/i.test(senderName)) {
        const text = extractTextFromMsg(msg);
        if (text) {
          const forwardText = `📥 Mensagem de ${senderName} ${formattedNumber}:\n\n${text}`;
          await sendWhatsAppRaw({
            messaging_product: "whatsapp",
            to: DESTINO_FIXO,
            type: "text",
            text: { body: forwardText },
          });
        }

        await forwardMediaIfAny(msg, DESTINO_FIXO);

        // Redirecionamento automático
        const { data: alreadySent } = await supabase
          .from("redirects")
          .select("*")
          .eq("phone", senderNumber)
          .maybeSingle();

        if (!alreadySent) {
          await supabase
            .from("redirects")
            .delete()
            .lt(
              "sent_at",
              new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
            );

          const hour = getNowBRT().hour;
          let saudacao = "Olá";
          if (hour >= 5 && hour < 12) saudacao = "Bom dia";
          else if (hour >= 12 && hour < 18) saudacao = "Boa tarde";
          else saudacao = "Boa noite";

          await sendWhatsAppRaw({
            messaging_product: "whatsapp",
            to: senderNumber,
            type: "text",
            text: {
              body: `${saudacao}! Você está tentando falar com Josué Eletricista.\nFavor entrar em contato no novo número (064) 99286-9608.`,
            },
          });

          await supabase.from("redirects").insert([{ phone: senderNumber }]);
        }
        continue;
      }

      // Suas mensagens (comandos GPT)
      if (/Eletricaldas/i.test(senderName)) {
        const myText = extractTextFromMsg(msg);
        const responseText = await processAgendaCommand(myText);
        await sendWhatsAppRaw({
          messaging_product: "whatsapp",
          to: DESTINO_FIXO,
          type: "text",
          text: { body: responseText },
        });
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Erro geral no /webhook:", err.response?.data || err.message || err);
    res.sendStatus(500);
  }
});

module.exports = router;
