// helpers/processLogoZip.js
const fetch = require("node-fetch");
const AdmZip = require("adm-zip");
const sharp = require("sharp");
const supabase = require("../services/supabase");
const { sendWhatsAppRaw } = require("../services/whatsappService");
const { WHATSAPP_TOKEN } = require("./config");

async function processLogoZip(senderNumber, mediaId) {
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
    const logoEntry = zip.getEntries().find(e => e.entryName.toLowerCase().endsWith(".png"));
    if (!logoEntry) throw new Error("Nenhum PNG encontrado no ZIP.");

    const logoBuffer = logoEntry.getData();
    const resizedLogo = await sharp(logoBuffer)
      .resize(350, 350, { fit: "cover" })
      .png()
      .toBuffer();

    const fileName = `${senderNumber}_logo_${Date.now()}.png`;
    const { error: uploadError } = await supabase.storage
      .from("user_files")
      .upload(fileName, resizedLogo, {
        contentType: "image/png",
        upsert: true
      });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from("user_files").getPublicUrl(fileName);
    const publicUrl = urlData.publicUrl;
    await supabase.from("users").update({ logo_url: publicUrl }).eq("telefone", senderNumber);

    await sendWhatsAppRaw({
      messaging_product: "whatsapp",
      to: senderNumber,
      type: "text",
      text: { body: `✅ Logo atualizada com sucesso!` }
    });

  } catch (err) {
    console.error("Erro ao processar ZIP da logo:", err);
    await sendWhatsAppRaw({
      messaging_product: "whatsapp",
      to: senderNumber,
      type: "text",
      text: { body: "⚠️ Ocorreu um erro ao processar seu arquivo ZIP. Tente novamente." }
    });
  }
}

module.exports = { processLogoZip };
