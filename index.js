if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const express = require("express");
const cron = require("node-cron");
const { getNowBRT, formatLocal } = require("./services/utils");
const { sendWhatsAppMessage } = require("./services/whatsapp");
const { supabase } = require("./config/supabase");

const app = express();
app.use(express.json());

// --- Importa Rotas ---
app.use("/", require("./routes/webhook"));
app.use("/", require("./routes/cron"));
app.use("/", require("./routes/token"));
app.use("/", require("./routes/keepalive"));

// --- CRON JOB RESUMO DIÁRIO 7h ---
cron.schedule(
  "0 7 * * *",
  async () => {
    try {
      console.log("Rodando cron job diário das 7h...");

      const start = getNowBRT().startOf("day").toUTC().toISO();
      const end = getNowBRT().endOf("day").toUTC().toISO();

      const { data: events, error } = await supabase
        .from("events")
        .select("*")
        .gte("date", start)
        .lte("date", end);

      if (error) {
        console.error("Erro ao buscar eventos para resumo diário:", error);
        return;
      }

      if (!events || events.length === 0) {
        console.log("Nenhum evento para o resumo diário.");
        return;
      }

      const list = events
        .map((e) => `- ${e.title} às ${formatLocal(e.date)}`)
        .join("\n");

      await sendWhatsAppMessage(
        process.env.DESTINO_FIXO,
        `📅 Seus eventos de hoje:\n${list}`
      );
      console.log("Resumo diário enviado com sucesso.");
    } catch (err) {
      console.error("Erro no cron job diário:", err);
    }
  },
  { timezone: "America/Sao_Paulo" }
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
