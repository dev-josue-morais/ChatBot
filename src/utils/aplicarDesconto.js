const formatCurrency = require("./formatCurrency");

function aplicarDesconto(total, desconto) {
  if (!desconto) return { totalFinal: total, descricao: formatCurrency(total) };

  if (typeof desconto === "string" && desconto.trim().endsWith("%")) {
    const perc = parseFloat(desconto.replace("%", "").trim());
    if (isNaN(perc)) return { totalFinal: total, descricao: formatCurrency(total) };

    const valorComDesconto = total - (total * (perc / 100));
    return {
      totalFinal: valorComDesconto,
      descricao: `~${formatCurrency(total)}~ ${formatCurrency(valorComDesconto)} (-${perc}%)`
    };
  }

  const valor = parseFloat(desconto);
  if (isNaN(valor) || valor <= 0) return { totalFinal: total, descricao: formatCurrency(total) };

  const valorComDesconto = total - valor;
  return {
    totalFinal: valorComDesconto,
    descricao: `~${formatCurrency(total)}~ ${formatCurrency(valorComDesconto)} (-${formatCurrency(valor)})`
  };
}

module.exports = aplicarDesconto;
