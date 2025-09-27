const express = require("express");
const router = express.Router();
const { supabase } = require("../config/supabase");
const { getNowBRT, formatLocal } = require("../services/utils");
const { sendWhatsAppMessage } = require("../services/whatsapp");

const DESTINO_FIXO = process.env.DESTINO_FIXO;

router.get("/cron-alerta", async (req, res) => {
  try {
    const now = getNowBRT();
    const rangeStart = now.toUTC().toISO();
    const rangeEnd = now.plus({ minutes: 5 }).toUTC().toISO();

    const { data: events, error } = await supabase
      .from("events")
      .select("*")
      .gte("date", rangeStart)
      .lte("date", rangeEnd);

    if (error) throw error;

    if (!events || events.length === 0) {
      return res.json({ ok: true, msg: "Nenhum evento nos próximos 5min." });
    }

    for (const ev of events) {
      const msg = `⏰ Lembrete: "${ev.title}" às ${formatLocal(ev.date)}`;
      await sendWhatsAppMessage(DESTINO_FIXO, msg);
    }

    res.json({ ok: true, msg: `${events.length} lembretes enviados.` });
  } catch (err) {
    console.error("Erro no cron-alerta:", err);
    res.status(500).json({ error: "Erro no cron-alerta" });
  }
});

module.exports = router;
