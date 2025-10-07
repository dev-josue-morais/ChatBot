// utils/mercadopago.js
const { MP_ACCESS_TOKEN } = require('./config');
const mercadopago = require('mercadopago');

// Configure suas credenciais de PRODUÇÃO
mercadopago.configure({
  access_token: MP_ACCESS_TOKEN
});

async function createCheckoutPayment(value, description) {
  try {
    const preference = await mercadopago.preferences.create({
      items: [
        {
          title: description,
          quantity: 1,
          currency_id: "BRL",
          unit_price: value
        }
      ],
      payment_methods: {
        excluded_payment_types: [
          { id: "ticket" } // opcional: remove boleto se quiser só Pix e cartão
        ],
      },
      back_urls: {
        success: "https://seusite.com/sucesso",
        failure: "https://seusite.com/falha",
        pending: "https://seusite.com/pendente"
      },
      auto_return: "approved",
      notification_url: "https://chatbot-6viu.onrender.com/mp-web"
    });

    return preference.body.init_point; // Link do Checkout Pro
  } catch (error) {
    console.error("Erro ao criar pagamento CheckoutPro:", error);
    return null;
  }
}

module.exports = { createCheckoutPayment };
