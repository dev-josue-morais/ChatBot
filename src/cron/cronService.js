const cron = require('node-cron');
const { getNowBRT, formatLocal } = require('../utils/utils');
const supabase = require('../services/supabase');
const { sendWhatsAppRaw } = require('../services/whatsappService');

function scheduleDailySummary() {
  cron.schedule('0 7 * * *', async () => {
    try {
      const now = getNowBRT();

      const start = now.startOf('day').toUTC().toISO();
      const end = now.endOf('day').toUTC().toISO();

      const { data: users, error: userError } = await supabase
        .from('users')
        .select('telefone');

      if (userError) {
        console.error('❌ Erro ao buscar usuários:', userError);
        return;
      }

      if (!users || users.length === 0) return;

      const { data: events, error: eventError } = await supabase
        .from('events')
        .select('*')
        .gte('date', start)
        .lte('date', end)
        .eq('notified', false)
        .order('date', { ascending: true });

      if (eventError) {
        console.error('❌ Erro ao buscar eventos:', eventError);
        return;
      }

      if (!events || events.length === 0) return;

      let enviados = 0;

      for (const user of users) {
        const phone = user.telefone;
        const userEvents = events.filter(e => e.user_telefone === phone);

        if (!userEvents.length) continue;

        const list = userEvents
          .map(e => {
            const telefone = e.telefone
              ? `\n  Telefone ${e.telefone}`
              : '';

            return `- ID ${e.event_numero} ${e.title} em ${formatLocal(e.date)}${telefone}`;
          })
          .join('\n');

        try {
          await sendWhatsAppRaw({
            messaging_product: "whatsapp",
            to: String(phone),
            type: "text",
            text: {
              body: `📅 Seus eventos de hoje:\n${list}`
            }
          });

          enviados++;
        } catch (sendError) {
          console.error(`❌ Erro ao enviar para ${phone}:`, sendError);
        }
      }

      console.log(`✅ Envio diário concluído. Total enviados: ${enviados}`);
    } catch (err) {
      console.error('💥 Erro no cron job diário:', err);
    }
  }, { timezone: 'America/Sao_Paulo' });
}

module.exports = { scheduleDailySummary };