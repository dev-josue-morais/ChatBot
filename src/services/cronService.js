const cron = require('node-cron');
const { getNowBRT, formatLocal } = require('../utils/utils');
const supabase = require('./supabase');
const { sendWhatsAppMessage } = require('./whatsappService');

function scheduleDailySummary() {
  // Estrutura do cron: minuto hora diaDoMes mês diaDaSemana
  cron.schedule('0,10,20,30,40,50 * * * *', async () => {
    try {
      console.log('⏰ Rodando cron job de resumo diário...');

      // ✅ Horário local de Brasília
      const start = getNowBRT().startOf('day').toISO(); // ISO sem Z
      const end = getNowBRT().endOf('day').toISO();

      // Buscar usuários
      const { data: users, error: userError } = await supabase
        .from('users')
        .select('telefone');

      if (userError) {
        console.error('Erro ao buscar usuários:', userError);
        return;
      }
      if (!users || users.length === 0) return;

      // Buscar eventos do dia, horário local
      const { data: events, error: eventError } = await supabase
        .from('events')
        .select('*')
        .gte('date', start)
        .lte('date', end)
        .eq('notified', false);

      if (eventError) {
        console.error('Erro ao buscar eventos:', eventError);
        return;
      }
      if (!events || events.length === 0) return;

      let enviados = 0;
      for (const user of users) {
        const phone = user.telefone;
        const userEvents = events.filter(e => e.user_telefone === phone);

        if (!userEvents.length) continue;

        const list = userEvents
          .map(e => `- ID ${e.event_numero} ${e.title} às ${formatLocal(e.date)}`)
          .join('\n');

        try {
          await sendWhatsAppMessage(phone, `📅 Seus eventos de hoje:\n${list}`);
          enviados++;
          console.log(`✅ Resumo diário enviado para ${phone}`);
        } catch (sendError) {
          console.error(`❌ Erro ao enviar para ${phone}:`, sendError);
        }
      }

      console.log(`📨 Resumo diário concluído — mensagens enviadas: ${enviados}`);
    } catch (err) {
      console.error('Erro no cron job diário:', err);
    }
  }, { timezone: 'America/Sao_Paulo' });
}

module.exports = { scheduleDailySummary };