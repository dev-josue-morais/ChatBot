const cron = require('node-cron');
const { getNowBRT, formatLocal } = require('../utils/utils');
const supabase = require('./supabase');
const { sendWhatsAppMessage } = require('./whatsappService');

function scheduleDailySummary() {
  cron.schedule('0 7 * * *', async () => {
    try {
      console.log('⏰ Rodando cron job diário das 7h...');

      const start = getNowBRT().startOf("day").toUTC().toISO();
      const end = getNowBRT().endOf("day").toUTC().toISO();

      // Busca todos os usuários com telefone cadastrado
      const { data: users, error: userError } = await supabase
        .from('users')
        .select('telefone');

      if (userError) {
        console.error('Erro ao buscar usuários:', userError);
        return;
      }

      if (!users || users.length === 0) {
        console.log('Nenhum usuário encontrado para o resumo diário.');
        return;
      }

      // Filtra apenas usuários com número válido
      const validUsers = users.filter(u => 
        u.user_telefone && /^\d{10,13}$/.test(u.user_telefone)
      );

      if (validUsers.length === 0) {
        console.log('Nenhum usuário com telefone válido encontrado.');
        return;
      }

      for (const user of validUsers) {
        const phone = user.user_telefone;

        // Busca eventos do usuário para o dia
        const { data: events, error: eventError } = await supabase
          .from('events')
          .select('*')
          .eq('user_telefone', phone)
          .gte('date', start)
          .lte('date', end);

        if (eventError) {
          console.error(`Erro ao buscar eventos de ${phone}:`, eventError);
          continue;
        }

        if (!events || events.length === 0) {
          console.log(`Sem eventos hoje para ${phone}.`);
          continue;
        }

        const list = events
          .map(e => `- ID ${e.event_numero} ${e.title} às ${formatLocal(e.date)}`)
          .join('\n');

        // Envio protegido com try/catch individual
        try {
          await sendWhatsAppMessage(phone, `📅 Seus eventos de hoje:\n${list}`);
          console.log(`✅ Resumo diário enviado para ${phone}`);
        } catch (sendError) {
          console.error(`❌ Erro ao enviar mensagem para ${phone}:`, sendError);
        }
      }

    } catch (err) {
      console.error('Erro no cron job diário:', err);
    }
  }, { timezone: "America/Sao_Paulo" });
}

module.exports = {
  scheduleDailySummary
};