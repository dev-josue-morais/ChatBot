// utils/mercadopago.js
const mercadopago = require('mercadopago'); // require é OK
const { MP_ACCESS_TOKEN } = require('./config');

// Define o token globalmente
mercadopago.configurations.setAccessToken(MP_ACCESS_TOKEN);

// Cria preferência de pagamento (Checkout Pro)
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
  return preference.body; // aqui vem o link do CheckoutPro em preference.body.init_point
}

module.exports = { createCheckoutPreference };
