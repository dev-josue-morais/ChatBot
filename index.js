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

// Função para exibir datas no fuso correto
function formatLocal(date) {
  return new Date(date).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

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
      const senderNumber = value.contacts?.[0]?.wa_id;
      if (!senderNumber) continue;

      // --- REDIRECIONAMENTO ÚNICO ---
      if (!/Eletricaldas/i.test(senderName)) {
        const { data: alreadySent } = await supabase
          .from('redirects')
          .select('*')
          .eq('phone', senderNumber)
          .single();

        if (!alreadySent) {
          await sendWhatsAppMessage(
            senderNumber,
            "Olá! Você está tentando falar com Josué Eletricista. Favor entrar em contato no novo número (064) 99286-9608."
          );
          await supabase.from('redirects').insert([{ phone: senderNumber }]);
          console.log(`Mensagem de redirecionamento enviada para ${senderNumber}`);
        }
        continue;
      }

      console.log(`Mensagem de ${senderName}: ${text}`);

      // --- CRIAR EVENTO ---
      if (/(cria|adiciona|agenda)[\s\w]*?(atendimento|evento|lembrete)/i.test(text)) {
        // Extrair nome do cliente
        let nameText = text.replace(/(amanh[ãa]|hoje|daqui a \d+\s*min|\d{1,2}[:h]\d{0,2})/gi, '');
        const nameMatch = nameText.match(/(?:cria|adiciona|agenda)[\s\w]*?(?:atendimento|evento|lembrete)\s+para\s+([\p{L}\s]+)/iu);
        const clientName = nameMatch ? nameMatch[1].trim() : 'Cliente';

        let now = new Date();
        let eventDate = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          now.getHours() - 3,
          now.getMinutes(),
          now.getSeconds(),
          now.getMilliseconds()
        );
        console.log(eventDate)

        // Detecta "daqui a X minutos/horas" manualmente
        const relativeMatch = text.match(/daqui a (\d+)\s*(min|h)/i);
        if (relativeMatch) {
          const value = parseInt(relativeMatch[1], 10);
          if (relativeMatch[2].startsWith('min')) eventDate.setMinutes(eventDate.getMinutes() + value);
          else eventDate.setHours(eventDate.getHours() + value);
        } else {
          // Usa apenas o chrono para datas absolutas
          const results = chrono.pt.parse(text, new Date(), { forwardDate: true });
          if (results.length > 0) {
            eventDate = results[0].start.date();
            // Se hora não tiver sido especificada, fallback para 08:00
            if (!results[0].start.isCertain('hour')) {
              eventDate.setHours(8, 0, 0, 0);
            }
          } else {
            // Nenhuma data encontrada → fallback 08:00 hoje
            eventDate.setHours(8, 0, 0, 0);
          }
        }

        // --- CONVERTE HORÁRIO LOCAL PARA UTC ---
        const eventDateUTC = new Date(
          eventDate.getFullYear(),
          eventDate.getMonth(),
          eventDate.getDate(),
          eventDate.getHours() + 3, // BRT → UTC
          eventDate.getMinutes(),
          eventDate.getSeconds(),
          eventDate.getMilliseconds()
        ).toISOString();

        const { error } = await supabase.from('events').insert([{
          title: clientName,
          date: eventDateUTC
        }]);

        if (error) {
          console.error('Erro ao salvar evento:', error);
          await sendWhatsAppMessage(DESTINO_FIXO, `⚠️ Não foi possível salvar o evento para ${clientName}.`);
        } else {
          await sendWhatsAppMessage(
            DESTINO_FIXO,
            `✅ Evento criado: "${clientName}" em ${formatLocal(new Date(eventDateUTC))}`
          );
        }
      }

      // --- LISTAR EVENTOS ---
      if (/(eventos|agenda|compromissos|lembretes|atendimentos)/i.test(text)) {
        let start, end;
        const results = chrono.pt.parse(text, new Date(), { forwardDate: true });
        if (results.length > 0) {
          start = results[0].start.date();
          start.setHours(0, 0, 0, 0);
          end = new Date(start);
          end.setHours(23, 59, 59, 999);
        } else {
          const today = new Date();
          start = new Date(today); start.setHours(0, 0, 0, 0);
          end = new Date(today); end.setHours(23, 59, 59, 999);
        }

        const { data: events, error } = await supabase
          .from('events')
          .select('*')
          .gte('date', start.toISOString())
          .lte('date', end.toISOString());

        if (error) console.error('Erro ao buscar eventos:', error);

        if (!events || events.length === 0) {
          await sendWhatsAppMessage(DESTINO_FIXO, `Você não tem eventos para ${formatLocal(start).split(',')[0]}.`);
        } else {
          const list = events.map(e => `- ${e.title} às ${formatLocal(e.date)}`).join('\n');
          await sendWhatsAppMessage(DESTINO_FIXO, `📅 Seus eventos em ${formatLocal(start).split(',')[0]}:\n${list}`);
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// --- CRON JOB ALERTA 30 MINUTOS ---
cron.schedule('*/5 * * * *', async () => {
  console.log('Rodando cron job de alertas 30 minutos antes...');
  const now = new Date();

  const startUTC = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
  const endUTC = new Date(now.getTime() + 35 * 60 * 1000).toISOString();

  const { data: events, error } = await supabase
    .from('events')
    .select('*')
    .gte('date', startUTC)
    .lte(endUTC);

  if (error) return console.error('Erro ao buscar eventos para alerta:', error);
  if (!events || events.length === 0) return console.log('Nenhum evento para alerta neste intervalo.');

  for (let event of events) {
    await sendWhatsAppMessage(
      DESTINO_FIXO,
      `⏰ Lembrete: "${event.title}" às ${formatLocal(event.date)}`
    );
  }
}, { timezone: "America/Sao_Paulo" });

// --- CRON JOB RESUMO DIÁRIO ---
cron.schedule('0 7 * * *', async () => {
  console.log('Rodando cron job diário das 7h...');
  const today = new Date();
  const start = new Date(today); start.setHours(0, 0, 0, 0);
  const end = new Date(today); end.setHours(23, 59, 59, 999);

  const { data: events, error } = await supabase
    .from('events')
    .select('*')
    .gte('date', start.toISOString())
    .lte('date', end.toISOString());

  if (error) return console.error('Erro ao buscar eventos para resumo diário:', error);
  if (!events || events.length === 0) return console.log('Nenhum evento para o resumo diário.');

  const list = events
    .map(e => `- ${e.title} às ${formatLocal(e.date)}`)
    .join('\n');

  await sendWhatsAppMessage(
    DESTINO_FIXO,
    `📅 Seus eventos de hoje:\n${list}`
  );
}, { timezone: "America/Sao_Paulo" });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
