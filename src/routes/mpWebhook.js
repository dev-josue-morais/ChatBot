const express = require('express');
const router = express.Router();
const axios = require('axios');
const supabase = require('../services/supabase');
const { MP_ACCESS_TOKEN } = require('../utils/config');
const { sendWhatsAppRaw } = require('../services/whatsappService');

router.post('/', async (req, res) => {
  try {
    const { data } = req.body;
    if (!data || !data.id) return res.status(400).send('No data');

    // Consulta status do pagamento no Mercado Pago
    const response = await axios.get(
      `https://api.mercadopago.com/v1/payments/${data.id}`,
      { headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` } }
    );

    const payment = response.data;
    const { status, id, description } = payment;

    // Atualiza status no banco
    await supabase
      .from('payments')
      .update({ status })
      .eq('mp_payment_id', id);

    // Busca telefone do usuário associado ao pagamento
    let phone = null;
    try {
      const { data: userData } = await supabase
        .from('users')
        .select('user_telefone')
        .eq('mp_payment_id', id)
        .single();
      phone = userData?.user_telefone || null;
    } catch {
      phone = null;
    }

    if (!phone) {
      console.warn(`⚠️ Não foi possível encontrar telefone para mp_payment_id: ${id}`);
      return res.status(200).send('OK');
    }

    // Pega link do Checkout Pro (ticket_url)
    const checkoutLink = payment.point_of_interaction?.transaction_data?.ticket_url || '';

    // Lógica de acordo com o status do pagamento
    if (status === 'approved') {
      // Adiciona 30 dias de premium via RPC
      await supabase.rpc('add_premium_days', { phone, days: 30 });

      // Envia mensagem de sucesso
      await sendWhatsAppRaw({
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body: "✅ Pagamento aprovado! Seu Premium foi renovado por 30 dias." }
      });

    } else if (status === 'pending') {
      // Envia mensagem com link do Checkout Pro
      await sendWhatsAppRaw({
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { 
          body: `⏳ Pagamento pendente. Assim que confirmado, seu Premium será renovado.\n\n💳 Complete o pagamento aqui:\n${checkoutLink}`
        }
      });

    } else if (status === 'rejected') {
      await sendWhatsAppRaw({
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body: "❌ Pagamento recusado. Por favor, tente novamente." }
      });
    }

    res.status(200).send('OK');

  } catch (err) {
    console.error('❌ Erro no webhook Mercado Pago:', err.response?.data || err.message);
    res.status(500).send('Erro interno');
  }
});

module.exports = router;
