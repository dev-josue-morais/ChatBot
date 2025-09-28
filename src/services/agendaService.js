// services/agendaService.js
const { DateTime } = require("luxon");
const openai = require('./openai');
const supabase = require('./supabase');
const { formatLocal, getNowBRT } = require('./utils');

// Processa comandos de agenda recebidos do WhatsApp
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

    // 1️⃣ Chama GPT
    const gptResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: gptPrompt }],
    });

    let gptJSON = gptResponse.choices[0].message.content;
    gptJSON = gptJSON.replace(/```json\s*|```/g, '').trim();

    // 2️⃣ Parse JSON
    let command;
    try {
      command = JSON.parse(gptJSON);
    } catch (err) {
      console.error("Erro ao parsear JSON do GPT:", gptJSON);
      return "⚠️ Não consegui entender o comando.";
    }
    console.log("🧠 GPT output:", gptJSON);

    // 3️⃣ Converte datas GMT-3 do GPT para UTC usando Luxon
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

    // 4️⃣ Executa ação no Supabase
    switch (command.action) {
      case "create": {
        const { error } = await supabase.from("events").insert([{
          title: command.title,
          date: command.datetime,
          reminder_minutes: command.reminder_minutes || 30
        }]);

        if (error) {
          console.error("Erro ao criar evento:", error);
          return `⚠️ Não consegui criar o evento "${command.title}".`;
        } else {
          return `✅ Evento criado: "${command.title}" em ${formatLocal(command.datetime)}`;
        }
      }

      case "delete": {
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

      case "list": {
        const startUTC = command.start_date;
        const endUTC = command.end_date;
        console.log("📆 Intervalo de busca:", { startUTC, endUTC, command });
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

        const list = events.map(e => `- ${e.title} em ${formatLocal(e.date)}`).join("\n");
        return `📅 Seus eventos:\n${list}`;
      }

      default:
        return "⚠️ Comando não reconhecido pelo GPT.";
    }
  } catch (err) {
    console.error("Erro em processAgendaCommand:", err);
    return "⚠️ Erro interno ao processar comando.";
  }
}

module.exports = {
  processAgendaCommand
};
