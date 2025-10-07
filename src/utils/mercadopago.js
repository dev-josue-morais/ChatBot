// utils/mercadopago.js
const MercadoPago = require('mercadopago');
const { MP_ACCESS_TOKEN } = require('./config');

const mp = new MercadoPago({
  access_token: MP_ACCESS_TOKEN,
  locale: 'pt-BR'
});

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

  // Note a diferença: mp.preferences.create
  const preference = await mp.preferences.create(preferenceData);
  return preference.body.init_point; // Link do CheckoutPro
}

module.exports = createCheckoutPreference;
