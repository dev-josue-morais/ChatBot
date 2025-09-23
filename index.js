if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}
const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require("openai");
const cron = require('node-cron');
const { DateTime } = require("luxon");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const DESTINO_FIXO = '556492869608';

// 1️⃣ Hora atual em Brasília
function getNowBRT() {
  return DateTime.now().setZone("America/Sao_Paulo");
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const app = express();
app.use(express.json());

const FormData = require("form-data");

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

// baixa e sobe de novo no WhatsApp
async function reuploadMedia(mediaId, mimeType, filename = "file") {
  try {
    // 1. pega a URL assinada do WhatsApp
    const mediaUrl = `https://graph.facebook.com/v21.0/${mediaId}`;
    const mediaResp = await axios.get(mediaUrl, {
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` }
    });
    const directUrl = mediaResp.data.url;

    // 2. baixa o arquivo binário
    const fileResp = await axios.get(directUrl, {
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
      responseType: "arraybuffer"
    });

    // 3. monta o formdata com o mime correto
    const formData = new FormData();
    formData.append("file", fileResp.data, {
      filename,
      contentType: mimeType || "application/octet-stream"
    });
    formData.append("messaging_product", "whatsapp");

    // 4. envia pro endpoint de upload
    const uploadResp = await axios.post(
      `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/media`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          ...formData.getHeaders()
        }
      }
    );

    return uploadResp.data.id;
  } catch (err) {
    console.error("❌ Erro no reupload:", err.response?.data || err.message);
    return null;
  }
}

// Enviar mensagem WhatsApp
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

// Formatar horário para fuso horário do Brasil
function formatLocal(utcDate) {
  return DateTime.fromISO(utcDate, { zone: "utc" })
    .setZone("America/Sao_Paulo")
    .toFormat("dd/MM/yyyy HH:mm");
}

async function processAgendaCommand(text) {
  try {

    const gptPrompt = `
Você é um assistente de agenda. O usuário está no fuso GMT-3 (Brasil). 
Considere que a data e hora atual é ${getNowBRT().toFormat("yyyy-MM-dd HH:mm:ss")}.
O título do evento pode ser nome de cliente ou local.
Identifique a intenção da mensagem: criar, listar ou deletar evento.
Extraia:
- action: "create", "list" ou "delete"
- title: string (nome ou local)
- datetime: data/hora em ISO (GMT-3)
- reminder_minutes: integer opcional (default 30)
- start_date, end_date: se for listagem de eventos
Responda apenas em JSON válido.
Mensagem: "${text}"
`;

    // 2️⃣ Chama GPT
    const gptResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: gptPrompt }],
    });

    let gptJSON = gptResponse.choices[0].message.content;
    gptJSON = gptJSON.replace(/```json\s*|```/g, '').trim();

    // 3️⃣ Parse JSON
    let command;
    try {
      command = JSON.parse(gptJSON);
    } catch (err) {
      console.error("Erro ao parsear JSON do GPT:", gptJSON);
      return "⚠️ Não consegui entender o comando.";
    }

    // 4️⃣ Converte datas GMT-3 do GPT para UTC usando Luxon
    if (command.datetime) {
      command.datetime = DateTime.fromISO(command.datetime, { zone: "America/Sao_Paulo" })
        .toUTC()
        .toISO();
    }
    if (command.start_date) {
      command.start_date = DateTime.fromISO(command.start_date, { zone: "America/Sao_Paulo" })
        .toUTC()
        .toISO();
    }
    if (command.end_date) {
      command.end_date = DateTime.fromISO(command.end_date, { zone: "America/Sao_Paulo" })
        .toUTC()
        .toISO();
    }

    // 5️⃣ Executa ação no Supabase
    if (command.action === "create") {
      const datetimeUTC = command.datetime;
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
      const datetimeUTC = command.datetime;
      const start = DateTime.fromISO(datetimeUTC).minus({ minutes: 1 }).toISO();
      const end = DateTime.fromISO(datetimeUTC).plus({ minutes: 1 }).toISO();

      const { data: events, error: fetchError } = await supabase
        .from("events")
        .select("*")
        .eq("title", command.title)
        .gte("date", start)
        .lte("date", end);

      if (fetchError || !events || events.length === 0) {
        return `⚠️ Nenhum evento encontrado para "${command.title}" em ${formatLocal(datetimeUTC)}.`;
      }

      const ids = events.map(ev => ev.id);
      const { error: delError } = await supabase.from("events").delete().in("id", ids);
      if (delError) {
        return `⚠️ Não consegui apagar o evento "${command.title}".`;
      } else {
        return `🗑 Evento "${command.title}" em ${formatLocal(datetimeUTC)} removido com sucesso.`;
      }
    }

    if (command.action === "list") {
      const startUTC = command.start_date;
      const endUTC = command.end_date;

      const { data: events, error } = await supabase
        .from("events")
        .select("*")
        .gte("date", startUTC)
        .lte("date", endUTC);

      if (error) {
        console.error("Erro ao buscar eventos:", error);
        return "⚠️ Não foi possível buscar os eventos.";
      }

      if (!events || events.length === 0) {
        return `📅 Nenhum evento encontrado entre ${formatLocal(startUTC)} e ${formatLocal(endUTC)}.`;
      }

      const list = events.map(e => `- ${e.title} às ${formatLocal(e.date)}`).join("\n");
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
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// --- ROTA ALERTAS DINÂMICOS ---
app.get("/cron/alerta", async (req, res) => {
  try {
    const nowBRT = getNowBRT();
    // Buscar eventos futuros que ainda não foram notificados
    const { data: events, error } = await supabase
      .from("events")
      .select("*")
      .gte("date", nowBRT.toUTC().toISO())
      .eq("notified", false);

    if (error) {
      console.error("Erro ao buscar eventos para alerta:", error);
      return res.status(500).send("Erro ao buscar eventos");
    }

    if (!events || events.length === 0) {
      console.log("Nenhum evento para alerta neste momento.");
      return res.send("Nenhum evento encontrado");
    }

    for (let event of events) {
      const nowBRT = getNowBRT();
      const eventDateBRT = DateTime.fromISO(event.date, { zone: "utc" }).setZone("America/Sao_Paulo");
      const diffMinutes = eventDateBRT.diff(nowBRT, 'minutes').minutes;

      if (diffMinutes <= (event.reminder_minutes || 30) && diffMinutes >= 0) {
        await sendWhatsAppMessage(
          DESTINO_FIXO,
          `⏰ Lembrete: "${event.title}" às ${formatLocal(event.date)}`
        );

        // Marcar como notificado
        await supabase
          .from("events")
          .update({ notified: true })
          .eq("id", event.id);

        console.log(`Evento "${event.title}" notificado com sucesso.`);
      }
    }

    res.send(`✅ Eventos processados: ${events.length}`);
  } catch (err) {
    console.error("Erro na rota de alerta:", err);
    res.status(500).send("Erro interno");
  }
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

    // Envia payload pronto para a API (texto, doc, audio, etc)
    async function sendWhatsAppRaw(payload) {
      try {
        const resp = await axios.post(
          `https://graph.facebook.com/v22.0/${process.env.PHONE_NUMBER_ID}/messages`,
          payload,
          { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" } }
        );
        return resp.data;
      } catch (err) {
        console.error("❌ Erro ao enviar pela WhatsApp API:", err.response?.data || err.message);
        throw err;
      }
    }

    // Detecta e reencaminha mídia (document, audio, image, video)
    async function forwardMediaIfAny(msg, dest = DESTINO_FIXO) {
      try {
        const docId = msg.document?.id || msg.document?.media_id || msg.document?.wa_id;
        const audioId = msg.audio?.id || msg.audio?.media_id || msg.audio?.wa_id;
        const imageId = msg.image?.id || msg.image?.media_id || msg.image?.wa_id;
        const videoId = msg.video?.id || msg.video?.media_id || msg.video?.wa_id;

        let mediaId = docId || audioId || imageId || videoId;
        if (!mediaId) return false;

        const type = docId ? "document" : audioId ? "audio" : imageId ? "image" : videoId ? "video" : (msg.type || "unknown");
        const mimeType = msg.document?.mime_type || msg.audio?.mime_type || msg.image?.mime_type || msg.video?.mime_type;
        const filename = msg.document?.filename || "arquivo";

        const contact = value.contacts?.[0];
        if (!contact) return false;
        const senderName = contact.profile?.name || 'Usuário';
        const senderNumber = contact.wa_id || 'noNumber';
        const formattedNumber = formatPhone(senderNumber);

        // Reupload da mídia
        const newId = await reuploadMedia(mediaId, mimeType, filename);
        if (!newId) return false;

        // 🔔 Aviso antes da mídia
        const aviso = `📥 Nova mensagem de ${senderName} ${formattedNumber}`;
        await sendWhatsAppRaw({
          messaging_product: "whatsapp",
          to: dest,
          type: "text",
          text: { body: aviso }
        });

        let payload;
        if (type === "document") {
          payload = { messaging_product: "whatsapp", to: dest, type: "document", document: { id: newId, filename } };
        } else if (type === "audio") {
          payload = { messaging_product: "whatsapp", to: dest, type: "audio", audio: { id: newId } };
        } else if (type === "image") {
          payload = { messaging_product: "whatsapp", to: dest, type: "image", image: { id: newId } };
        } else if (type === "video") {
          payload = { messaging_product: "whatsapp", to: dest, type: "video", video: { id: newId } };
        } else return false;

        await sendWhatsAppRaw(payload);
        return true;
      } catch (err) {
        console.error("Erro em forwardMediaIfAny:", err.response?.data || err.message || err);
        return false;
      }
    }

    // Função para extrair texto de possíveis campos (text, interactive, button, system...)
    function extractTextFromMsg(msg) {
      return msg.text?.body
        || msg.button?.text
        || msg.interactive?.button_reply?.title
        || msg.interactive?.list_reply?.title
        || msg.system?.body
        || msg.caption
        || "";
    }

    // Itera sobre as mensagens
    for (let msg of messages) {
      const contact = value.contacts?.[0];
      if (!contact) continue;

      const senderName = contact.profile?.name || 'Usuário';
      const senderNumber = contact.wa_id;
      if (!senderNumber) continue;
      const formattedNumber = formatPhone(senderNumber);

      // ================= Mensagens de Clientes =================
      if (!/Eletricaldas/i.test(senderName)) {
        // 1️⃣ Texto do cliente
        const text = extractTextFromMsg(msg);
        if (text) {
          const forwardText = `📥 Mensagem de ${senderName} ${formattedNumber}:\n\n${text}`;
          await sendWhatsAppRaw({ messaging_product: "whatsapp", to: DESTINO_FIXO, type: "text", text: { body: forwardText } });
        }

        // 2️⃣ Reencaminhar mídia
        await forwardMediaIfAny(msg, DESTINO_FIXO);

        // 3️⃣ Redirect automático no Supabase
        const { data: alreadySent } = await supabase.from('redirects').select('*').eq('phone', senderNumber).maybeSingle();
        if (!alreadySent) {
          await supabase.from('redirects').delete().lt('sent_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

          const hour = getNowBRT().hour;
          let saudacao = "Olá";
          if (hour >= 5 && hour < 12) saudacao = "Bom dia";
          else if (hour >= 12 && hour < 18) saudacao = "Boa tarde";
          else saudacao = "Boa noite";

          await sendWhatsAppRaw({
            messaging_product: "whatsapp",
            to: senderNumber,
            type: "text",
            text: { body: `${saudacao}! Você está tentando falar com Josué Eletricista.\nFavor entrar em contato no novo número (064) 99286-9608.` }
          });

          await supabase.from('redirects').insert([{ phone: senderNumber }]);
        }

        continue; // cliente tratado, pula o restante
      }

      // ================= Mensagens Suas (Eletricaldas) =================
      if (/Eletricaldas/i.test(senderName)) {
        const myText = extractTextFromMsg(msg);
        const responseText = await processAgendaCommand(myText);
        await sendWhatsAppRaw({ messaging_product: "whatsapp", to: DESTINO_FIXO, type: "text", text: { body: responseText } });
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Erro geral no /webhook:", err.response?.data || err.message || err);
    res.sendStatus(500);
  }
});

// --- CRON JOB RESUMO DIÁRIO 7h ---
cron.schedule('0 7 * * *', async () => {
  try {
    console.log('Rodando cron job diário das 7h...');

    const start = getNowBRT().startOf("day").toUTC().toISO();
    const end = getNowBRT().endOf("day").toUTC().toISO();

    const { data: events, error } = await supabase
      .from('events')
      .select('*')
      .gte('date', start)
      .lte('date', end);

    if (error) {
      console.error('Erro ao buscar eventos para resumo diário:', error);
      return;
    }

    if (!events || events.length === 0) {
      console.log('Nenhum evento para o resumo diário.');
      return; // não envia mensagem
    }

    const list = events
      .map(e => `- ${e.title} às ${formatLocal(e.date)}`)
      .join('\n');

    await sendWhatsAppMessage(DESTINO_FIXO, `📅 Seus eventos de hoje:\n${list}`);
    console.log('Resumo diário enviado com sucesso.');

  } catch (err) {
    console.error('Erro no cron job diário:', err);
  }
}, { timezone: "America/Sao_Paulo" });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
