const formatCurrency = require("./formatCurrency");
const aplicarDesconto = require("./aplicarDesconto");

// Formata para dd/mm/aaaa
function formatDateBR(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);

  if (isNaN(d.getTime())) return "";

  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();

  return `${day}/${month}/${year}`;
}

// Calcula quantos dias atrás
function diffDaysFromNow(dateStr) {
  if (!dateStr) return null;

  const final = new Date(dateStr);
  const now = new Date();

  if (isNaN(final.getTime())) return null;

  const diffMs = now - final;

  return Math.floor(
    diffMs / (1000 * 60 * 60 * 24)
  );
}


// ================================================================
// FORMATA OBSERVAÇÃO DO ITEM
// ================================================================

function formatObservacaoItem(item) {

  if (!item || typeof item !== "object") {
    return "";
  }

  /*
   * A propriedade nova será:
   *
   * observacao
   *
   * Mas mantemos compatibilidade caso algum registro futuro
   * ou antigo utilize observação em outro nome.
   */

  const observacao =
    item.observacao ??
    item.obs ??
    item.observações ??
    item.observacoes ??
    null;


  if (
    observacao === null ||
    observacao === undefined
  ) {
    return "";
  }


  const texto =
    String(observacao)
      .trim();


  if (!texto) {
    return "";
  }


  return `\n      📝 Obs: ${texto}`;
}


function formatOrcamento(o) {

  /*
   * Proteção geral:
   * caso o orçamento venha nulo ou em formato inesperado,
   * evita que a função quebre o processamento.
   */

  if (!o || typeof o !== "object") {
    return "⚠️ Não foi possível formatar este orçamento.";
  }


  const materiais =
    Array.isArray(o.materiais)
      ? o.materiais
      : [];


  const servicos =
    Array.isArray(o.servicos)
      ? o.servicos
      : [];


  const totalMateriais =
    materiais.reduce(
      (sum, m) => {

        if (!m || typeof m !== "object") {
          return sum;
        }

        return (
          sum +
          (Number(m.qtd) || 0) *
          (Number(m.valor) || 0)
        );
      },
      0
    );


  const totalServicos =
    servicos.reduce(
      (sum, s) => {

        if (!s || typeof s !== "object") {
          return sum;
        }

        return (
          sum +
          (Number(s.quantidade) || 0) *
          (Number(s.valor) || 0)
        );
      },
      0
    );


  const descontoMateriais =
    aplicarDesconto(
      totalMateriais,
      o.desconto_materiais
    );


  const descontoServicos =
    aplicarDesconto(
      totalServicos,
      o.desconto_servicos
    );


  const totalOriginal =
    totalMateriais +
    totalServicos;


  const totalFinal =
    descontoMateriais.totalFinal +
    descontoServicos.totalFinal;


  // ==============================================================
  // OBSERVAÇÕES GERAIS
  // ==============================================================

  const observacoes =
    Array.isArray(o.observacoes) &&
    o.observacoes.length > 0
      ? o.observacoes
          .filter(
            obs =>
              obs !== null &&
              obs !== undefined &&
              String(obs).trim() !== ""
          )
          .map(
            (obs, i) =>
              `   ${i + 1}. ${obs}`
          )
          .join("\n")
      : null;


  // ==============================================================
  // DESCRIÇÕES
  // ==============================================================

  function formatDescricaoWhatsApp(html) {

    if (!html) return "";


    return String(html)

      // Converte <br> em quebra de linha
      .replace(
        /<br\s*\/?>/gi,
        "\n"
      )

      // Converte <strong>...</strong>
      // em negrito do WhatsApp
      .replace(
        /<strong>(.*?)<\/strong>/gi,
        "*$1*"
      )

      // Remove outras tags HTML
      .replace(
        /<[^>]*>/g,
        ""
      )

      // Decodifica entidades HTML comuns
      .replace(
        /&nbsp;/gi,
        " "
      )
      .replace(
        /&amp;/gi,
        "&"
      )
      .replace(
        /&lt;/gi,
        "<"
      )
      .replace(
        /&gt;/gi,
        ">"
      )
      .replace(
        /&quot;/gi,
        '"'
      )

      // Evita excesso de linhas vazias
      .replace(
        /\n{3,}/g,
        "\n\n"
      )

      .trim();
  }


  const descricoes =
    Array.isArray(o.descricoes) &&
    o.descricoes.length > 0
      ? o.descricoes
          .map(d =>
            formatDescricaoWhatsApp(d)
          )
          .filter(Boolean)
          .join("\n\n")
      : null;


  // ==============================================================
  // ETAPA
  // ==============================================================

  const etapaMap = {

    negociacao: {
      emoji: "🟡",
      nome: "Em negociação"
    },

    andamento: {
      emoji: "🔵",
      nome: "Em execução"
    },

    aprovado: {
      emoji: "✅",
      nome: "Aprovado"
    },

    perdido: {
      emoji: "❌",
      nome: "Perdido"
    },

    finalizado: {
      emoji: "🟢",
      nome: "Finalizado"
    }

  };


  const etapaKey =
    String(
      o.etapa || "negociacao"
    ).toLowerCase();


  const etapa =
    etapaMap[etapaKey] ||
    etapaMap.negociacao;


  // ==============================================================
  // DATA FINALIZADO
  // ==============================================================

  let dataFinalizado = "";
  let garantiaMensagem = "";


  if (
    etapaKey === "finalizado" &&
    o.finalizado_em
  ) {

    const dias =
      diffDaysFromNow(
        o.finalizado_em
      );


    const data =
      formatDateBR(
        o.finalizado_em
      );


    if (dias !== null) {

      dataFinalizado =
        `📅 Finalizado há ${dias} dia${dias === 1 ? "" : "s"} (${data})`;


      // ==========================================================
      // GARANTIA
      // ==========================================================

      const garantiaDias = 90;


      if (dias < garantiaDias) {

        const restam =
          garantiaDias - dias;

        garantiaMensagem =
          `🟩 Garantia válida — ⌛ ${restam} dias restantes`;

      } else {

        const expirou =
          dias - garantiaDias;

        garantiaMensagem =
          `🟥 Garantia expirada há ${expirou} dias`;
      }
    }
  }


  // ==============================================================
  // SERVIÇOS
  // ==============================================================

  const linhasServicos =
    servicos.length > 0

      ? servicos
          .map((s) => {

            if (!s || typeof s !== "object") {
              return "";
            }


            const quantidade =
              Number(
                s.quantidade
              ) || 0;


            const valor =
              Number(
                s.valor
              ) || 0;


            const total =
              quantidade *
              valor;


            const titulo =
              s.titulo ??
              s.nome ??
              "Serviço";


            const observacao =
              formatObservacaoItem(s);


            return (
              `   - *${titulo}* ` +
              `(Qtd: ${quantidade}, ` +
              `Unit: ${formatCurrency(valor)}, ` +
              `Total: ${formatCurrency(total)})` +
              observacao
            );
          })
          .filter(Boolean)
          .join("\n")

      : "   Nenhum";


  // ==============================================================
  // MATERIAIS
  // ==============================================================

  const linhasMateriais =
    materiais.length > 0

      ? materiais
          .map((m) => {

            if (!m || typeof m !== "object") {
              return "";
            }


            const quantidade =
              Number(
                m.qtd
              ) || 0;


            const valor =
              Number(
                m.valor
              ) || 0;


            const total =
              quantidade *
              valor;


            const nome =
              m.nome ??
              m.titulo ??
              "Material";


            const unidade =
              m.unidade
                ? ` ${m.unidade}`
                : "";


            const observacao =
              formatObservacaoItem(m);


            return (
              `   - *${nome}* ` +
              `(Qtd: ${quantidade}${unidade}, ` +
              `Unit: ${formatCurrency(valor)}, ` +
              `Total: ${formatCurrency(total)})` +
              observacao
            );
          })
          .filter(Boolean)
          .join("\n")

      : "   Nenhum";


  // ==============================================================
  // LINHAS FINAIS
  // ==============================================================

  const linhas = [

    `📝 Orçamento *${o.orcamento_numero || ""}*`,

    `👤 Cliente: *${o.nome_cliente || ""}*`,

    `📞 Telefone: *${o.telefone_cliente || ""}*`,

    `📌 Etapa: *${etapa.emoji} ${etapa.nome}*`,

    dataFinalizado,

    garantiaMensagem,

    observacoes
      ? `📌 Observações:\n${observacoes}`
      : "",

    descricoes
      ? `🗂️ Descrição de atividades:\n${descricoes}`
      : "",

    "",

    `🔧 Serviços:`,

    linhasServicos,

    "",

    `💰 Total Serviços: ${descontoServicos.descricao}`,

    "",

    `📦 Materiais:`,

    linhasMateriais,

    "",

    `💰 Total Materiais: ${descontoMateriais.descricao}`,

    "",

    *`🧾 Total Geral: ${
      totalFinal !== totalOriginal
        ? `~${formatCurrency(totalOriginal)}~ ${formatCurrency(totalFinal)}`
        : formatCurrency(totalFinal)
    }`*

  ];


  return linhas

    .filter(
      (line, i, arr) =>
        line !== "" ||
        arr[i - 1] !== ""
    )

    .join("\n");
}


module.exports = formatOrcamento;