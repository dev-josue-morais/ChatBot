// utils/mercadopago.js
const axios = require('axios');
const { MP_ACCESS_TOKEN } = require('./config');

async function createPixPayment(amount, description) {
  try {
    const response = await axios.post(
      'https://api.mercadopago.com/v1/payments',
      {
        transaction_amount: amount,
        description,
        payment_method_id: 'pix',
        payer: {
          email: 'pagador@exemplo.com'
        }
      },
      {
        headers: {
          Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const { id, point_of_interaction } = response.data;
    return {
      id,
      qr_code: point_of_interaction.transaction_data.qr_code,
      qr_base64: point_of_interaction.transaction_data.qr_code_base64
    };
  } catch (err) {
    console.error('Erro ao criar pagamento Pix:', err.response?.data || err.message);
    return null;
  }
}

module.exports = { createPixPayment };
