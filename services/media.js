const axios = require("axios");
const FormData = require("form-data");

async function reuploadMedia(mediaId, mimeType, filename = "file") {
  try {
    const mediaUrl = `https://graph.facebook.com/v21.0/${mediaId}`;
    const mediaResp = await axios.get(mediaUrl, {
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
    });
    const directUrl = mediaResp.data.url;

    const fileResp = await axios.get(directUrl, {
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
      responseType: "arraybuffer",
    });

    const formData = new FormData();
    formData.append("file", fileResp.data, {
      filename,
      contentType: mimeType || "application/octet-stream",
    });
    formData.append("messaging_product", "whatsapp");

    const uploadResp = await axios.post(
      `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/media`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          ...formData.getHeaders(),
        },
      }
    );

    return uploadResp.data.id;
  } catch (err) {
    console.error("❌ Erro no reupload:", err.response?.data || err.message);
    return null;
  }
}

module.exports = { reuploadMedia };
