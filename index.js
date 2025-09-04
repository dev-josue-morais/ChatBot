require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, });
const DESTINO_FIXO = '5564992869608';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const app = express();
app.use(express.json());

async function processAgendaCommand(text) {
  try {
    const nowBRT = new Date(new Date().getTime() - 3 * 60 * 60 * 1000);
    const todayStr = nowBRT.toISOString().split('T')[0];
    const gptPrompt = `
Você é um assistente de agenda. O usuário está no fuso GMT-3 (Brasil). 
Considere que a data atual é ${todayStr}.
O título do evento pode ser nome de cliente ou local.
Identifique a intenção da mensagem: criar, listar ou deletar evento.
Extraia:
- action: "create", "list" ou "delete"
- title: string (nome ou local)
- datetime: data/hora em ISO (UTC)
- reminder_minutes: integer opcional (default 30)
- start_date, end_date: se for listagem de eventos
Responda apenas em JSON válido.
Mensagem: "${text}"
`;

    const gptResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: gptPrompt }],
    });

    let gptJSON = gptResponse.choices[0].message.content;
    gptJSON = gptJSON.replace(/```json\s*|```/g, '').trim();
    let command;
    try {
      command = JSON.parse(gptJSON);
    } catch (err) {
      console.error("Erro ao parsear JSON do GPT:", gptJSON);
      return "⚠️ Não consegui entender o comando.";
    }

    // 2️⃣ Funções auxiliares para fuso horário

    const formatLocal = (utcDate) => { return new Date(utcDate).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }); };

    // 3️⃣ Executa ação no Supabase
    if (command.action === "create") {
      const datetimeUTC = new Date(command.datetime);
      const { error } = await supabase.from("events").insert([{
        title: command.title,
        date: datetimeUTC,
        reminder_minutes: command.reminder_minutes || 30
      }]);

      if (error) {
        console.error("Erro ao criar evento:", error);
        return `⚠️ Não consegui criar o evento "${command.title}".`;
      } else {
        return `✅ Evento criado: "${command.title}" em ${formatLocal(datetimeUTC)}`;
      }
    }

    if (command.action === "delete") {
      const datetimeUTC = new Date(command.datetime);
      const start = new Date(datetimeUTC.getTime() - 60 * 1000).toISOString();
      const end = new Date(datetimeUTC.getTime() + 60 * 1000).toISOString();

      const { data: events, error: fetchError } = await supabase
        .from("events")
        .select("*")
        .eq("title", command.title)
        .gte("date", start)
        .lte("date", end);

      if (fetchError || !events || events.length === 0) {
        return `⚠️ Nenhum evento encontrado para "${command.title}" em ${formatLocal(datetimeUTC)}.`;
      }

      const ids = events.map((ev) => ev.id);
      const { error: delError } = await supabase.from("events").delete().in("id", ids);
      if (delError) {
        return `⚠️ Não consegui apagar o evento "${command.title}".`;
      } else {
        return `🗑 Evento "${command.title}" em ${formatLocal(datetimeUTC)} removido com sucesso.`;
      }
    }

    if (command.action === "list") {
      const startUTC = new Date(command.start_date);
      const endUTC = new Date(command.end_date);

      const { data: events, error } = await supabase
        .from("events")
        .select("*")
        .gte("date", startUTC.toISOString())
        .lte("date", endUTC.toISOString());

      if (error) {
        console.error("Erro ao buscar eventos:", error);
        return "⚠️ Não foi possível buscar os eventos.";
      }

      if (!events || events.length === 0) {
        return `📅 Nenhum evento encontrado entre ${formatLocal(startUTC)} e ${formatLocal(endUTC)}.`;
      }

      const list = events.map((e) => `- ${e.title} às ${formatLocal(new Date(e.date))}`).join("\n");
      return `📅 Seus eventos:\n${list}`;
    }

    return "⚠️ Comando não reconhecido pelo GPT.";
  } catch (err) {
    console.error("Erro em processAgendaCommand:", err);
    return "⚠️ Erro interno ao processar comando.";
  }
}

app.post('/renew-token', async (req, res) => {
  if (req.headers.authorization !== `Bearer ${process.env.GITHUB_SECRET}`) {
    return res.status(403).send('Não autorizado');
  }

  const renderServiceId = process.env.RENDER_SERVICE_ID;
  const renderApiKey = process.env.RENDER_API_KEY;

  try {
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

    const envResp = await axios.get(
      `https://api.render.com/v1/services/${renderServiceId}/env-vars`,
      { headers: { Authorization: `Bearer ${renderApiKey}` } }
    );

    const envVars = envResp.data.map(ev => ({
      key: ev.envVar.key,
      value: ev.envVar.key === 'WHATSAPP_TOKEN' ? newToken : ev.envVar.value,
      sync: true
    }));

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
    const { data, error } = await supabase
      .from('keep_alive')
      .select('status')
      .limit(1);

    if (error) {
      console.error('Erro no keep-alive Supabase:', error);
      return res.status(500).send('Erro no keep-alive');
    }

    console.log('Keep-alive executado:', data);
    res.send('1');
  } catch (err) {
    console.error(err);
    res.status(500).send('Erro interno no keep-alive');
  }
});

app.post('/webhook', async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const messages = value?.messages;
    if (!messages) return res.sendStatus(200);

    // Função para enviar mensagens pelo WhatsApp
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
      } catch (err) {
        console.error('Erro ao enviar mensagem:', err.response?.data || err.message);
      }
    }

    // Função para formatar número
    function formatPhone(num) {
      if (!num) return "Número desconhecido";
      num = String(num).replace(/\D/g, '');
      if (num.startsWith('55')) num = num.slice(2);
      const ddd = num.slice(0, 2);
      const rest = num.slice(2);
      let formattedRest;
      if (rest.length === 9) formattedRest = `${rest.slice(0, 5)}-${rest.slice(5)}`;
      else if (rest.length === 8) formattedRest = `${rest.slice(0, 4)}-${rest.slice(4)}`;
      else formattedRest = rest;
      return `(0${ddd}) ${formattedRest}`;
    }

    // Itera sobre todas as mensagens recebidas
    for (let msg of messages) {
      const text = msg.text?.body || '';
      const contact = value.contacts?.[0];
      if (!contact) continue;
      const senderName = contact.profile?.name || 'Usuário';
      const senderNumber = contact.wa_id;
      if (!senderNumber) continue;

      const formattedNumber = formatPhone(senderNumber);

      // ================= Mensagens de Clientes =================
      if (!/Eletricaldas/i.test(senderName)) {

        // 1️⃣ Notifica você (DESTINO_FIXO) de tudo que chegou
        let forwardText = `📥 Mensagem de ${senderName} ${formattedNumber}:\n\n`;
        if (msg.text?.body) forwardText += msg.text.body;
        if (msg.audio) forwardText += '\n[Áudio]';
        if (msg.document) forwardText += `\n[Documento: ${msg.document.filename}]`;

        await sendWhatsAppMessage(DESTINO_FIXO, forwardText);

        // 2️⃣ Gerenciar redirect no Supabase
        const { data: alreadySent } = await supabase
          .from('redirects')
          .select('*')
          .eq('phone', senderNumber)
          .maybeSingle();

        if (!alreadySent) {
          // Deleta registros antigos (>24h)
          await supabase
            .from('redirects')
            .delete()
            .lt('sent_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

          // Saudação conforme horário local
          const now = new Date();
          const hour = new Date(now.getTime() - 3 * 60 * 60 * 1000).getHours();
          let saudacao = "Olá";
          if (hour >= 5 && hour < 12) saudacao = "Bom dia";
          else if (hour >= 12 && hour < 18) saudacao = "Boa tarde";
          else saudacao = "Boa noite";

          // Envia resposta automática pro cliente
          await sendWhatsAppMessage(
            senderNumber,
            `${saudacao}! Você está tentando falar com Josué Eletricista.\nFavor entrar em contato no novo número (064) 99286-9608.`
          );

          // Salva novo registro
          await supabase.from('redirects').insert([{ phone: senderNumber }]);
        }

        continue; // passa para próxima mensagem
      }

      // ================= Mensagens Suas =================
      console.log(`Mensagem sua: ${text}`);
      if (/Eletricaldas/i.test(senderName)) {
        const responseText = await processAgendaCommand(text);
        await sendWhatsAppMessage(DESTINO_FIXO, responseText);
      }
    }

    res.sendStatus(200);

  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
