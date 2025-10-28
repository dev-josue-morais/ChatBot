// helpers/processLogoZip.js
const fetch = require("node-fetch");
const AdmZip = require("adm-zip");
const sharp = require("sharp");
const supabase = require("../services/supabase");
const { sendWhatsAppRaw } = require("../services/whatsappService");
const { WHATSAPP_TOKEN } = require("./config");

async function processLogoZip(senderNumber, mediaId, tipo = "logo") {
  try {
    const mediaInfoResp = await fetch(`https://graph.facebook.com/v16.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
    });
    const mediaInfo = await mediaInfoResp.json();
    const mediaUrl = mediaInfo.url;
    if (!mediaUrl) throw new Error("Não consegui obter a URL do ZIP.");

    const mediaResp = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
    });
    const buffer = Buffer.from(await mediaResp.arrayBuffer());
    const zip = new AdmZip(buffer);
    const entry = zip.getEntries().find(e => e.entryName.toLowerCase().endsWith(".png"));
    if (!entry) throw new Error("Nenhum PNG encontrado no ZIP.");

    const imageBuffer = entry.getData();
    const resizedImage = await sharp(imageBuffer)
      .resize(350, 350, { fit: "cover" })
      .png()
      .toBuffer();

    // Define nome e campo no Supabase de acordo com tipo
    const fileName = `${senderNumber}_${tipo}_${Date.now()}.png`;
    const { error: uploadError } = await supabase.storage
      .from("user_files")
      .upload(fileName, resizedImage, {
        contentType: "image/png",
        upsert: true
      });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from("user_files").getPublicUrl(fileName);
    const publicUrl = urlData.publicUrl;

    // Atualiza o campo correto no Supabase
    const campo = tipo === "assinatura" ? "assinatura" : "logo_url";
    await supabase.from("users").update({ [campo]: publicUrl }).eq("telefone", senderNumber);

    await sendWhatsAppRaw({
      messaging_product: "whatsapp",
      to: senderNumber,
      type: "text",
      text: { body: `✅ ${tipo === "assinatura" ? "Assinatura" : "Logo"} atualizada com sucesso!` }
    });

  } catch (err) {
    console.error(`Erro ao processar ZIP de ${tipo}:`, err);
    await sendWhatsAppRaw({
      messaging_product: "whatsapp",
      to: senderNumber,
      type: "text",
      text: { body: `⚠️ Ocorreu um erro ao processar seu arquivo ZIP de ${tipo}. Tente novamente.` }
    });
  }
}

module.exports = { processLogoZip };