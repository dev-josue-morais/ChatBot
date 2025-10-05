const supabase = require("./supabase");
const formatOrcamento = require("../utils/formatOrcamento");
const { sendWhatsAppMessage } = require("./whatsappService");
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

                // Aqui 'command' já é o JSON completo do GPT
                const { data, error } = await supabase
                    .from('orcamentos')
                    .update(command)
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
                } else if (command.nome_cliente) {
                    const nome = command.nome_cliente.trim();
                    ({ data: orcamentos, error } = await supabase
                        .rpc('search_orcamentos_by_name', { name: nome }));
                } else {
                    ({ data: orcamentos, error } = await supabase.from('orcamentos').select('*'));
                }

                if (error) {
                    console.error("Erro ao listar orçamentos:", error);
                    return "⚠️ Não foi possível listar os orçamentos.";
                }

                if (!orcamentos || orcamentos.length === 0) return "📄 Nenhum orçamento encontrado.";

                // Enviar cada orçamento individualmente
                for (const o of orcamentos) {
                    await sendWhatsAppMessage(userPhone || DESTINO_FIXO, formatOrcamento(o));
                }

                return `✅ ${orcamentos.length} orçamento(s) enviados.`;
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
                            assinaturaEmpresa: false,
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