const express = require('express');
const router = express.Router();
const axios = require('axios');
const supabase = require('../services/supabase');
const { MP_ACCESS_TOKEN } = require('../utils/config');

router.post('/', async (req, res) => {
  try {
    const { data } = req.body;
    if (!data || !data.id) return res.status(400).send('No data');

    // Consulta status do pagamento no Mercado Pago
    const response = await axios.get(
      `https://api.mercadopago.com/v1/payments/${data.id}`,
      { headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` } }
    );

    const { status, id, description } = response.data;

    if (status === 'approved') {
      // Atualiza o status do pagamento
      await supabase
        .from('payments')
        .update({ status })
        .eq('mp_payment_id', id);

      // Extrai telefone da descrição (ex: "Renovação Premium - 5564992869608")
      const phoneMatch = description.match(/\d{10,15}/);
      const phone = phoneMatch ? phoneMatch[0] : null;

      if (phone) {
        // 🔹 Aqui usamos a RPC que cuida de adicionar 30 dias corretamente
        await supabase.rpc('add_premium_days', { phone, days: 30 });
      }
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('❌ Erro no webhook Mercado Pago:', err.response?.data || err.message);
    res.status(500).send('Erro interno');
  }
});

module.exports = router;
