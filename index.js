require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const chrono = require('chrono-node');
const cron = require('node-cron');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const app = express();
app.use(express.json());

// Número fixo para envio de mensagens (modo teste)
const DESTINO_FIXO = '5564992869608';

// Mapeamento do número fixo para user_id no Supabase
const FIXED_USER_ID = 'coloque-aqui-o-uuid-do-usuario'; // ⚠️ Coloque o UUID real do usuário

// Função para enviar mensagem pelo WhatsApp
async function sendWhatsAppMessage(to, message) {
  try {
    await axios.post(
      `https://graph.facebook.com/v22.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: message }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );
    console.log(`Mensagem enviada para ${to}: ${message}`);
  } catch (err) {
    console.error('Erro ao enviar mensagem:', err.response?.data || err.message);
  }
}

// Verificação do webhook
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log('Webhook verificado com sucesso!');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// Receber mensagens do WhatsApp
app.post('/webhook', async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const messages = value?.messages;

    if (!messages) return res.sendStatus(200);

    for (let msg of messages) {
      const text = msg.text?.body || '';
      const senderName = value.contacts?.[0]?.profile?.name || 'Usuário';

      console.log(`Mensagem de ${senderName}: ${text}`);

      // Criar evento
      if (/cria.*atendimento/i.test(text)) {
        // Extrair nome do cliente considerando acentos
        const nameMatch = text.match(/atendimento para ([\p{L}\s]+)/iu);
        const clientName = nameMatch ? nameMatch[1].trim() : 'Cliente';

        // Extrair data/hora do texto
        let parsedDate = chrono.pt.parseDate(text);
        if (parsedDate) {
          // Se a hora não estiver definida, definir 8h da manhã
          if (parsedDate.getHours() === 0 && parsedDate.getMinutes() === 0 && !/0\d?:\d{2}/.test(text)) {
            parsedDate.setHours(8, 0, 0, 0);
          }
        } else {
          // Se não conseguiu interpretar, colocar amanhã às 8h
          parsedDate = new Date();
          parsedDate.setDate(parsedDate.getDate() + 1);
          parsedDate.setHours(8, 0, 0, 0);
        }

        // Salvar no Supabase
        const { error } = await supabase.from('events').insert([{
          user_id: FIXED_USER_ID,
          title: clientName,
          date: parsedDate
        }]);

        if (error) {
          console.error('Erro ao salvar evento:', error);
          await sendWhatsAppMessage(DESTINO_FIXO, `⚠️ Não foi possível salvar o evento para ${clientName}. Tente novamente.`);
        } else {
          await sendWhatsAppMessage(DESTINO_FIXO, `✅ Evento criado: "${clientName}" em ${parsedDate.toLocaleString()}`);
        }
      }

      // Listar eventos do dia
      if (/eventos de hoje/i.test(text)) {
        const today = new Date();
        const start = new Date(today.setHours(0,0,0,0));
        const end = new Date(today.setHours(23,59,59,999));

        const { data: events, error } = await supabase
          .from('events')
          .select('*')
          .eq('user_id', FIXED_USER_ID)
          .gte('date', start.toISOString())
          .lte('date', end.toISOString());

        if (error) {
          console.error('Erro ao buscar eventos:', error);
        }

        if (!events || events.length === 0) {
          await sendWhatsAppMessage(DESTINO_FIXO, 'Você não tem eventos hoje.');
        } else {
          const list = events.map(e => `- ${e.title} às ${new Date(e.date).toLocaleTimeString()}`).join('\n');
          await sendWhatsAppMessage(DESTINO_FIXO, `📅 Seus eventos de hoje:\n${list}`);
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// CRON job: Verificar eventos a cada 5 minutos e enviar alertas 30 min antes
cron.schedule('*/5 * * * *', async () => {
  console.log('Rodando cron job de alertas 30 minutos antes...');
  const now = new Date();
  const alertWindowStart = now;
  const alertWindowEnd = new Date(now.getTime() + 5 * 60 * 1000);

  const { data: events, error } = await supabase
    .from('events')
    .select('*')
    .eq('user_id', FIXED_USER_ID)
    .gte('date', new Date(now.getTime() + 30*60*1000).toISOString())
    .lte(new Date(now.getTime() + 35*60*1000).toISOString())
    .eq('notified', false);

  if (error) {
    console.error('Erro ao buscar eventos para alerta:', error);
    return;
  }

  if (!events || events.length === 0) {
    console.log('Nenhum evento para alerta neste intervalo.');
    return;
  }

  for (let event of events) {
    const eventTime = new Date(event.date);
    const alertTime = new Date(eventTime.getTime() - 30*60*1000);

    if (alertTime >= alertWindowStart && alertTime <= alertWindowEnd) {
      await sendWhatsAppMessage(DESTINO_FIXO, `⏰ Lembrete: "${event.title}" às ${eventTime.toLocaleTimeString()}`);
      // Marcar como notificado
      await supabase.from('events').update({ notified: true }).eq('id', event.id);
    }
  }
}, { timezone: "America/Sao_Paulo" });

// CRON job: Resumo diário às 7h
cron.schedule('0 7 * * *', async () => {
  console.log('Rodando cron job diário das 7h...');
  const today = new Date();
  const start = new Date(today.setHours(0,0,0,0));
  const end = new Date(today.setHours(23,59,59,999));

  const { data: events, error } = await supabase
    .from('events')
    .select('*')
    .eq('user_id', FIXED_USER_ID)
    .gte('date', start.toISOString())
    .lte('date', end.toISOString());

  if (error) {
    console.error('Erro ao buscar eventos para resumo diário:', error);
    return;
  }

  if (!events || events.length === 0) {
    console.log('Nenhum evento para o resumo diário.');
    return;
  }

  const list = events.map(e => `- ${e.title} às ${new Date(e.date).toLocaleTimeString()}`).join('\n');
  await sendWhatsAppMessage(DESTINO_FIXO, `📅 Seus eventos de hoje:\n${list}`);
}, { timezone: "America/Sao_Paulo" });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
