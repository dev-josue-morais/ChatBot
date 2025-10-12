const supabase = require('./supabase');
const { DateTime } = require('luxon');
const { formatLocal } = require('../utils/utils');

// 🔹 Função auxiliar para limpar eventos antigos
async function deleteOldEvents(userPhone) {
  try {
    const twoDaysAgo = DateTime.now()
      .setZone('America/Sao_Paulo')
      .minus({ days: 2 })
      .startOf('day')
      .toISO({ includeOffset: false }); // 🔸 Sem Z

    const { error } = await supabase
      .from('events')
      .delete()
      .lt('date', twoDaysAgo)
      .eq('user_telefone', userPhone);

    if (error) {
      console.error('Erro ao deletar eventos antigos:', error);
    }
  } catch (err) {
    console.error('Erro interno ao deletar eventos antigos:', err);
  }
}

async function handleAgendaCommand(command, userPhone) {
  try {
    // 🔹 Converte sempre para horário local (sem UTC)
    if (command.datetime) {
      command.datetime = DateTime.fromISO(command.datetime, { zone: 'America/Sao_Paulo' })
        .toISO({ includeOffset: false });
    }
    if (command.start_date) {
      command.start_date = DateTime.fromISO(command.start_date, { zone: 'America/Sao_Paulo' })
        .toISO({ includeOffset: false });
    }
    if (command.end_date) {
      command.end_date = DateTime.fromISO(command.end_date, { zone: 'America/Sao_Paulo' })
        .toISO({ includeOffset: false });
    }

    switch (command.action) {
      // 🔹 Criar evento
      case 'create': {
  const { data, error } = await supabase
    .from('events')
    .insert([{
      title: command.title,
      date: DateTime.fromISO(command.datetime, { zone: 'America/Sao_Paulo' })
        .toUTC()
        .toISO(),
      reminder_minutes: command.reminder_minutes || 30,
      user_telefone: userPhone
    }])
    .select('event_numero, title, date');

        if (error) {
          console.error('Erro ao criar evento:', error);
          return '⚠️ Erro ao criar evento.';
        }

        await deleteOldEvents(userPhone);

        return `✅ Evento ID ${data[0].event_numero} criado: "${data[0].title}" em ${formatLocal(data[0].date)}`;
      }

      // 🔹 Deletar evento
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
          return '⚠️ Erro ao deletar evento.';
        }

        if (!data?.length) {
          return `⚠️ Nenhum evento encontrado com o ID "${command.id}".`;
        }

        return `🗑 Evento ID ${data[0].event_numero} "${data[0].title}" removido com sucesso.`;
      }

      // 🔹 Editar evento
      case 'edit': {
        if (!command.id) return '⚠️ É necessário informar o ID do evento para editar.';

const updates = {
  title: command.title,
  date: command.date,
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
          return '⚠️ Erro ao atualizar evento.';
        }

        if (!data?.length) {
          return `⚠️ Nenhum evento encontrado com o ID "${command.id}".`;
        }

        await deleteOldEvents(userPhone);

        return `✅ Evento ID ${data[0].event_numero} atualizado: "${data[0].title}" em ${formatLocal(data[0].date)}.`;
      }

      // 🔹 Listar eventos
      case 'list': {
        const start = command.start_date
          ? DateTime.fromISO(command.start_date, { zone: 'America/Sao_Paulo' }).toISO({ includeOffset: false })
          : DateTime.now().setZone('America/Sao_Paulo').startOf('day').toISO({ includeOffset: false });

        const end = command.end_date
          ? DateTime.fromISO(command.end_date, { zone: 'America/Sao_Paulo' }).toISO({ includeOffset: false })
          : DateTime.now().setZone('America/Sao_Paulo').endOf('day').toISO({ includeOffset: false });

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

        if (!events?.length) {
          return `📅 Nenhum evento encontrado entre ${formatLocal(start)} e ${formatLocal(end)}.`;
        }

        const list = events
          .map(e => `- ID ${e.event_numero}: ${e.title} em ${formatLocal(e.date)}`)
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