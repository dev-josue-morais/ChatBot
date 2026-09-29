const supabase = require("./supabase");
const formatOrcamento = require("../utils/formatOrcamento");
const { sendWhatsAppRaw, sendPDFOrcamento } = require("./whatsappService");
const { formatPhoneNumber } = require("../utils/utils");
const formatCurrency = require("../utils/formatCurrency");
const aplicarDesconto = require("../utils/aplicarDesconto");

const {
    calcularTotalOrcamento,
    formatRelatorioOrcamentos,
    formatFiltrosOrcamento,
    normalizeMoney
} = require("../utils/handlersFunctions");

async function handleOrcamentoCommand(command, userPhone) {
    try {

        if (command.telefone_cliente) {
            command.telefone_cliente =
                formatPhoneNumber(command.telefone_cliente);
        }

        switch (command.action) {

// ------------------- CREATE -------------------
            case 'create': {
                if (!command.nome_cliente) return "⚠️ O campo *nome do cliente* é obrigatório.";
                if (!command.telefone_cliente) return "⚠️ O campo *telefone do cliente* é obrigatório.";

const materiais = Array.isArray(command.materiais)
    ? command.materiais.map(m => ({
        ...m,
        qtd: normalizeMoney(m.qtd),
        valor: normalizeMoney(m.valor),
        unidade: m.und
    }))
    : [];

const servicos = Array.isArray(command.servicos)
    ? command.servicos.map(s => ({
        ...s,
        quantidade: normalizeMoney(s.qtd),
        valor: normalizeMoney(s.valor)
    }))
    : [];

                const observacoes = Array.isArray(command.observacoes) ? command.observacoes.filter(Boolean) : [];
const descricoes = Array.isArray(command.descricoes)
                ? command.descricoes.map(d => String(d).replace(/\n/g, '').trim()).filter(Boolean)
                : [];

                const { data, error } = await supabase.from('orcamentos').insert([{
    nome_cliente: command.nome_cliente,
    telefone_cliente: command.telefone_cliente,
    etapa: command.etapa || "negociacao",
    observacoes,
    descricoes,
    materiais,
    servicos,
    desconto_materiais: normalizeMoney(command.desconto_materiais),
    desconto_servicos: normalizeMoney(command.desconto_servicos),
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

const descricoes = Array.isArray(command.descricoes)
                ? command.descricoes.map(d => String(d).replace(/\n/g, '').trim()).filter(Boolean)
                : null;
const materiais = Array.isArray(command.materiais)
    ? command.materiais.map(m => ({
        ...m,
        qtd: normalizeMoney(m.qtd),
        valor: normalizeMoney(m.valor),
        unidade: m.und
    }))
    : undefined;

const servicos = Array.isArray(command.servicos)
    ? command.servicos.map(s => ({
        ...s,
        quantidade: normalizeMoney(s.qtd),
        valor: normalizeMoney(s.valor)
    }))
    : undefined;

                const validFields = {
    nome_cliente: command.nome_cliente,
    telefone_cliente: command.telefone_cliente,
    etapa: command.etapa || undefined,
    observacoes: command.observacoes,
    materiais,
    servicos,
    desconto_materiais: command.desconto_materiais !== undefined
        ? normalizeMoney(command.desconto_materiais)
        : undefined,
    desconto_servicos: command.desconto_servicos !== undefined
        ? normalizeMoney(command.desconto_servicos)
        : undefined,
    descricoes
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

    console.log(
        '🧠 JSON recebido do GPT para lista:',
        JSON.stringify(command, null, 2)
    );

    const filtros = command.filtros || {};

    let query = supabase
        .from('orcamentos')
        .select('*')
        .eq('user_telefone', userPhone);

    // ==================================================
    // FILTRO POR ID
    // ==================================================
    if (filtros.por_id === true) {

        if (!command.id) {
            return '⚠️ O filtro por ID foi identificado, mas nenhum ID foi informado.';
        }

        query = query.eq(
            'orcamento_numero',
            command.id
        );
    }

    // ==================================================
    // FILTRO POR NOME DO CLIENTE
    // ==================================================
    if (filtros.por_nome_cliente === true) {

        if (!command.nome_cliente) {
            return '⚠️ O filtro por cliente foi identificado, mas nenhum nome foi informado.';
        }

        const nome = String(command.nome_cliente).trim();

        query = query.ilike(
            'nome_cliente',
            `%${nome}%`
        );
    }

    // ==================================================
    // FILTRO POR TELEFONE
    // ==================================================
    if (filtros.por_telefone_cliente === true) {

        if (!command.telefone_cliente) {
            return '⚠️ O filtro por telefone foi identificado, mas nenhum telefone foi informado.';
        }

        const telefone = formatPhoneNumber(
            command.telefone_cliente
        );

        query = query.eq(
            'telefone_cliente',
            telefone
        );
    }

    // ==================================================
    // ==================================================
// FILTRO POR ETAPA
// ==================================================
if (filtros.por_etapa === true) {

    const etapa = String(command.etapa || '')
        .trim()
        .toLowerCase();

    const etapasValidas = [
        'negociacao',
        'andamento',
        'aprovado',
        'perdido',
        'finalizado'
    ];

    if (!etapasValidas.includes(etapa)) {
        return `⚠️ Etapa inválida: ${command.etapa}`;
    }

    query = query.eq('etapa', etapa);
}
// ==================================================
// FILTRO POR PERÍODO
// ==================================================
if (filtros.por_periodo === true) {

    if (!command.periodo_start || !command.periodo_end) {
        return '⚠️ O filtro por período foi identificado, mas as datas não foram informadas.';
    }

    const startLocal =
        `${command.periodo_start}T00:00:00-03:00`;

    const endLocal =
        `${command.periodo_end}T23:59:59-03:00`;

    const startIso =
        new Date(startLocal).toISOString();

    const endIso =
        new Date(endLocal).toISOString();

    const etapaFinalizado =
        filtros.por_etapa === true &&
        String(command.etapa || '')
            .trim()
            .toLowerCase() === 'finalizado';

    const campoData =
        etapaFinalizado
            ? 'finalizado_em'
            : 'criado_em';

    query = query
        .gte(campoData, startIso)
        .lte(campoData, endIso);
}
    // ==================================================
    // ORDENAÇÃO
    // ==================================================
    query = query.order(
        'criado_em',
        { ascending: false }
    );

    const {
        data: orcamentos,
        error
    } = await query;

    // ==================================================
    // ERRO SUPABASE
    // ==================================================
    if (error) {

        console.error(
            "Erro ao listar orcamentos:",
            error
        );

        return "⚠️ Não foi possível listar os orçamentos.";
    }

    // ==================================================
    // NENHUM RESULTADO
    // ==================================================
    if (!orcamentos || orcamentos.length === 0) {

        if (command.mostrar_filtros === true) {

            return `📄 Nenhum orçamento encontrado.

🔎 Filtros utilizados:
${formatFiltrosOrcamento(command)}`;
        }

        return "📄 Nenhum orçamento encontrado.";
    }
// ======================================================
// 📊 RESUMO / RELATÓRIO
// ======================================================

if (command.resumo === true) {

    const relatorio =
        formatRelatorioOrcamentos(
            orcamentos,
            command.periodo_texto
        );

    let resposta = relatorio;

    if (command.mostrar_filtros === true) {

        resposta +=
            `\n\n🔎 Filtros utilizados:\n` +
            formatFiltrosOrcamento(command);
    }

    return resposta;
}

    // ==================================================
    // ENVIA OS ORÇAMENTOS
    // ==================================================
    function wait(ms) {
        return new Promise(resolve =>
            setTimeout(resolve, ms)
        );
    }

    for (let i = 0; i < orcamentos.length; i++) {

        const o = orcamentos[i];

        await sendWhatsAppRaw({
            messaging_product: "whatsapp",
            to: userPhone,
            type: "text",
            text: {
                body: formatOrcamento(o)
            },
        });

        if (i < orcamentos.length - 1) {

            const delay =
                1200 +
                Math.floor(Math.random() * 900);

            await wait(delay);
        }
    }

    // ==================================================
    // RESPOSTA FINAL
    // ==================================================
    let resposta =
        `✅ ${orcamentos.length} orçamento(s) enviado(s).`;

    if (command.periodo_texto) {

        resposta +=
            `\n📅 Período: ${command.periodo_texto}`;
    }

    if (command.mostrar_filtros === true) {

        resposta +=
            `\n\n🔎 Filtros utilizados:\n` +
            formatFiltrosOrcamento(command);
    }

    return resposta;
}

// ------------------- PDF -------------------
case "pdf": {
  try {
    if (!command.id)
      return "⚠️ É necessário informar o ID do orçamento para gerar o PDF.";

    const { data: orcamentos } = await supabase
      .from("orcamentos")
      .select("*")
      .eq("orcamento_numero", command.id)
      .eq("user_telefone", userPhone)
      .limit(1);

    if (!orcamentos?.length)
      return `⚠️ Orçamento ${command.id} não encontrado.`;

    const o = orcamentos[0];

    const { data: users } = await supabase
      .from("users")
      .select("*")
      .eq("telefone", userPhone)
      .limit(1);

    if (!users?.length)
      return "⚠️ Usuário não encontrado para gerar o PDF.";

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

    if (pdfConfig.tipo === "Recibo") {
      const valor = parseFloat(command.valorRecibo);
      pdfConfig.valorRecibo = !isNaN(valor) && valor > 0 ? valor : null;
    } else {
      pdfConfig.valorRecibo = null;
    }

    if (
      ["Recibo", "Nota de Serviço"].includes(pdfConfig.tipo) &&
      o.etapa?.toLowerCase() !== "finalizado"
    ) {
      await supabase
        .from("orcamentos")
        .update({ etapa: "finalizado" })
        .eq("orcamento_numero", command.id)
        .eq("user_telefone", userPhone);
    }

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