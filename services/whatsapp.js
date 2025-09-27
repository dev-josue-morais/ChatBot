const axios = require("axios");

async function sendWhatsAppMessage(to, message) {
  try {
    await axios.post(
      `https://graph.facebook.com/v22.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: message },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    console.error("Erro ao enviar mensagem:", err.response?.data || err.message);
  }
}

async function sendWhatsAppRaw(payload) {
  try {
    const resp = await axios.post(
      `https://graph.facebook.com/v22.0/${process.env.PHONE_NUMBER_ID}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
    return resp.data;
  } catch (err) {
    console.error(
      "❌ Erro ao enviar pela WhatsApp API:",
      err.response?.data || err.message
    );
    throw err;
  }
}

module.exports = { sendWhatsAppMessage, sendWhatsAppRaw };
