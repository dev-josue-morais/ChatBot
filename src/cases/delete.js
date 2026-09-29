const supabase = require('../services/supabase');
const formatCurrency = require('../utils/formatCurrency');

async function executeDelete(command, userPhone) {

  if (command.modulo === 'agenda') {

    if (!command.id) {
      return '⚠️ É necessário informar o ID do evento para deletar.';
    }

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

  if (command.modulo === 'despesas') {

    const id = command.id;

    if (!id) {
      return '⚠️ É necessário informar o ID da despesa para excluir.';
    }

    // Verifica primeiro se a despesa pertence ao usuário
    const {
      data: current,
      error: fetchError
    } = await supabase
      .from('despesas')
      .select('*')
      .eq('despesa_numero', String(id))
      .eq('user_phone', userPhone)
      .single();

    if (fetchError || !current) {
      return `⚠️ Não encontrei a despesa ID ${id}.`;
    }

    // DELETE
    const {
      error: deleteError
    } = await supabase
      .from('despesas')
      .delete()
      .eq('despesa_numero', String(id))
      .eq('user_phone', userPhone);

    if (deleteError) {
      console.error(
        'Erro ao deletar despesa:',
        deleteError
      );

      return '❌ Falha ao excluir despesa.';
    }

    return [
      '🗑️ Despesa excluída com sucesso!',
      '',
      `🆔 ${current.despesa_numero}`,
      `📘 ${current.descricao}`,
      `💰 ${formatCurrency(current.valor)}`
    ].join('\n');
  }

  if (command.modulo === 'orcamento') {

    if (!command.id) {
      return '⚠️ É necessário informar o ID do orçamento para deletar.';
    }

    const { data, error } = await supabase
      .from('orcamentos')
      .delete()
      .eq('orcamento_numero', command.id)
      .eq('user_telefone', userPhone)
      .select();

    if (error) {
      console.error('Erro ao deletar orçamento:', error);
      return `⚠️ Não consegui deletar o orçamento ${command.id}.`;
    }

    if (!data || data.length === 0) {
      return `⚠️ Orçamento ${command.id} não encontrado.`;
    }

    return `🗑 Orçamento ${command.id} deletado com sucesso.`;
  }

  return '⚠️ Módulo não reconhecido para exclusão.';
}

module.exports = {
  executeDelete
};