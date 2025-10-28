const fetch = require('node-fetch');
const sharp = require('sharp');
const supabase = require('./supabase');
const { sendWhatsAppRaw } = require('./whatsappService');
const { processLogoZip } = require('../utils/processLogoZip');
const { WHATSAPP_TOKEN } = require("../utils/config");

/**
 * Trata uploads de logo e imagem Pix enviados pelo usuário
 */
async function handleUploads(msg, session, senderNumber) {
  try {
// --- Upload de imagem da Assinatura ---
    if (msg.type === "image" && session?.answers?.type === "assinatura_img") {
      const mediaId = msg.image?.id;
      if (!mediaId) {
        await sendWhatsAppRaw({
          messaging_product: "whatsapp",
          to: senderNumber,
          type: "text",
          text: { body: "⚠️ Não consegui obter a imagem da assinatura. Tente novamente." }
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

      // 2️⃣ Baixa a imagem original
      const mediaResp = await fetch(mediaUrl, {
        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
      });
      const arrayBuffer = await mediaResp.arrayBuffer();
      const originalBuffer = Buffer.from(arrayBuffer);

      // 3️⃣ Converte o fundo branco para transparência
      // (remove tons próximos do branco puro)
      const transparentBuffer = await sharp(originalBuffer)
        .resize(600, 200, { fit: "contain", background: "#ffffff" }) // largura x altura padrão de assinatura
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .ensureAlpha()
        .removeAlpha() // garante reset da transparência
        .toColourspace("rgb16") // suaviza transição
        .toBuffer();

      // 3️⃣ (alternativa melhor, se quiser fundo realmente limpo)
      // use remove-bg via sharp mask simulation:
      const { data: rgba } = await sharp(originalBuffer)
        .resize(600)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Criar um novo buffer filtrando pixels quase brancos (técnica simples)
      const threshold = 240; // quanto maior, mais “branco” será removido
      for (let i = 0; i < rgba.length; i += 3) {
        if (rgba[i] > threshold && rgba[i + 1] > threshold && rgba[i + 2] > threshold) {
          rgba[i + 3] = 0; // torna transparente
        }
      }

      const pngBuffer = await sharp(rgba, {
        raw: { width: 600, height: Math.floor(rgba.length / (600 * 3)), channels: 4 }
      })
        .png()
        .toBuffer();

      // 4️⃣ Faz upload para o Supabase
      const fileName = `${senderNumber}_assinatura_${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage
        .from("user_files")
        .upload(fileName, pngBuffer, {
          contentType: "image/png",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // 5️⃣ Gera URL pública
      const { data: urlData, error: urlError } = await supabase.storage
        .from("user_files")
        .getPublicUrl(fileName);

      if (urlError || !urlData?.publicUrl) throw urlError;
      const publicUrl = urlData.publicUrl;

      // 6️⃣ Atualiza o usuário
      await supabase.from("users").update({ assinatura: publicUrl }).eq("telefone", senderNumber);

      // 7️⃣ Limpa sessão
      await supabase.from("user_sessions").delete().eq("telefone", senderNumber);

      // 8️⃣ Mensagem de sucesso
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

module.exports = handleUploads;