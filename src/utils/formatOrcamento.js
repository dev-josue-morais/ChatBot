const formatCurrency = require("./formatCurrency");
const aplicarDesconto = require("./aplicarDesconto");

function formatOrcamento(o) {
  const totalMateriais = (o.materiais || []).reduce((sum, m) => sum + (m.qtd || 0) * (m.valor || 0), 0);
  const totalServicos = (o.servicos || []).reduce((sum, s) => sum + (s.valor || 0), 0);

  const descontoMateriais = aplicarDesconto(totalMateriais, o.desconto_materiais);
  const descontoServicos = aplicarDesconto(totalServicos, o.desconto_servicos);

  const totalOriginal = totalMateriais + totalServicos;
  const totalFinal = descontoMateriais.totalFinal + descontoServicos.totalFinal;

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

💰 Total Materiais: ${descontoMateriais.descricao}

🔧 Serviços:
${(o.servicos && o.servicos.length > 0)
      ? o.servicos.map(s => `   - ${s.nome} (Valor: ${formatCurrency(s.valor)})`).join("\n")
      : "   Nenhum"}

💰 Total Serviços: ${descontoServicos.descricao}

🧾 Total Geral: ${totalFinal !== totalOriginal
      ? `~${formatCurrency(totalOriginal)}~ ${formatCurrency(totalFinal)}`
      : formatCurrency(totalFinal)}
`.trim();
}

module.exports = formatOrcamento;
