const supabase = require('../services/supabase');
const formatCurrency = require('../utils/formatCurrency');

function hasValidId(id) {
    return (
        id !== null &&
        id !== undefined &&
        id !== '' &&
        !Number.isNaN(Number(id))
    );
}

async function executeDelete(command, userPhone) {

    if (!hasValidId(command.id)) {
        if (command.modulo === 'agenda') {
            return '⚠️ É necessário informar o ID do evento para deletar.';
        }

        if (command.modulo === 'despesas') {
            return '⚠️ É necessário informar o ID da despesa para excluir.';
        }

        if (command.modulo === 'orcamento') {
            return '⚠️ É necessário informar o ID do orçamento para deletar.';
        }

        return '⚠️ É necessário informar o ID para exclusão.';
    }

    const id = command.id;

    // ================================
    // AGENDA
    // ================================

    if (command.modulo === 'agenda') {

        const { data, error } = await supabase
            .from('events')
            .delete()
            .eq('event_numero', id)
            .eq('user_telefone', userPhone)
            .select('event_numero, title');

        if (error) {
            console.error(
                '❌ Erro ao deletar evento:',
                error
            );

            return '⚠️ Erro ao deletar evento.';
        }

        if (!data?.length) {
            return `⚠️ Nenhum evento encontrado com o ID "${id}".`;
        }

        return `🗑 Evento ID ${data[0].event_numero} "${data[0].title}" removido com sucesso.`;
    }

    // ================================
    // DESPESAS
    // ================================

    if (command.modulo === 'despesas') {

        const { data, error } = await supabase
            .from('despesas')
            .delete()
            .eq('despesa_numero', String(id))
            .eq('user_phone', userPhone)
            .select('despesa_numero, descricao, valor');

        if (error) {
            console.error(
                'Erro ao deletar despesa:',
                error
            );

            return '❌ Falha ao excluir despesa.';
        }

        if (!data?.length) {
            return `⚠️ Não encontrei a despesa ID ${id}.`;
        }

        const despesa = data[0];

        return [
            '🗑️ Despesa excluída com sucesso!',
            '',
            `🆔 ${despesa.despesa_numero}`,
            `📘 ${despesa.descricao}`,
            `💰 ${formatCurrency(despesa.valor)}`
        ].join('\n');
    }

    // ================================
    // ORÇAMENTO
    // ================================

    if (command.modulo === 'orcamento') {

        const { data, error } = await supabase
            .from('orcamentos')
            .delete()
            .eq('orcamento_numero', id)
            .eq('user_telefone', userPhone)
            .select('orcamento_numero');

        if (error) {
            console.error(
                'Erro ao deletar orçamento:',
                error
            );

            return `⚠️ Não consegui deletar o orçamento ${id}.`;
        }

        if (!data?.length) {
            return `⚠️ Orçamento ${id} não encontrado.`;
        }

        return `🗑 Orçamento ${id} deletado com sucesso.`;
    }

    return '⚠️ Módulo não reconhecido para exclusão.';
}

module.exports = {
    executeDelete
};