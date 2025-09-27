const OpenAI = require("openai");
const { DateTime } = require("luxon");
const { supabase } = require("../config/supabase");
const { getNowBRT, formatLocal } = require("./utils");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

    const gptResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: gptPrompt }],
    });

    let gptJSON = gptResponse.choices[0].message.content;
    gptJSON = gptJSON.replace(/```json\s*|```/g, "").trim();

    let command;
    try {
      command = JSON.parse(gptJSON);
    } catch (err) {
      console.error("Erro ao parsear JSON do GPT:", gptJSON);
      return "⚠️ Não consegui entender o comando.";
    }

    // Converter datas para UTC
    ["datetime", "start_date", "end_date"].forEach((key) => {
      if (command[key]) {
        command[key] = DateTime.fromISO(command[key], {
          zone: "America/Sao_Paulo",
        })
          .toUTC()
          .toISO();
      }
    });

    // Ações
    if (command.action === "create") {
      const { error } = await supabase.from("events").insert([
        {
          title: command.title,
          date: command.datetime,
          reminder_minutes: command.reminder_minutes || 30,
        },
      ]);
      if (error) {
        console.error("Erro ao criar evento:", error);
        return `⚠️ Não consegui criar o evento "${command.title}".`;
      }
      return `✅ Evento criado: "${command.title}" em ${formatLocal(
        command.datetime
      )}`;
    }

    if (command.action === "delete") {
      const start = DateTime.fromISO(command.datetime)
        .minus({ minutes: 1 })
        .toISO();
      const end = DateTime.fromISO(command.datetime)
        .plus({ minutes: 1 })
        .toISO();

      const { data: events } = await supabase
        .from("events")
        .select("*")
        .eq("title", command.title)
        .gte("date", start)
        .lte("date", end);

      if (!events || events.length === 0) {
        return `⚠️ Nenhum evento encontrado para "${command.title}".`;
      }

      const ids = events.map((ev) => ev.id);
      await supabase.from("events").delete().in("id", ids);

      return `🗑 Evento "${command.title}" removido com sucesso.`;
    }

    if (command.action === "list") {
      const { data: events } = await supabase
        .from("events")
        .select("*")
        .gte("date", command.start_date)
        .lte("date", command.end_date);

      if (!events || events.length === 0) {
        return "📅 Nenhum evento encontrado no período.";
      }

      const list = events
        .map((e) => `- ${e.title} às ${formatLocal(e.date)}`)
        .join("\n");
      return `📅 Seus eventos:\n${list}`;
    }

    return "⚠️ Comando não reconhecido.";
  } catch (err) {
    console.error("Erro em processAgendaCommand:", err);
    return "⚠️ Erro interno ao processar comando.";
  }
}

module.exports = { processAgendaCommand };
