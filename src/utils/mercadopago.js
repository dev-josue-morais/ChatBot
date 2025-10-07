const mercadopago = require('mercadopago'); // CommonJS
const mp = new mercadopago.MercadoPago(process.env.MP_ACCESS_TOKEN, { locale: 'pt-BR' });

// Criar preferência
async function createCheckoutPreference(amount, description, phone) {
  const preferenceData = {
    items: [{ title: description, quantity: 1, unit_price: amount }],
    payer: { phone: { number: phone } },
    back_urls: {
      success: "https://seusite.com/sucesso",
      failure: "https://seusite.com/falha",
      pending: "https://seusite.com/pendente"
    },
    auto_return: "approved",
    notification_url: "https://chatbot-6viu.onrender.com/mp-web"
  };

  const preference = await mp.preferences.create(preferenceData);
  return preference.response.init_point;
}

module.exports = { createCheckoutPreference };
