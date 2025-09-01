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

app.post('/renew-token', async (req, res) => {
  if (req.headers.authorization !== `Bearer ${process.env.GITHUB_SECRET}`) {
    return res.status(403).send('Não autorizado');
  }

  const renderServiceId = process.env.RENDER_SERVICE_ID;
  const renderApiKey = process.env.RENDER_API_KEY;

  try {
    // 1️⃣ Troca o token curto pelo long-lived token
    const tokenResp = await axios.get('https://graph.facebook.com/v22.0/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.APP_ID,
        client_secret: process.env.APP_SECRET,
        fb_exchange_token: process.env.WHATSAPP_TOKEN
      }
    });

    const newToken = tokenResp.data.access_token;
    console.log('Novo token gerado:', newToken);

    // 2️⃣ Pega todas as variáveis atuais do serviço
    const envResp = await axios.get(
      `https://api.render.com/v1/services/${renderServiceId}/env-vars`,
      { headers: { Authorization: `Bearer ${renderApiKey}` } }
    );

    const envVars = envResp.data.map(ev => ({
      key: ev.envVar.key,
      value: ev.envVar.key === 'WHATSAPP_TOKEN' ? newToken : ev.envVar.value,
      sync: true
    }));

    // 3️⃣ Atualiza todas as variáveis via PUT
    await axios.put(
      `https://api.render.com/v1/services/${renderServiceId}/env-vars`,
      envVars,
      { headers: { Authorization: `Bearer ${renderApiKey}`, 'Content-Type': 'application/json' } }
    );

    console.log('Variáveis de ambiente do Render atualizadas com sucesso!');
    res.send('Token renovado e variável atualizada com sucesso!');
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send('Erro ao renovar token');
  }
});

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

app.get('/keep-alive', async (req, res) => {
  try {
    // Faz uma query mínima no Supabase
    const { data, error } = await supabase
      .from('keep_alive')
      .select('status')
      .limit(1);

    if (error) {
      console.error('Erro no keep-alive Supabase:', error);
      return res.status(500).send('Erro no keep-alive');
    }

    console.log('Keep-alive executado:', data);
    res.send('1'); // Resposta simples para o GitHub
  } catch (err) {
    console.error(err);
    res.status(500).send('Erro interno no keep-alive');
  }
});

// Receber mensagens do WhatsApp
app.post('/webhook', async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const messages = value?.messages;
    if (!messages) return res.sendStatus(200);

    // Helper: converte um Date que representa horário local (BRT) para ISO UTC
    const toUTCISOStringFromLocal = (d) => {
      return new Date(Date.UTC(
        d.getFullYear(),
        d.getMonth(),
        d.getDate(),
        d.getHours() + 3, // BRT -> UTC
        d.getMinutes(),
        d.getSeconds(),
        d.getMilliseconds()
      )).toISOString();
    };

    for (let msg of messages) {
      const text = msg.text?.body || '';
      const senderName = value.contacts?.[0]?.profile?.name || 'Usuário';
      const senderNumber = value.contacts?.[0]?.wa_id;
      if (!senderNumber) continue;

      // --- REDIRECIONAMENTO ÚNICO ---
      // --- REDIRECIONAMENTO ÚNICO ---
      if (!/Eletricaldas/i.test(senderName)) {
        const { data: alreadySent } = await supabase
          .from('redirects')
          .select('*')
          .eq('phone', senderNumber)
          .single();

        if (!alreadySent) {
          // 1️⃣ Deleta registros com mais de 24h
          await supabase
            .from('redirects')
            .delete()
            .lt('sent_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

          // 2️⃣ Define saudação conforme horário local
          const hour = new Date().getHours();
          let saudacao = "Olá";
          if (hour >= 5 && hour < 12) saudacao = "Bom dia";
          else if (hour >= 12 && hour < 18) saudacao = "Boa tarde";
          else saudacao = "Boa noite";

          // 3️⃣ Envia mensagem de redirecionamento para o cliente
          await sendWhatsAppMessage(
            senderNumber,
            `${saudacao}! Você está tentando falar com Josué Eletricista.  
Favor entrar em contato no novo número (064) 99286-9608.`
          );

          // 4️⃣ Notifica o número fixo sobre o novo contato
          await sendWhatsAppMessage(
            DESTINO_FIXO,
            `📞 Novo contato recebido: ${senderName} (${senderNumber}) entrou em contato pelo WhatsApp antigo.`
          );

          // 5️⃣ Insere o novo registro
          await supabase.from('redirects').insert([{ phone: senderNumber }]);
          console.log(`Mensagem de redirecionamento enviada para ${senderNumber}`);
        }
        continue;
      }

      console.log(`Mensagem de ${senderName}: ${text}`);

      // referência para parsing (ajustado para BRT)
      const nowLocal = new Date(Date.now() - 3 * 60 * 60 * 1000); // referência em UTC-3

      // intenções
      const createKeywords = /(cria|adiciona|agenda|salva)[\s\w]*?(atendimento|evento|lembrete)/i;
      const listKeywords = /(eventos|agenda|compromissos|lembretes|atendimentos)/i;

      // -------------------- CRIAR EVENTO --------------------
      if (createKeywords.test(text)) {
        // 1) detecta trecho relativo "daqui a X..." primeiro
        const relativeMatch = text.match(/daqui a\s*(\d+)\s*(min|h)/i);
        let eventDate = new Date(nowLocal);
        let dateSpanText = '';

        if (relativeMatch) {
          const val = parseInt(relativeMatch[1], 10);
          if (relativeMatch[2].startsWith('min')) eventDate.setMinutes(eventDate.getMinutes() + val);
          else eventDate.setHours(eventDate.getHours() + val);
          dateSpanText = relativeMatch[0]; // "daqui a 36min"
        } else {
          // 2) tenta chrono.pt para achar data/hora absoluta
          let textClean = text.replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
          const results = chrono.pt.parse(textClean, nowLocal, { forwardDate: true });
          if (results.length > 0) {
            eventDate = results[0].start.date();
            dateSpanText = results[0].text || '';
            if (!results[0].start.isCertain('hour')) {
              eventDate.setHours(8, 0, 0, 0); // fallback hora
            }
          } else {
            // fallback hoje às 08:00
            eventDate.setHours(8, 0, 0, 0);
          }
        }

        // 3) remova o trecho de data/hora do texto para facilitar captura do nome
        let textWithoutDate = dateSpanText ? text.replace(dateSpanText, ' ') : text;
        textWithoutDate = textWithoutDate.replace(/\s+/g, ' ').trim();

        // 4) tenta extrair o nome de forma robusta
        // primeiro: padrão completo (cria ... evento ... para NOME)
        let nameMatch = textWithoutDate.match(/(?:cria|adiciona|agenda|salva)[\s\w]*?(?:atendimento|evento|lembrete)\s+para\s+([\p{L}\s'-]{1,80})/iu);
        // fallback 1: só "para NOME"
        if (!nameMatch) nameMatch = textWithoutDate.match(/para\s+([\p{L}\s'-]{1,80})/iu);
        // fallback 2: pega a primeira palavra com inicial maiúscula (último recurso)
        if (!nameMatch) {
          const cap = textWithoutDate.match(/\b([A-ZÀ-Ý][\p{L}'-]+(?:\s+[A-ZÀ-Ý][\p{L}'-]+)*)\b/u);
          if (cap) nameMatch = [null, cap[1]];
        }

        const clientName = nameMatch ? nameMatch[1].trim() : 'Cliente';

        // 5) converte a data local para UTC ISO para salvar (função acima)
        const eventDateUTC = toUTCISOStringFromLocal(eventDate);

        // salva
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

      // -------------------- LISTAR EVENTOS --------------------
      if (listKeywords.test(text)) {
        let start, end;
        const textClean = text.replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
        const results = chrono.pt.parse(textClean, nowLocal, { forwardDate: true });

        if (results.length > 0) {
          start = results[0].start.date();
          start.setHours(0, 0, 0, 0);
          end = new Date(start);
          end.setHours(23, 59, 59, 999);
        } else {
          // "hoje" por padrão
          const today = new Date(nowLocal);
          start = new Date(today); start.setHours(0, 0, 0, 0);
          end = new Date(today); end.setHours(23, 59, 59, 999);
        }

        // converte intervalo local -> UTC ISO
        const startUTC = toUTCISOStringFromLocal(start);
        const endUTC = toUTCISOStringFromLocal(end);

        const { data: events, error } = await supabase
          .from('events')
          .select('*')
          .gte('date', startUTC)
          .lte('date', endUTC);

        if (error) {
          console.error('Erro ao buscar eventos:', error);
          await sendWhatsAppMessage(DESTINO_FIXO, `⚠️ Não foi possível buscar os eventos.`);
        } else if (!events || events.length === 0) {
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
    .lte('date', endUTC);

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
