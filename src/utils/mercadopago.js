// utils/mercadopago.js
const mercadopago = require('mercadopago'); // usar require mesmo
const { MP_ACCESS_TOKEN } = require('./config');

// Cria um cliente Mercado Pago
const mp = new mercadopago.MercadoPago(MP_ACCESS_TOKEN, {
  locale: 'pt-BR'
});

async function createCheckoutPreference(amount, description, phone) {
  const preference = {
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

  return await mp.preferences.create(preference);
}

module.exports = { createCheckoutPreference };
