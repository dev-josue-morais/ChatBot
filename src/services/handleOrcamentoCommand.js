const supabase = require('./supabase');

function formatOrcamento(o) {
    return `
📝 Orçamento ${o.orcamento_numero}
👤 Cliente: ${o.nome_cliente}
📞 Telefone: ${o.telefone_cliente}
📌 Observação: ${o.descricao_atividades || '-'}
📦 Materiais:
${(o.materiais && o.materiais.length > 0)
        ? o.materiais.map(m => `   - ${m.nome} (Qtd: ${m.qtd} ${m.unidade || ''}, Valor: ${m.valor})`).join("\n")
        : "   Nenhum"}
💰 Desconto Materiais: ${o.desconto_materiais || '0'}
🔧 Serviços:
${(o.servicos && o.servicos.length > 0)
        ? o.servicos.map(s => `   - ${s.nome} (Valor: ${s.valor})`).join("\n")
        : "   Nenhum"}
💰 Desconto Serviços: ${o.desconto_servicos || '0'}
`.trim();
}

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

                return `✅ Orçamento criado com sucesso:\n\n${formatOrcamento(data[0])}`;
            }

            case 'edit': {
                if (!command.id) return '⚠️ É necessário informar o ID do orçamento para editar.';

                const updates = {};
                if (command.nome_cliente) updates.nome_cliente = command.nome_cliente;
                if (command.telefone_cliente) updates.telefone_cliente = command.telefone_cliente;
                if (command.descricao_atividades) updates.descricao_atividades = command.descricao_atividades;
                if (command.materiais) updates.materiais = command.materiais;
                if (command.servicos) updates.servicos = command.servicos;
                if (command.desconto_materiais) updates.desconto_materiais = command.desconto_materiais;
                if (command.desconto_servicos) updates.desconto_servicos = command.desconto_servicos;

                const { data, error } = await supabase
                    .from('orcamentos')
                    .update(updates)
                    .eq('orcamento_numero', command.id)
                    .select();

                if (error) {
                    console.error("Erro ao editar orçamento:", error);
                    return `⚠️ Não consegui editar o orçamento ${command.id}.`;
                }

                return `✏️ Orçamento atualizado com sucesso:\n\n${formatOrcamento(data[0])}`;
            }

            case 'delete': {
                if (!command.id) return '⚠️ É necessário informar o ID do orçamento para deletar.';

                const { error } = await supabase
                    .from('orcamentos')
                    .delete()
                    .eq('orcamento_numero', command.id);

                if (error) {
                    console.error("Erro ao deletar orçamento:", error);
                    return `⚠️ Não consegui deletar o orçamento ${command.id}.`;
                }

                return `🗑 Orçamento ${command.id} deletado com sucesso.`;
            }

            case 'list': {
                let query = supabase.from('orcamentos').select('*');

                if (command.telefone_cliente) {
                    query = query.eq('telefone_cliente', command.telefone_cliente);
                }
                if (command.nome_cliente) {
                    query = query.ilike('nome_cliente', `%${command.nome_cliente}%`);
                }
                if (command.orcamento_numero) {
                    query = query.eq('orcamento_numero', command.orcamento_numero);
                }

                const { data: orcamentos, error } = await query;

                if (error) {
                    console.error("Erro ao listar orçamentos:", error);
                    return "⚠️ Não foi possível listar os orçamentos.";
                }

                if (!orcamentos || orcamentos.length === 0) return "📄 Nenhum orçamento encontrado.";

                return orcamentos.map(formatOrcamento).join("\n\n---\n\n");
            }

            case 'pdf': {
                if (!command.orcamento_numero) return '⚠️ É necessário informar o número do orçamento para gerar PDF.';
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