const { forwardMediaIfAny, sendWhatsAppRaw, extractTextFromMsg } = require('./whatsappService');
const { supabase } = require('./supabase');
const { DateTime } = require('luxon');
const DESTINO_FIXO = require('../utils/config');

/**
 * Trata mensagens recebidas de usuários não cadastrados.
 * - Encaminha texto e mídia para o número fixo.
 * - Envia aviso automático de redirecionamento uma única vez a cada 24h.
 */
export async function handleUnregisteredUser(msg, value) {
  try {
    const senderNumber = msg.from;
    const senderName = msg?.profile?.name || "Contato desconhecido";

    const now = DateTime.now().setZone("America/Sao_Paulo");
    const saudacao =
      now.hour >= 5 && now.hour < 12
        ? "Bom dia"
        : now.hour < 18
          ? "Boa tarde"
          : "Boa noite";

    // 🔹 Extrai texto principal
    let myText;
    if (msg.type === "interactive" && msg.interactive?.button_reply) {
      myText = msg.interactive.button_reply.title.toLowerCase();
    } else {
      myText = extractTextFromMsg(msg)?.trim();
    }

    // 🔹 Encaminha texto ao número fixo
    if (myText) {
      const forwardText = `📥 Mensagem de ${senderName} (${senderNumber}):\n\n${myText}`;
      await sendWhatsAppRaw({
        messaging_product: "whatsapp",
        to: DESTINO_FIXO,
        type: "text",
        text: { body: forwardText },
      });
    }

    // 🔹 Encaminha mídia (imagem, áudio, documentos)
    await forwardMediaIfAny(msg, value, DESTINO_FIXO);

    // 🔹 Evita envio duplicado do aviso
    const { data: alreadySent } = await supabase
      .from("redirects")
      .select("*")
      .eq("phone", senderNumber)
      .maybeSingle();

    if (!alreadySent) {
      // limpa registros antigos (>24h)
      await supabase
        .from("redirects")
        .delete()
        .lt(
          "sent_at",
          new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        );

      // envia mensagem de redirecionamento
      await sendWhatsAppRaw({
        messaging_product: "whatsapp",
        to: senderNumber,
        type: "text",
        text: {
          body: `${saudacao}! Você está tentando falar com Josué Eletricista.\nPor favor, entre em contato no novo número: (064) 99286-9608.`,
        },
      });

      // registra o envio
      await supabase.from("redirects").insert([{ phone: senderNumber }]);
    }

    console.log(`↪️ Mensagem de número não cadastrado encaminhada: ${senderNumber}`);
  } catch (err) {
    console.error("❌ Erro em handleUnregisteredUser:", err);
  }
}
