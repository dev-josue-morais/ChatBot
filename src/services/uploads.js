const fetch = require('node-fetch');
const supabase = require('./supabase');
const { sendWhatsAppRaw } = require('./whatsappService');
const { processLogoZip } = require('../utils/processLogoZip');
const { WHATSAPP_TOKEN } = require("../utils/config");

/**
 * Trata uploads de logo, assinatura e imagem Pix enviados pelo usuário
 */
async function handleUploads(msg, session, senderNumber) {
  try {
    // --- Upload de assinatura via ZIP ---
    if (msg.type === "document" && session?.answers?.type === "assinatura_img" && msg.document.mime_type === "application/zip") {
      const mediaId = msg.document?.id;
      if (!mediaId) {
        await sendWhatsAppRaw({
          messaging_product: "whatsapp",
          to: senderNumber,
          type: "text",
          text: { body: "⚠️ Não consegui obter o arquivo da assinatura. Tente novamente." }
        });
        return true;
      }

      // Processa o ZIP com tipo "assinatura"
      await processLogoZip(senderNumber, mediaId, "assinatura");

      // Limpa sessão do usuário
      await supabase.from("user_sessions").delete().eq("telefone", senderNumber);

      // Confirmação
      await sendWhatsAppRaw({
        messaging_product: "whatsapp",
        to: senderNumber,
        type: "text",
        text: { body: "✅ Assinatura recebida e processada com sucesso!\nAgora ela será usada automaticamente nos seus PDFs. 🖋️" }
      });

      return true;
    }

    // --- Upload de logo via ZIP ---
    if (msg.type === "document" && session?.answers?.type === "logo_img" && msg.document.mime_type === "application/zip") {
      const mediaId = msg.document.id;
      if (!mediaId) throw new Error("ID do documento não encontrado.");
      
      // Processa o ZIP com tipo "logo" (padrão)
      await processLogoZip(senderNumber, mediaId, "logo");

      await supabase.from("user_sessions").delete().eq("telefone", senderNumber);
      return true;
    }

    // --- Upload de imagem do Pix ---
    if (msg.type === "image" && session?.answers?.type === "pix_img") {
      const mediaId = msg.image?.id;
      if (!mediaId) {
        await sendWhatsAppRaw({ messaging_product: "whatsapp", to: senderNumber, type: "text", text: { body: "⚠️ Não consegui obter a imagem. Tente novamente." } });
        return true;
      }

      const mediaInfoResp = await fetch(`https://graph.facebook.com/v16.0/${mediaId}`, {
        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
      });
      const mediaInfo = await mediaInfoResp.json();
      const mediaUrl = mediaInfo.url;
      if (!mediaUrl) {
        await sendWhatsAppRaw({ messaging_product: "whatsapp", to: senderNumber, type: "text", text: { body: "⚠️ Não consegui obter a URL da imagem. Tente novamente." } });
        return true;
      }

      const mediaResp = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } });
      const originalBuffer = Buffer.from(await mediaResp.arrayBuffer());

      // Redimensiona e envia para Supabase
      const sharp = require('sharp');
      const resizedBuffer = await sharp(originalBuffer, { limitInputPixels: false })
        .resize({ width: 350, height: 350, fit: "cover" })
        .jpeg({ quality: 80 })
        .toBuffer();

      const fileName = `${senderNumber}_pix_img_${Date.now()}.jpeg`;
      const { error: uploadError } = await supabase.storage.from("user_files").upload(fileName, resizedBuffer, { contentType: "image/jpeg", upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData, error: urlError } = await supabase.storage.from("user_files").getPublicUrl(fileName);
      if (urlError || !urlData?.publicUrl) throw urlError;

      await supabase.from("users").update({ pix_img_url: urlData.publicUrl }).eq("telefone", senderNumber);
      await supabase.from("user_sessions").delete().eq("telefone", senderNumber);

      await sendWhatsAppRaw({ messaging_product: "whatsapp", to: senderNumber, type: "text", text: { body: "✅ Imagem do Pix atualizada com sucesso!" } });
      return true;
    }

    return false;
  } catch (err) {
    console.error("Erro em handleUploads:", err);
    await sendWhatsAppRaw({ messaging_product: "whatsapp", to: senderNumber, type: "text", text: { body: "⚠️ Ocorreu um erro ao processar o upload. Tente novamente." } });
    return true;
  }
}

module.exports = handleUploads;