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
      .toISO({ includeOffset: false });

    const { error } = await supabase
      .from('events')
      .delete()
      .lt('date', twoDaysAgo)
      .eq('user_telefone', userPhone);

    if (error) {
      console.error('❌ Erro ao deletar eventos antigos:', error);
    }
  } catch (err) {
    console.error('❌ Erro interno ao deletar eventos antigos:', err);
  }
}

async function handleAgendaCommand(command, userPhone) {
  try {
    // 🔹 Normaliza datas
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
          console.error('❌ Erro ao criar evento:', error);
          console.error('📦 Payload enviado ao Supabase:', JSON.stringify(command, null, 2));
          return '⚠️ Erro ao criar evento.';
        }

        await deleteOldEvents(userPhone);

        return `✅ Evento criado: ${data[0].title}
ID ${data[0].event_numero}
dia ${formatLocal(data[0].date)}`;
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
          console.error('❌ Erro ao deletar evento:', error);
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
          notified: typeof command.notified === 'boolean' ? command.notified : false,
        };

        const { data, error } = await supabase
          .from('events')
          .update(updates)
          .eq('event_numero', command.id)
          .eq('user_telefone', userPhone)
          .select('event_numero, title, date');

        if (error) {
          console.error('❌ Erro ao atualizar evento:', error);
          console.error('📦 Updates enviados:', JSON.stringify(updates, null, 2));
          return '⚠️ Erro ao atualizar evento.';
        }

        if (!data?.length) {
          return `⚠️ Nenhum evento encontrado com o ID "${command.id}".`;
        }

        await deleteOldEvents(userPhone);

        return `✅ Evento atualizado: ${data[0].title}
ID ${data[0].event_numero}
dia ${formatLocal(data[0].date)}.`;
      }

// 🔹 Listar eventos
case 'list': {
  const zone = 'America/Sao_Paulo';

  const hasId = !!command.id;
  const hasTitle = !!command.title;

  let query = supabase
    .from('events')
    .select('*')
    .eq('user_telefone', userPhone);

  // mover para escopo externo para podermos usar depois
  let startDT;
  let endDT;

  // 🔍 Filtro por ID tem prioridade absoluta e ignora datas
  if (hasId) {
    query = query.eq('event_numero', command.id);
  }
  else if (hasTitle) {
    // 🔍 Filtro por nome também ignora datas
    query = query.ilike('title', `%${command.title}%`);
  }
  else {
    // 📅 Só aplica intervalo de datas quando NÃO pesquisa por id/title

    startDT = command.start_date
      ? DateTime.fromISO(command.start_date, { zone }).startOf('day')
      : DateTime.now().setZone(zone).startOf('day');

    endDT = command.end_date
      ? DateTime.fromISO(command.end_date, { zone }).endOf('day')
      : startDT.endOf('day');

    const start = startDT.toISO({ includeOffset: true });
    const end = endDT.toISO({ includeOffset: true });

    query = query
      .gte('date', start)
      .lte('date', end);
  }

  const { data: events, error } = await query.order('date', { ascending: true });

  if (error) {
    console.error("❌ Erro ao buscar eventos:", error);
    return "⚠️ Não foi possível buscar os eventos.";
  }

  if (!events?.length) {
    if (hasId || hasTitle) {
      if (hasId) return `📅 Nenhum evento encontrado com o ID ${command.id}.`;
      return `📅 Nenhum evento encontrado com o título contendo "${command.title}".`;
    }

    // por segurança, garanta que startDT/endDT existam (não deveriam faltar aqui)
    if (!startDT || !endDT) {
      startDT = DateTime.now().setZone(zone).startOf('day');
      endDT = startDT.endOf('day');
    }

    const startBr = startDT.toFormat('dd/LL');
    const endBr = endDT.toFormat('dd/LL');
    const periodo = startBr === endBr ? startBr : `${startBr} a ${endBr}`;

    return `📅 Nenhum evento encontrado no período ${periodo}.`;
  }

  const list = events
    .map(e => `- ID ${e.event_numero}: ${e.title}
Dia ${formatLocal(e.date)}`)
    .join('\n');

  return `📅 Seus eventos:\n${list}`;
}
      default:
        console.warn('⚠️ Ação de agenda não reconhecida:', command.action);
        return "⚠️ Comando de agenda não reconhecido.";
    }
  } catch (err) {
    console.error("💥 Erro em handleAgendaCommand:", err);
    console.error("📦 Comando problemático:", JSON.stringify(command, null, 2));
    return "⚠️ Erro interno ao processar comando de agenda.";
  }
}

module.exports = handleAgendaCommand;