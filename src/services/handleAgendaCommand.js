const supabase = require('./supabase');
const { DateTime } = require('luxon');
const { formatLocal } = require('../utils/utils');

async function handleAgendaCommand(command, userPhone) {
  try {
    // Converte datas GMT-3 do GPT para UTC
    if (command.datetime) {
      command.datetime = DateTime.fromISO(command.datetime, { zone: 'America/Sao_Paulo' }).toUTC().toISO();
    }
    if (command.start_date) {
      command.start_date = DateTime.fromISO(command.start_date, { zone: 'America/Sao_Paulo' }).toUTC().toISO();
    }
    if (command.end_date) {
      command.end_date = DateTime.fromISO(command.end_date, { zone: 'America/Sao_Paulo' }).toUTC().toISO();
    }

    switch (command.action) {
      case 'create': {
        const { data, error } = await supabase
          .from('events')
          .insert([{
            title: command.title,
            date: command.datetime,
            reminder_minutes: command.reminder_minutes || 30,
            user_telefone: userPhone
          }])
          .select('event_numero, title, date');

        return `✅ Evento criado: "${data[0].title}" ${data[0].event_numero} em ${formatLocal(data[0].date)}`;
      }

      case 'delete': {
        if (!command.id) return '⚠️ É necessário informar o ID do evento para deletar.';

        const { data, error } = await supabase
          .from('events')
          .delete()
          .eq('event_numero', command.id)
          .eq('user_telefone', userPhone)
          .select('event_numero, title');

        if (error) {
          console.error('Erro ao deletar evento:', error);
          return '⚠️ Ocorreu um erro ao tentar deletar o evento.';
        }

        if (!data || data.length === 0) {
          return `⚠️ Nenhum evento encontrado com o ID "${command.id}".`;
        }

        return `🗑 Evento "${data[0].title}" (${data[0].event_numero}) removido com sucesso.`;
      }

      case 'edit': {
        if (!command.id) return '⚠️ É necessário informar o ID do evento para editar.';

        const updates = {
          title: command.title,
          date: DateTime.fromISO(command.date, { zone: 'America/Sao_Paulo' }).toUTC().toISO(),
          reminder_minutes: command.reminder_minutes ?? 30,
          notified: command.notified ?? false
        };

        const { data, error } = await supabase
          .from('events')
          .update(updates)
          .eq('event_numero', command.event_numero)
          .eq('user_telefone', userPhone)
          .select('event_numero, title, date');

        if (error) {
          console.error('Erro ao atualizar evento:', error);
          return '⚠️ Ocorreu um erro ao atualizar o evento.';
        }

        if (!data || !data.length) {
          return `⚠️ Nenhum evento encontrado com o ID "${command.id}".`;
        }

        return `✅ Evento atualizado "${data[0].title}" ${data[0].event_numero} em ${formatLocal(data[0].date)}.`;
      }

      case 'list': {
        const start = command.start_date
          ? DateTime.fromISO(command.start_date, { zone: 'America/Sao_Paulo' }).toUTC().toISO()
          : DateTime.now().startOf('day').toUTC().toISO(); // Início do dia atual
        const end = command.end_date
          ? DateTime.fromISO(command.end_date, { zone: 'America/Sao_Paulo' }).toUTC().toISO()
          : DateTime.now().endOf('day').toUTC().toISO(); // Fim do dia atual

        const { data: events, error } = await supabase
          .from('events')
          .select('*')
          .gte('date', start)
          .lte('date', end)
          .eq('user_telefone', userPhone);

        if (error) {
          console.error("Erro ao buscar eventos:", error);
          return "⚠️ Não foi possível buscar os eventos.";
        }

        if (!events || events.length === 0) {
          return `📅 Nenhum evento encontrado entre ${formatLocal(start)} e ${formatLocal(end)}.`;
        }

        const list = events
          .map(e => `- ${e.title} ${e.event_numero} em ${formatLocal(e.date)}`)
          .join('\n');

        return `📅 Seus eventos:\n${list}`;
      }

      default:
        return "⚠️ Comando de agenda não reconhecido.";
    }
  } catch (err) {
    console.error("Erro em handleAgendaCommand:", err);
    return "⚠️ Erro interno ao processar comando de agenda.";
  }
}

module.exports = handleAgendaCommand;
