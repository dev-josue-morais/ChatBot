const supabase = require('./supabase');

async function handleOrcamentoCommand(command, userPhone) {
    try {
        switch (command.action) {
            case 'create': {
                const { data, error } = await supabase.from('orcamentos').insert([{
                    nome_cliente: command.nome_cliente,
                    telefone_cliente: command.telefone_cliente,
                    descricao_atividades: command.descricao_atividades || '',
                    materiais: command.materiais || [],
                    servicos: command.servicos || [],
                    desconto_materiais: command.desconto_materiais || '',
                    desconto_servicos: command.desconto_servicos || ''
                }]).select();

                if (error) {
                    console.error("Erro ao criar orçamento:", error);
                    return `⚠️ Não consegui criar o orçamento para "${command.nome_cliente}".`;
                }

                return `✅ Orçamento criado com sucesso para ${command.nome_cliente} (ID: ${data[0].id})`;
            }

            case 'edit': {
                if (!command.orcamento_numero) return '⚠️ É necessário informar o ID do orçamento para editar.';

                const updates = {};
                if (command.nome_cliente) updates.nome_cliente = command.nome_cliente;
                if (command.telefone_cliente) updates.telefone_cliente = command.telefone_cliente;
                if (command.descricao_atividades) updates.descricao_atividades = command.descricao_atividades;
                if (command.materiais) updates.materiais = command.materiais;
                if (command.servicos) updates.servicos = command.servicos;
                if (command.desconto_materiais) updates.desconto_materiais = command.desconto_materiais;
                if (command.desconto_servicos) updates.desconto_servicos = command.desconto_servicos;

                const { error } = await supabase
                    .from('orcamentos')
                    .update(updates)
                    .eq('orcamento_numero', command.orcamento_numero);

                if (error) {
                    console.error("Erro ao editar orçamento:", error);
                    return `⚠️ Não consegui editar o orçamento ${command.orcamento_numero}.`;
                }

                return `✏️ Orçamento ${command.orcamento_numero} atualizado com sucesso.`;
            }
            case 'delete': {
                if (!command.orcamento_numero) return '⚠️ É necessário informar o ID do orçamento para deletar.';

                const { error } = await supabase
                    .from('orcamentos')
                    .delete()
                    .eq('orcamento_numero', command.orcamento_numero);

                if (error) {
                    console.error("Erro ao deletar orçamento:", error);
                    return `⚠️ Não consegui deletar o orçamento ${command.orcamento_numero}.`;
                }

                return `🗑 Orçamento ${command.orcamento_numero} deletado com sucesso.`;
            }

            case 'list': {
                const { data: orcamentos, error } = await supabase
                    .from('orcamentos')
                    .select('*');

                if (error) {
                    console.error("Erro ao listar orçamentos:", error);
                    return "⚠️ Não foi possível listar os orçamentos.";
                }

                if (!orcamentos || orcamentos.length === 0) return "📄 Nenhum orçamento encontrado.";

                return `📄 Orçamentos:\n` + orcamentos.map(o => `- ${o.nome_cliente} (ID: ${o.orcamento_numero})`).join('\n');
            }

            case 'pdf': {
                if (!command.orcamento_numero) return '⚠️ É necessário informar o número do orçamento para gerar PDF.';
                // Aqui você pode chamar sua função de geração de PDF
                return `🖨 PDF do orçamento ${command.orcamento_numero} gerado com sucesso (simulado).`;
            }

            default:
                return "⚠️ Comando de orçamento não reconhecido.";
        }
    } catch (err) {
        console.error("Erro em handleOrcamentoCommand:", err);
        return "⚠️ Erro interno ao processar comando de orçamento.";
    }
}

module.exports = handleOrcamentoCommand;
