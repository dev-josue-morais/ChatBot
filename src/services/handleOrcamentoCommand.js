const supabase = require('./supabase');

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value || 0);
}

function formatOrcamento(o) {
    const totalMateriais = (o.materiais || []).reduce((sum, m) => {
        return sum + (m.qtd || 0) * (m.valor || 0);
    }, 0);

    const totalServicos = (o.servicos || []).reduce((sum, s) => {
        return sum + (s.valor || 0);
    }, 0);

    const descontoMateriais = parseFloat(o.desconto_materiais || 0);
    const descontoServicos = parseFloat(o.desconto_servicos || 0);

    const totalGeral = (totalMateriais - descontoMateriais) + (totalServicos - descontoServicos);

    return `
📝 Orçamento ${o.orcamento_numero}
👤 Cliente: ${o.nome_cliente}
📞 Telefone: ${o.telefone_cliente}
📌 Observação: ${o.descricao_atividades || '-'}

📦 Materiais:
${(o.materiais && o.materiais.length > 0)
        ? o.materiais.map(m => {
            const total = (m.qtd || 0) * (m.valor || 0);
            return `   - ${m.nome} (Qtd: ${m.qtd} ${m.unidade || ''}, Unit: ${formatCurrency(m.valor)}, Total: ${formatCurrency(total)})`;
        }).join("\n")
        : "   Nenhum"}

💰 Total Materiais: ${formatCurrency(totalMateriais)}
💰 Desconto Materiais: ${formatCurrency(descontoMateriais)}

🔧 Serviços:
${(o.servicos && o.servicos.length > 0)
        ? o.servicos.map(s => `   - ${s.nome} (Valor: ${formatCurrency(s.valor)})`).join("\n")
        : "   Nenhum"}

💰 Total Serviços: ${formatCurrency(totalServicos)}
💰 Desconto Serviços: ${formatCurrency(descontoServicos)}

🧾 Total Geral: ${formatCurrency(totalGeral)}
`.trim();
}

async function handleOrcamentoCommand(command, userPhone) {
    try {
        switch (command.action) {
            case 'create': {
    if (!command.nome_cliente) {
        return "⚠️ O campo *nome do cliente* é obrigatório.";
    }
    if (!command.telefone_cliente) {
        return "⚠️ O campo *telefone do cliente* é obrigatório.";
    }

    const { data, error } = await supabase.from('orcamentos').insert([{
        nome_cliente: command.nome_cliente,
        telefone_cliente: command.telefone_cliente,
        descricao_atividades: command.descricao_atividades || '',
        materiais: command.materiais || [],
        servicos: command.servicos || [],
        desconto_materiais: command.desconto_materiais || 0,
        desconto_servicos: command.desconto_servicos || 0
    }]).select();

    if (error) {
        console.error("Erro ao criar orçamento:", error);
        return `⚠️ Não consegui criar o orçamento para "${command.nome_cliente}".`;
    }

    return `✅ Orçamento criado com sucesso:\n\n${formatOrcamento(data[0])}`;
}

            case 'edit': {
    if (!command.id) return '⚠️ É necessário informar o ID do orçamento para editar.';

    // Buscar orçamento atual
    const { data: currentData, error: fetchError } = await supabase
        .from('orcamentos')
        .select('materiais, servicos')
        .eq('orcamento_numero', command.id)
        .single();

    if (fetchError) {
        console.error("Erro ao buscar orçamento:", fetchError);
        return `⚠️ Não consegui buscar o orçamento ${command.id}.`;
    }

    let materiais = [...(currentData.materiais || [])];
    let servicos = [...(currentData.servicos || [])];

    // --- Materiais ---
    if (command.materiais) {
        // substitui lista inteira
        materiais = command.materiais;
    }
    if (command.add_materiais) {
        materiais = [...materiais, ...command.add_materiais];
    }
    if (command.remove_materiais) {
        materiais = materiais.filter(m => !command.remove_materiais.some(r => r.nome === m.nome));
    }
    if (command.edit_materiais) {
        materiais = materiais.map(m => {
            const update = command.edit_materiais.find(e => e.nome === m.nome);
            return update ? { ...m, ...update } : m;
        });
    }

    // --- Serviços ---
    if (command.servicos) {
        servicos = command.servicos;
    }
    if (command.add_servicos) {
        servicos = [...servicos, ...command.add_servicos];
    }
    if (command.remove_servicos) {
        servicos = servicos.filter(s => !command.remove_servicos.some(r => r.nome === s.nome));
    }
    if (command.edit_servicos) {
        servicos = servicos.map(s => {
            const update = command.edit_servicos.find(e => e.nome === s.nome);
            return update ? { ...s, ...update } : s;
        });
    }

    // Monta updates
    const updates = {
        ...(command.nome_cliente && { nome_cliente: command.nome_cliente }),
        ...(command.telefone_cliente && { telefone_cliente: command.telefone_cliente }),
        ...(command.descricao_atividades && { descricao_atividades: command.descricao_atividades }),
        materiais,
        servicos,
        ...(command.desconto_materiais !== undefined && { desconto_materiais: command.desconto_materiais }),
        ...(command.desconto_servicos !== undefined && { desconto_servicos: command.desconto_servicos }),
    };

    // Atualiza no banco
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
                if (command.id) {
                    query = query.eq('orcamento_numero', command.id);
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