const { DateTime } = require('luxon');
const aplicarDesconto = require('./aplicarDesconto');
const formatCurrency = require('./formatCurrency');
const TIMEZONE = 'America/Sao_Paulo';

const TIPOS_DESPESA = [
    'conducao',
    'materiais',
    'alimentacao',
    'outras'
];

function getDateRange(startDate, endDate, zone = 'America/Sao_Paulo') {

    const startDT = DateTime
        .fromISO(startDate, { zone })
        .startOf('day');

    const endDT = DateTime
        .fromISO(endDate || startDate, { zone })
        .endOf('day');

    if (!startDT.isValid || !endDT.isValid) {

        return {
            valid: false,
            startDT,
            endDT
        };
    }

    return {
        valid: true,

        startDT,
        endDT,

        startIso: startDT
            .toUTC()
            .toISO(),

        endIso: endDT
            .toUTC()
            .toISO()
    };
}

function emojiTipo(tipo) {
    const emojis = {
        conducao: '🚗',
        materiais: '🔨',
        alimentacao: '🍽️',
        ferramentas: '🛠️',
        outras: '📦'
    };

    return emojis[tipo] || '📂';
}

function formatPeriodoTitulo(periodo) {
    if (!periodo) {
        return '';
    }

    const textos = {
        'este mês': 'Setembro/2026',
        'mês passado': 'Mês passado',
        'esta semana': 'Esta semana',
        'semana passada': 'Semana passada',
        'hoje': 'Hoje',
        'ontem': 'Ontem',
        'últimos 30 dias': 'Últimos 30 dias',
        'últimos 6 meses': 'Últimos 6 meses',
        'todo o período': 'Todo o período'
    };

    return textos[periodo] || periodo;
}

function formatDateBR(date) {
    if (!date) return '';

    return DateTime
        .fromISO(date, { zone: TIMEZONE })
        .setZone(TIMEZONE)
        .toFormat('dd/MM/yyyy HH:mm');
}

function nomeTipo(tipo) {
    const nomes = {
        conducao: 'Condução',
        materiais: 'Materiais',
        alimentacao: 'Alimentação',
        outras: 'Outras'
    };

    return nomes[tipo] || tipo;
}

// ======================================================
// ORÇAMENTOS
// ======================================================

function calcularTotalOrcamento(orcamento) {
    const totalMateriais = (orcamento.materiais || []).reduce(
        (sum, m) =>
            sum +
            (Number(m.qtd) || 0) *
            (Number(m.valor) || 0),
        0
    );

    const totalServicos = (orcamento.servicos || []).reduce(
        (sum, s) =>
            sum +
            (Number(s.quantidade) || 0) *
            (Number(s.valor) || 0),
        0
    );

    const descontoMateriais = aplicarDesconto(
        totalMateriais,
        orcamento.desconto_materiais
    );

    const descontoServicos = aplicarDesconto(
        totalServicos,
        orcamento.desconto_servicos
    );

    return (
        descontoMateriais.totalFinal +
        descontoServicos.totalFinal
    );
}

function formatRelatorioOrcamentos(orcamentos, periodoTexto) {
    const grupos = {
        negociacao: {
            quantidade: 0,
            valor: 0
        },

        aprovado: {
            quantidade: 0,
            valor: 0
        },

        perdido: {
            quantidade: 0,
            valor: 0
        },

        finalizado: {
            quantidade: 0,
            valor: 0
        }
    };

    for (const orcamento of orcamentos) {
        const etapa =
            String(orcamento.etapa || "negociacao")
                .trim()
                .toLowerCase();

        const valor =
            calcularTotalOrcamento(orcamento);

        if (
            etapa === "negociacao" ||
            etapa === "andamento"
        ) {
            grupos.negociacao.quantidade++;
            grupos.negociacao.valor += valor;
        }

        else if (etapa === "aprovado") {
            grupos.aprovado.quantidade++;
            grupos.aprovado.valor += valor;
        }

        else if (etapa === "perdido") {
            grupos.perdido.quantidade++;
            grupos.perdido.valor += valor;
        }

        else if (etapa === "finalizado") {
            grupos.finalizado.quantidade++;
            grupos.finalizado.valor += valor;
        }
    }

    const quantidadeTotal =
        grupos.negociacao.quantidade +
        grupos.aprovado.quantidade +
        grupos.perdido.quantidade +
        grupos.finalizado.quantidade;

    const valorTotal =
        grupos.negociacao.valor +
        grupos.aprovado.valor +
        grupos.finalizado.valor;

    const linha = "────────────────────────────";

    return [
        `📊 Orçamentos${periodoTexto ? ` — ${periodoTexto}` : ""}`,
        ``,

        `🟡 Em negociação: ${String(grupos.negociacao.quantidade).padStart(5, " ")}  ${formatCurrency(grupos.negociacao.valor)}`,

        `🟢 Aprovados:     ${String(grupos.aprovado.quantidade).padStart(5, " ")}  ${formatCurrency(grupos.aprovado.valor)}`,

        `🔴 Recusados:     ${String(grupos.perdido.quantidade).padStart(5, " ")}  ${formatCurrency(grupos.perdido.valor)}`,

        `⚪ Finalizados:    ${String(grupos.finalizado.quantidade).padStart(5, " ")}  ${formatCurrency(grupos.finalizado.valor)}`,

        linha,

        `📋 Total:         ${String(quantidadeTotal).padStart(5, " ")}`,

        `💰 Valor total:   ${formatCurrency(valorTotal)}`
    ].join("\n");
}

function formatFiltrosOrcamento(command) {
    const filtros = command.filtros || {};
    const usados = [];

    if (filtros.por_id === true) {
        usados.push(`🆔 ID: ${command.id}`);
    }

    if (filtros.por_nome_cliente === true) {
        usados.push(`👤 Cliente: ${command.nome_cliente}`);
    }

    if (filtros.por_telefone_cliente === true) {
        usados.push(`📞 Telefone: ${command.telefone_cliente}`);
    }

    if (filtros.por_etapa === true) {
        usados.push(`📌 Etapa: ${command.etapa}`);
    }

    if (filtros.por_periodo === true) {
        usados.push(
            `📅 Período: ${
                command.periodo_texto ||
                `${command.periodo_start} até ${command.periodo_end}`
            }`
        );
    } else if (command.periodo_texto === "todo o período") {
        usados.push(
            `📅 Período: todo o período (sem limite de data)`
        );
    }

    if (usados.length === 0) {
        return "Nenhum filtro específico.";
    }

    return usados.join("\n");
}

function normalizeMoney(value) {
    if (value === null || value === undefined) return 0;

    if (typeof value === "string" && value.includes("%")) {
        return value.replace(",", ".").trim();
    }

    if (typeof value === "number") return value;

    let str = String(value).trim();

    str = str.replace(/[^\d.,-]/g, "");

    const lastComma = str.lastIndexOf(",");
    const lastDot = str.lastIndexOf(".");

    if (lastComma > lastDot) {
        str = str.replace(/\./g, "").replace(",", ".");
    } else if (lastDot > lastComma) {
        str = str.replace(/,/g, "");
    }

    const parsed = parseFloat(str);

    return isNaN(parsed) ? 0 : parsed;
}
async function deleteOldEvents(supabase, userPhone) {
    try {
        const twoDaysAgo = DateTime.now()
            .setZone('America/Sao_Paulo')
            .minus({ days: 2 })
            .startOf('day')
            .toISO({ includeOffset: false });

        const { error } = await supabase
            .from('events')
            .delete()
            .lt('date', twoDaysAgo);

        if (error) {
            console.error('❌ Erro ao deletar eventos antigos:', error);
        }
    } catch (err) {
        console.error('❌ Erro interno ao deletar eventos antigos:', err);
    }
}

function getContextWords(text) {

  const words = text.trim().split(/\s+/);

  if (words.length <= 30) {
    return words.join(' ');
  }

  const first = words.slice(0, 20);
  const last = words.slice(-10);

  return [...first, ...last].join(' ');
}
// ======================================================
// EXPORTS
// ======================================================

module.exports = {
    TIMEZONE,
    TIPOS_DESPESA,

    emojiTipo,
    formatPeriodoTitulo,
    formatDateBR,
    nomeTipo,

    calcularTotalOrcamento,
    formatRelatorioOrcamentos,
    formatFiltrosOrcamento,
    normalizeMoney,

    deleteOldEvents,
    getDateRange,
    getContextWords
};