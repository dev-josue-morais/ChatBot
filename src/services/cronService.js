const cron = require('node-cron');
const { getNowBRT, formatLocal } = require('../utils/utils');
const supabase = require('./supabase');
const { sendWhatsAppMessage } = require('./whatsappService');

function scheduleDailySummary() {
  // Executa a cada 10 minutos
  cron.schedule('0,5,10,15,20,25,30,35,40,45,50,55 * * * *', async () => {
    try {
      const now = getNowBRT();
      console.log(`🕒 Horário atual (BRT): ${now.toFormat("yyyy-MM-dd HH:mm:ss")}`);

      const start = now.startOf('day').toISO();
      const end = now.endOf('day').toISO();

      const { data: users, error: userError } = await supabase
        .from('users')
        .select('telefone');

      if (userError) {
        console.error('❌ Erro ao buscar usuários:', userError);
        return;
      }

      console.log(`👥 Usuários encontrados: ${users?.length || 0}`);
      if (!users || users.length === 0) return;

      // Buscar eventos do dia (em horário local)
      const { data: events, error: eventError } = await supabase
        .from('events')
        .select('*')
        .gte('date', start)
        .lte('date', end)
        .eq('notified', false);

      if (eventError) {
        console.error('❌ Erro ao buscar eventos:', eventError);
        return;
      }

      console.log(`📆 Eventos retornados: ${events?.length || 0}`);
      if (!events || events.length === 0) {
        console.log('⚠️ Nenhum evento encontrado para hoje.');
        return;
      }

      // Exibir eventos brutos
      console.log('🧾 Eventos recebidos do Supabase:');
      console.dir(events, { depth: null });

      let enviados = 0;
      for (const user of users) {
        const phone = user.telefone;
        const userEvents = events.filter(e => e.user_telefone === phone);

        console.log(`\n📱 Usuário ${phone} — eventos encontrados: ${userEvents.length}`);

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
      console.error('💥 Erro no cron job diário:', err);
    }
  }, { timezone: 'America/Sao_Paulo' });
}

module.exports = { scheduleDailySummary };