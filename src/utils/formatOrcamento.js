const formatCurrency = require("./formatCurrency");
const aplicarDesconto = require("./aplicarDesconto");

// Formata para dd/mm/aaaa
function formatDateBR(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
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
  const diffMs = now - final;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function formatOrcamento(o) {
  const totalMateriais = (o.materiais || []).reduce(
    (sum, m) => sum + (m.qtd || 0) * (m.valor || 0),
    0
  );
  const totalServicos = (o.servicos || []).reduce(
    (sum, s) => sum + (s.quantidade || 0) * (s.valor || 0),
    0
  );

  const descontoMateriais = aplicarDesconto(totalMateriais, o.desconto_materiais);
  const descontoServicos = aplicarDesconto(totalServicos, o.desconto_servicos);

  const totalOriginal = totalMateriais + totalServicos;
  const totalFinal = descontoMateriais.totalFinal + descontoServicos.totalFinal;

  // Observações
  const observacoes =
    Array.isArray(o.observacoes) && o.observacoes.length > 0
      ? o.observacoes.map((obs, i) => `   ${i + 1}. ${obs}`).join("\n")
      : null;

  // Descrições
  const descricoes =
    Array.isArray(o.descricoes) && o.descricoes.length > 0
      ? o.descricoes.map((d, i) => `   ${i + 1}. ${d}`).join("\n")
      : null;

  // Mapeamento de etapas
  const etapaMap = {
    negociacao: { emoji: "🟡", nome: "Em negociação" },
    andamento: { emoji: "🔵", nome: "Em execução" },
    aprovado: { emoji: "✅", nome: "Aprovado" },
    perdido: { emoji: "❌", nome: "Perdido" },
    finalizado: { emoji: "🟢", nome: "Finalizado" }
  };

  const etapaKey = (o.etapa || "negociacao").toLowerCase();
  const etapa = etapaMap[etapaKey] || etapaMap.negociacao;

  // Data finalizado + dias
  let dataFinalizado = "";
  if (etapaKey === "finalizado" && o.finalizado_em) {
    const dias = diffDaysFromNow(o.finalizado_em);
    const data = formatDateBR(o.finalizado_em);
    dataFinalizado = `📅 Finalizado há ${dias} dia${dias === 1 ? "" : "s"} (${data})`;
  }

  // ---------- AQUI COMEÇA A MÁGICA ----------
  const linhas = [
    `📝 Orçamento ${o.orcamento_numero}`,
    `👤 Cliente: ${o.nome_cliente}`,
    `📞 Telefone: ${o.telefone_cliente}`,
    `📌 Etapa: ${etapa.emoji} ${etapa.nome}`,
    dataFinalizado,
    observacoes ? `📌 Observações:\n${observacoes}` : "",
    descricoes ? `🗂️ Descrição de atividades:\n${descricoes}` : "",
    `🔧 Serviços:`,
    (o.servicos && o.servicos.length > 0)
      ? o.servicos
          .map((s) => {
            const total = (s.quantidade || 0) * (s.valor || 0);
            return `   - ${s.titulo} (Qtd: ${s.quantidade}, Unit: ${formatCurrency(s.valor)}, Total: ${formatCurrency(total)})`;
          })
          .join("\n")
      : "   Nenhum",
    ``,
    `💰 Total Serviços: ${descontoServicos.descricao}`,
    ``,
    `📦 Materiais:`,
    (o.materiais && o.materiais.length > 0)
      ? o.materiais
          .map((m) => {
            const total = (m.qtd || 0) * (m.valor || 0);
            return `   - ${m.nome} (Qtd: ${m.qtd} ${m.unidade || ''}, Unit: ${formatCurrency(m.valor)}, Total: ${formatCurrency(total)})`;
          })
          .join("\n")
      : "   Nenhum",
    ``,
    `💰 Total Materiais: ${descontoMateriais.descricao}`,
    ``,
    `🧾 Total Geral: ${
      totalFinal !== totalOriginal
        ? `~${formatCurrency(totalOriginal)}~ ${formatCurrency(totalFinal)}`
        : formatCurrency(totalFinal)
    }`
  ];

  // Remove linhas vazias consecutivas e trim final
  return linhas.filter(l => l !== "").join("\n");
}

module.exports = formatOrcamento;