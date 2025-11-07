// services/whatsappService.js
const axios = require('axios');
const path = require("path");
const generatePDF = require("../utils/pdfGenerator");
const FormData = require("form-data");
const { formatPhone } = require("../utils/utils");
const { WHATSAPP_TOKEN, PHONE_NUMBER_ID, DESTINO_FIXO } = require('../utils/config');

// Baixa e faz upload de mídia no WhatsApp
async function reuploadMedia(mediaId, mimeType, filename = "file") {
  try {
    // 1. Pega a URL assinada do WhatsApp
    const mediaUrl = `https://graph.facebook.com/v21.0/${mediaId}`;
    const mediaResp = await axios.get(mediaUrl, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
    });
    const directUrl = mediaResp.data.url;

    // 2. Baixa o arquivo binário
    const fileResp = await axios.get(directUrl, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
      responseType: "arraybuffer"
    });

    // 3. Monta o formdata com o mime correto
    const formData = new FormData();
    formData.append("file", fileResp.data, {
      filename,
      contentType: mimeType || "application/octet-stream"
    });
    formData.append("messaging_product", "whatsapp");

    // 4. Envia para o endpoint de upload
    const uploadResp = await axios.post(
      `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/media`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          ...formData.getHeaders()
        }
      }
    );

    return uploadResp.data.id;
  } catch (err) {
    console.error("❌ Erro no reupload:", err.response?.data || err.message);
    return null;
  }
}

// Enviar mensagem de texto via WhatsApp
async function sendWhatsAppMessage(to, message) {
  try {
    await axios.post(
      `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: message }
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );
  } catch (err) {
    console.error('Erro ao enviar mensagem:', err.response?.data || err.message);
  }
}

// Envia payload bruto via WhatsApp
async function sendWhatsAppRaw(payload) {
  try {
   // console.log("📤 Enviando para WhatsApp:", JSON.stringify(payload, null, 2));
    const resp = await axios.post(
      `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`,
      payload,
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" } }
    );
    return resp.data;
  } catch (err) {
    console.error("❌ Erro ao enviar pela WhatsApp API:", err.response?.data || err.message);
    throw err;
  }
}

// Extrai texto de qualquer tipo de mensagem
function extractTextFromMsg(msg) {
  return msg.text?.body
    || msg.button?.text
    || msg.interactive?.button_reply?.title
    || msg.interactive?.list_reply?.title
    || msg.system?.body
    || msg.caption
    || "";
}

// Reencaminha mídia (document, audio, image, video)
async function forwardMediaIfAny(msg, value, dest = DESTINO_FIXO) {
  try {
    const docId = msg.document?.id || msg.document?.media_id;
    const audioId = msg.audio?.id || msg.audio?.media_id;
    const imageId = msg.image?.id || msg.image?.media_id;
    const videoId = msg.video?.id || msg.video?.media_id;

    const mediaId = docId || audioId || imageId || videoId;
    if (!mediaId) return false;

    const type = docId ? "document" : audioId ? "audio" : imageId ? "image" : videoId ? "video" : (msg.type || "unknown");
    const mimeType = msg.document?.mime_type || msg.audio?.mime_type || msg.image?.mime_type || msg.video?.mime_type;
    const filename = msg.document?.filename || "arquivo";

    const contact = value.contacts?.[0];
    if (!contact) return false;
    const senderName = contact.profile?.name || 'Usuário';
    const senderNumber = contact.wa_id || 'noNumber';
    const formattedNumber = formatPhone(senderNumber);

    // Reupload da mídia
    const newId = await reuploadMedia(mediaId, mimeType, filename);
    if (!newId) return false;

    // Aviso antes da mídia
    const aviso = `📥 Nova mensagem de ${senderName} ${formattedNumber}`;
    await sendWhatsAppRaw({
      messaging_product: "whatsapp",
      to: dest,
      type: "text",
      text: { body: aviso }
    });

    let payload;
    if (type === "document") {
      payload = { messaging_product: "whatsapp", to: dest, type: "document", document: { id: newId, filename } };
    } else if (type === "audio") {
      payload = { messaging_product: "whatsapp", to: dest, type: "audio", audio: { id: newId } };
    } else if (type === "image") {
      payload = { messaging_product: "whatsapp", to: dest, type: "image", image: { id: newId } };
    } else if (type === "video") {
      payload = { messaging_product: "whatsapp", to: dest, type: "video", video: { id: newId } };
    } else return false;

    await sendWhatsAppRaw(payload);
    return true;
  } catch (err) {
    console.error("Erro em forwardMediaIfAny:", err.response?.data || err.message || err);
    return false;
  }
}

async function sendPDFOrcamento(to, orcamento, config) {
  try {
    const { user, ...pdfConfig } = config; // 🔹 extrai o usuário e o restante das configs

    // 1️⃣ Gera o PDF
    const pdfPath = await generatePDF(orcamento, user, { ...pdfConfig });
    const filename = path.basename(pdfPath);

    // 2️⃣ Lê o arquivo
    const fs = require("fs");
    const pdfBuffer = fs.readFileSync(pdfPath);

    // 3️⃣ Faz upload para WhatsApp
    const formData = new FormData();
    formData.append("file", pdfBuffer, { filename, contentType: "application/pdf" });
    formData.append("messaging_product", "whatsapp");

    const resp = await axios.post(
      `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/media`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          ...formData.getHeaders()
        }
      }
    );

    const mediaId = resp.data.id;
    if (!mediaId) throw new Error("Não foi possível fazer upload do PDF");

    // 4️⃣ Envia o documento
    await sendWhatsAppRaw({
      messaging_product: "whatsapp",
      to,
      type: "document",
      document: { id: mediaId, filename }
    });

   // console.log(`✅ PDF do orçamento ${orcamento.orcamento_numero} enviado para ${to}`);
    return true;

  } catch (err) {
    console.error("❌ Erro ao enviar PDF do orçamento:", err.response?.data || err.message || err);
    return false;
  }
}

module.exports = {
  sendPDFOrcamento,
  sendWhatsAppMessage,
  sendWhatsAppRaw,
  extractTextFromMsg,
  forwardMediaIfAny
};