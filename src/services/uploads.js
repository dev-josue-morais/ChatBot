const fetch = require('node-fetch');
const sharp = require('sharp');
const supabase = require('./supabase');
const { sendWhatsAppRaw } = require('./whatsappService');
const { processLogoZip } = require('../utils/processLogoZip');
const { WHATSAPP_TOKEN } = require("../utils/config");

/**
 * Trata uploads de logo e imagem Pix enviados pelo usuário
 */
export async function handleUploads(msg, session, senderNumber) {
  try {
    // --- Upload de logo via ZIP ---
    if (msg.type === "document" && session?.answers?.type === "logo_img" && msg.document.mime_type === "application/zip") {
      const mediaId = msg.document.id;
      if (!mediaId) throw new Error("ID do documento não encontrado.");

      await processLogoZip(senderNumber, mediaId);
      await supabase.from("user_sessions").delete().eq("telefone", senderNumber);

      return true; // indica que a mensagem foi tratada
    }

    // --- Upload de imagem do Pix ---
    if (msg.type === "image" && session?.answers?.type === "pix_img") {
      const mediaId = msg.image?.id;
      if (!mediaId) {
        await sendWhatsAppRaw({
          messaging_product: "whatsapp",
          to: senderNumber,
          type: "text",
          text: { body: "⚠️ Não consegui obter a imagem. Tente novamente." }
        });
        return true;
      }

      // 1️⃣ Obtem a URL da mídia do WhatsApp
      const mediaInfoResp = await fetch(`https://graph.facebook.com/v16.0/${mediaId}`, {
        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
      });
      const mediaInfo = await mediaInfoResp.json();
      const mediaUrl = mediaInfo.url;

      if (!mediaUrl) {
        await sendWhatsAppRaw({
          messaging_product: "whatsapp",
          to: senderNumber,
          type: "text",
          text: { body: "⚠️ Não consegui obter a URL da imagem. Tente novamente." }
        });
        return true;
      }

      // 2️⃣ Baixa a imagem
      const mediaResp = await fetch(mediaUrl, {
        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
      });
      const arrayBuffer = await mediaResp.arrayBuffer();
      const originalBuffer = Buffer.from(arrayBuffer);

      // 🔹 Redimensiona a imagem
      const resizedBuffer = await sharp(originalBuffer)
        .resize(350, 350, { fit: "cover" })
        .jpeg({ quality: 90 })
        .toBuffer();

      // 3️⃣ Envia para o Supabase Storage
      const fileName = `${senderNumber}_pix_img_${Date.now()}.jpeg`;
      const { error: uploadError } = await supabase.storage
        .from("user_files")
        .upload(fileName, resizedBuffer, {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // 4️⃣ Gera URL pública
      const { data: urlData, error: urlError } = await supabase.storage
        .from("user_files")
        .getPublicUrl(fileName);

      if (urlError || !urlData?.publicUrl) throw urlError;

      const publicUrl = urlData.publicUrl;

      // 5️⃣ Atualiza o usuário
      await supabase.from("users").update({ pix_img_url: publicUrl }).eq("telefone", senderNumber);

      // 6️⃣ Limpa sessão
      await supabase.from("user_sessions").delete().eq("telefone", senderNumber);

      // 7️⃣ Mensagem de sucesso
      await sendWhatsAppRaw({
        messaging_product: "whatsapp",
        to: senderNumber,
        type: "text",
        text: { body: "✅ Imagem do Pix atualizada com sucesso!" }
      });

      return true;
    }

    // Se não for upload relevante
    return false;

  } catch (err) {
    console.error("Erro em handleUploads:", err);
    await sendWhatsAppRaw({
      messaging_product: "whatsapp",
      to: senderNumber,
      type: "text",
      text: { body: "⚠️ Ocorreu um erro ao processar o upload. Tente novamente." }
    });
    return true;
  }
}
