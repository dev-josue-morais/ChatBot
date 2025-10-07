// utils/mercadopago.js
const mercadopago = require('mercadopago');
const { MP_ACCESS_TOKEN } = require('./config');

// Configura o access token
mercadopago.configurations.setAccessToken(MP_ACCESS_TOKEN);

// Cria preferência de pagamento (CheckoutPro)
async function createCheckoutPreference(amount, description, phone) {
  const preferenceData = {
    items: [
      {
        title: description,
        quantity: 1,
        unit_price: amount
      }
    ],
    payer: {
      phone: { number: phone }
    },
    back_urls: {
      success: "https://seusite.com/sucesso",
      failure: "https://seusite.com/falha",
      pending: "https://seusite.com/pendente"
    },
    auto_return: "approved",
    notification_url: "https://chatbot-6viu.onrender.com/mp-web"
  };

  const preference = await mercadopago.preferences.create(preferenceData);
  return preference.response.init_point; // Link do CheckoutPro
}

module.exports = { createCheckoutPreference };
