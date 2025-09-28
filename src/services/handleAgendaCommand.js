const supabase = require('./supabaseClient');
const { DateTime } = require('luxon');
const { formatLocal, getNowBRT } = require('./utils');

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
        const { error } = await supabase.from('events').insert([{
          title: command.title,
          date: command.datetime,
          reminder_minutes: command.reminder_minutes || 30
        }]);

        if (error) {
          console.error("Erro ao criar evento:", error);
          return `⚠️ Não consegui criar o evento "${command.title}".`;
        }
        return `✅ Evento criado: "${command.title}" em ${formatLocal(command.datetime)}`;
      }

      case 'delete': {
        const datetimeUTC = command.datetime;
        const start = DateTime.fromISO(datetimeUTC).minus({ minutes: 1 }).toISO();
        const end = DateTime.fromISO(datetimeUTC).plus({ minutes: 1 }).toISO();

        const { data: events, error: fetchError } = await supabase
          .from('events')
          .select('*')
          .eq('title', command.title)
          .gte('date', start)
          .lte('date', end);

        if (fetchError || !events || events.length === 0) {
          return `⚠️ Nenhum evento encontrado para "${command.title}" em ${formatLocal(datetimeUTC)}.`;
        }

        const ids = events.map(ev => ev.id);
        const { error: delError } = await supabase.from('events').delete().in('id', ids);
        if (delError) {
          return `⚠️ Não consegui apagar o evento "${command.title}".`;
        }
        return `🗑 Evento "${command.title}" em ${formatLocal(datetimeUTC)} removido com sucesso.`;
      }

      case 'list': {
        const { data: events, error } = await supabase
          .from('events')
          .select('*')
          .gte('date', command.start_date)
          .lte('date', command.end_date);

        if (error) {
          console.error("Erro ao buscar eventos:", error);
          return "⚠️ Não foi possível buscar os eventos.";
        }

        if (!events || events.length === 0) {
          return `📅 Nenhum evento encontrado entre ${formatLocal(command.start_date)} e ${formatLocal(command.end_date)}.`;
        }

        const list = events.map(e => `- ${e.title} em ${formatLocal(e.date)}`).join('\n');
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
