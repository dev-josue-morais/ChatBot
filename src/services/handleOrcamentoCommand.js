const supabase = require("./supabase");
const formatOrcamento = require("../utils/formatOrcamento");
const { sendWhatsAppMessage } = require("./whatsappService");
const { sendPDFOrcamento } = require("./whatsappService");
const { formatPhoneNumber } = require("../utils/formatPhoneNumber");

async function handleOrcamentoCommand(command, userPhone) {
    try {
        if (command.telefone_cliente) { command.telefone_cliente = formatPhoneNumber(command.telefone_cliente);}
        switch (command.action) {

            // ------------------- CREATE -------------------
            case 'create': {
                if (!command.nome_cliente) return "⚠️ O campo *nome do cliente* é obrigatório.";
                if (!command.telefone_cliente) return "⚠️ O campo *telefone do cliente* é obrigatório.";

                const observacoes = Array.isArray(command.observacoes) ? command.observacoes.filter(Boolean) : [];

                const { data, error } = await supabase.from('orcamentos').insert([{
    nome_cliente: command.nome_cliente,
    telefone_cliente: command.telefone_cliente,
    etapa: command.etapa || "negociacao",
    observacoes,
    materiais: command.materiais || [],
    servicos: command.servicos || [],
    desconto_materiais: command.desconto_materiais || 0,
    desconto_servicos: command.desconto_servicos || 0,
    user_telefone: userPhone
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
                    .eq('user_telefone', userPhone)
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
                if (!command.orcamento_numero)
                    return '⚠️ É necessário informar o ID do orçamento para editar.';
  // console.log('🧠 JSON recebido do GPT para edição:', JSON.stringify(command, null, 2));

                const validFields = {
    nome_cliente: command.nome_cliente,
    telefone_cliente: command.telefone_cliente,
    etapa: command.etapa || undefined,
    observacoes: command.observacoes,
    materiais: command.materiais,
    servicos: command.servicos,
    desconto_materiais: command.desconto_materiais,
    desconto_servicos: command.desconto_servicos
};

                const { data, error } = await supabase
                    .from('orcamentos')
                    .update(validFields)
                    .eq('orcamento_numero', command.orcamento_numero)
                    .eq('user_telefone', userPhone)
                    .select();

                if (error) {
                    console.error("Erro ao editar orçamento:", error);
                    return `⚠️ Não consegui editar o orçamento ${command.orcamento_numero}.`;
                }

                if (!data || data.length === 0) {
                    return `⚠️ Nenhum orçamento encontrado com o número ${command.orcamento_numero}.`;
                }

                return `${formatOrcamento(data[0])}`;
            }
            // ------------------- LIST -------------------
            case 'list': {
                let query = supabase
                    .from('orcamentos')
                    .select('*')
                    .eq('user_telefone', userPhone);

                // Filtros opcionais
                if (command.id) {
                    query = query.eq('orcamento_numero', command.id);
                } eles if (command.etapa) {
    query = query.eq('etapa', command.etapa.trim().toLowerCase());
} else if (command.telefone_cliente) {
                    query = query.eq('telefone_cliente', command.telefone_cliente);
                } else if (command.nome_cliente) {
                    const nome = command.nome_cliente.trim();
                    query = query.ilike('nome_cliente', `%${nome}%`);
                }

                // Ordenar resultados (mais recentes primeiro)
                query = query.order('criado_em', { ascending: false });

                const { data: orcamentos, error } = await query;

                if (error) {
                    console.error("Erro ao listar orçamentos:", error);
                    return "⚠️ Não foi possível listar os orçamentos.";
                }

                if (!orcamentos || orcamentos.length === 0) {
                    return "📄 Nenhum orçamento encontrado.";
                }

                // Envia cada orçamento separadamente
                for (const o of orcamentos) {
                    await sendWhatsAppMessage(userPhone, formatOrcamento(o));
                }

                return `✅ ${orcamentos.length} orçamento(s) enviados.`;
            }

// ------------------- PDF -------------------
case "pdf": {
    try {
        if (!command.id)
            return "⚠️ É necessário informar o ID do orçamento para gerar o PDF.";

        const { data: orcamentos, error: errOrc } = await supabase
            .from("orcamentos")
            .select("*")
            .eq("orcamento_numero", command.id)
            .eq("user_telefone", userPhone)
            .limit(1);

        if (errOrc) {
            console.error("Erro ao buscar orçamento:", errOrc);
            return `⚠️ Não consegui gerar o PDF do orçamento ${command.id}.`;
        }

        if (!orcamentos?.length)
            return `⚠️ Orçamento ${command.id} não encontrado.`;

        const o = orcamentos[0];

        const { data: users, error: errUser } = await supabase
            .from("users")
            .select("*")
            .eq("telefone", userPhone)
            .limit(1);

        if (errUser || !users?.length) {
            console.error("Erro ao buscar usuário:", errUser);
            return "⚠️ Usuário não encontrado para gerar o PDF.";
        }

        const user = users[0];

        // ================================
        // 📄 Configuração do PDF
        // ================================
        const pdfConfig = {
            tipo: command.tipo || "Orçamento",
            opcoes: command.opcoes || {
                listaServicos: true,
                listaMateriais: true,
                ocultarValorServicos: false,
                garantia: true,
                assinaturaEmpresa: false,
                assinaturaUser: false,
            },
        };

        // 💵 Se for RECIBO, incluir o valor
        if (pdfConfig.tipo === "Recibo") {
            const valor = parseFloat(command.valorRecibo);
            pdfConfig.valorRecibo = !isNaN(valor) && valor > 0 ? valor : null;

            if (!pdfConfig.valorRecibo)
                console.warn(`⚠️ Valor do recibo não informado ou inválido para o orçamento ${command.id}.`);
        }

        // ✅ Envia para função geradora de PDF
        const enviado = await sendPDFOrcamento(userPhone, o, { ...pdfConfig, user });

        if (enviado) {
            return;
        } else {
            return `⚠️ PDF do ${pdfConfig.tipo.toLowerCase()} ${command.id} gerado mas não foi possível enviar pelo WhatsApp.`;
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