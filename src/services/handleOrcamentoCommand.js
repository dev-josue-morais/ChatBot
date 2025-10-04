const supabase = require("./supabase");
const formatOrcamento = require("../utils/formatOrcamento");
const { sendPDFOrcamento } = require("./whatsappService");
const { DESTINO_FIXO } = require('../utils/config');

async function handleOrcamentoCommand(command, userPhone) {
    try {
        switch (command.action) {

            // ------------------- CREATE -------------------
            case 'create': {
                if (!command.nome_cliente) return "⚠️ O campo *nome do cliente* é obrigatório.";
                if (!command.telefone_cliente) return "⚠️ O campo *telefone do cliente* é obrigatório.";

                const observacoes = Array.isArray(command.observacao) ? command.observacao.filter(Boolean) : [];

                const { data, error } = await supabase.from('orcamentos').insert([{
                    nome_cliente: command.nome_cliente,
                    telefone_cliente: command.telefone_cliente,
                    descricao_atividades: observacoes,
                    materiais: command.materiais || [],
                    servicos: command.servicos || [],
                    desconto_materiais: command.desconto_materiais || 0,
                    desconto_servicos: command.desconto_servicos || 0
                }]).select();

                if (error) {
                    console.error("Erro ao criar orçamento:", error);
                    return `⚠️ Não consegui criar o orçamento para "${command.nome_cliente}".`;
                }

                return `${formatOrcamento(data[0])}`;
            }

            // ------------------- DELETE -------------------
            case 'delete': {
                if (!command.id) return '⚠️ É necessário informar o ID do orçamento para deletar.';

                const { data, error } = await supabase
                    .from('orcamentos')
                    .delete()
                    .eq('orcamento_numero', command.id)
                    .select();

                if (error) {
                    console.error("Erro ao deletar orçamento:", error);
                    return `⚠️ Não consegui deletar o orçamento ${command.id}.`;
                }

                if (!data || data.length === 0) return `⚠️ Orçamento ${command.id} não encontrado.`;

                return `🗑 Orçamento ${command.id} deletado com sucesso.`;
            }

            // ------------------- EDIT -------------------
            case 'edit': {
                if (!command.id) return '⚠️ É necessário informar o ID do orçamento para editar.';

                const { data: currentData, error: fetchError } = await supabase
                    .from('orcamentos')
                    .select('materiais, servicos, nome_cliente, telefone_cliente, descricao_atividades, desconto_materiais, desconto_servicos')
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
                    materiais = command.materiais.map(m => ({
                        nome: m.nome.trim(),
                        qtd: m.qtd,
                        valor: m.valor,
                        unidade: m.unidade?.trim()
                    }));
                }

                if (command.add_materiais) {
                    for (const newItem of command.add_materiais) {
                        const nomeNormalized = newItem.nome.trim().toLowerCase();
                        const existing = materiais.find(m => m.nome.trim().toLowerCase() === nomeNormalized);
                        if (existing) {
                            if (newItem.qtd != null) existing.qtd = newItem.qtd;
                            if (newItem.valor != null) existing.valor = newItem.valor;
                            if (newItem.unidade != null) existing.unidade = newItem.unidade.trim();
                        } else {
                            materiais.push({ ...newItem, nome: newItem.nome.trim(), unidade: newItem.unidade?.trim() });
                        }
                    }
                }

                if (command.edit_materiais) {
                    for (const edit of command.edit_materiais) {
                        const nomeNormalized = edit.nome.trim().toLowerCase();
                        const item = materiais.find(m => m.nome.trim().toLowerCase() === nomeNormalized);
                        if (item) {
                            if (edit.qtd != null) item.qtd = edit.qtd;
                            if (edit.valor != null) item.valor = edit.valor;
                            if (edit.unidade != null) item.unidade = edit.unidade.trim();
                        }
                    }
                }

                if (command.remove_materiais) {
                    materiais = materiais.filter(
                        m => !command.remove_materiais.some(r => r.nome.trim().toLowerCase() === m.nome.trim().toLowerCase())
                    );
                }

                // --- Serviços ---
                if (command.servicos) {
                    servicos = command.servicos.map(s => ({
                        titulo: s.titulo.trim(),
                        quantidade: s.quantidade ?? 1,
                        valor: s.valor
                    }));
                }

                if (command.add_servicos) {
                    for (const newItem of command.add_servicos) {
                        const tituloNormalized = newItem.titulo.trim().toLowerCase();
                        const existing = servicos.find(s => s.titulo.trim().toLowerCase() === tituloNormalized);
                        if (existing) {
                            if (newItem.quantidade != null) existing.quantidade = newItem.quantidade;
                            if (newItem.valor != null) existing.valor = newItem.valor;
                        } else {
                            servicos.push({
                                titulo: newItem.titulo.trim(),
                                quantidade: newItem.quantidade ?? 1,
                                valor: newItem.valor
                            });
                        }
                    }
                }

                if (command.edit_servicos) {
                    for (const edit of command.edit_servicos) {
                        const tituloNormalized = edit.titulo.trim().toLowerCase();
                        const item = servicos.find(s => s.titulo.trim().toLowerCase() === tituloNormalized);
                        if (item) {
                            if (edit.quantidade != null) item.quantidade = edit.quantidade;
                            if (edit.valor != null) item.valor = edit.valor;
                        }
                    }
                }

                if (command.remove_servicos) {
                    servicos = servicos.filter(
                        s => !command.remove_servicos.some(
                            r => r.titulo.trim().toLowerCase() === s.titulo.trim().toLowerCase()
                        )
                    );
                }

                // Observações sempre array
                const observacoes = Array.isArray(command.observacao) ? command.observacao.filter(Boolean) : currentData.descricao_atividades || [];

                const updates = {
                    ...(command.nome_cliente && { nome_cliente: command.nome_cliente }),
                    ...(command.telefone_cliente && { telefone_cliente: command.telefone_cliente }),
                    descricao_atividades: observacoes,
                    materiais,
                    servicos,
                    ...(command.desconto_materiais !== undefined && { desconto_materiais: command.desconto_materiais }),
                    ...(command.desconto_servicos !== undefined && { desconto_servicos: command.desconto_servicos }),
                };

                const { data, error } = await supabase
                    .from('orcamentos')
                    .update(updates)
                    .eq('orcamento_numero', command.id)
                    .select();

                if (error) {
                    console.error("Erro ao editar orçamento:", error);
                    return `⚠️ Não consegui editar o orçamento ${command.id}.`;
                }

                return `${formatOrcamento(data[0])}`;
            }

            // ------------------- LIST -------------------
            case 'list': {
                let orcamentos;
                let error;

                if (command.telefone_cliente || command.id) {
                    let query = supabase.from('orcamentos').select('*');
                    if (command.telefone_cliente) query = query.eq('telefone_cliente', command.telefone_cliente);
                    if (command.id) query = query.eq('orcamento_numero', command.id);
                    ({ data: orcamentos, error } = await query);
                }
                else if (command.nome_cliente) {
                    const nome = command.nome_cliente.trim();
                    ({ data: orcamentos, error } = await supabase
                        .rpc('search_orcamentos_by_name', { name: nome }));
                }
                else {
                    ({ data: orcamentos, error } = await supabase.from('orcamentos').select('*'));
                }

                if (error) {
                    console.error("Erro ao listar orçamentos:", error);
                    return "⚠️ Não foi possível listar os orçamentos.";
                }

                if (!orcamentos || orcamentos.length === 0) return "📄 Nenhum orçamento encontrado.";

                return orcamentos.map(formatOrcamento).join("\n\n----------------------------\n\n");
            }

            // ------------------- PDF -------------------
            case "pdf": {
                try {
                    if (!command.id) return "⚠️ É necessário informar o ID do orçamento para gerar o PDF.";

                    const { data: orcamentos, error } = await supabase
                        .from("orcamentos")
                        .select("*")
                        .eq("orcamento_numero", command.id)
                        .limit(1);

                    if (error) {
                        console.error("Erro ao buscar orçamento:", error);
                        return `⚠️ Não consegui gerar o PDF do orçamento ${command.id}.`;
                    }

                    if (!orcamentos || orcamentos.length === 0) {
                        return `⚠️ Orçamento ${command.id} não encontrado.`;
                    }

                    const o = orcamentos[0];

                    const pdfConfig = {
                        tipo: command.tipo || "Orçamento",
                        opcoes: command.opcoes || {
                            listaServicos: true,
                            listaMateriais: true,
                            ocultarValorServicos: false,
                            garantia: true,
                            assinaturaCliente: false,
                            assinaturaUser: false,
                        }
                    };

                    const enviado = await sendPDFOrcamento(command.telefone_cliente || DESTINO_FIXO, o, pdfConfig);

                    if (enviado) {
                        return `✅ PDF do orçamento ${command.id} enviado com sucesso para ${command.telefone_cliente || DESTINO_FIXO}!`;
                    } else {
                        return `⚠️ PDF do orçamento ${command.id} gerado mas não foi possível enviar pelo WhatsApp.`;
                    }
                } catch (err) {
                    console.error("Erro ao gerar/enviar PDF:", err);
                    return `⚠️ Erro ao gerar/enviar PDF do orçamento ${command.id}.`;
                }
            }

            default:
                return '⚠️ Ação desconhecida.';
        }
    } catch (err) {
        console.error("Erro ao processar comando:", err);
        return "⚠️ Ocorreu um erro ao processar o comando.";
    }
}

module.exports = handleOrcamentoCommand;