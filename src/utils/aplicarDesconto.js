const formatCurrency = require("./formatCurrency");

function aplicarDesconto(total, desconto) {

  // 🔒 Proteção total
  if (!total || total <= 0) {
    return {
      totalFinal: 0,
      descontoAplicado: 0,
      descricao: formatCurrency(0)
    };
  }

  // 🔒 Sem desconto válido
  if (!desconto) {
    return {
      totalFinal: total,
      descontoAplicado: 0,
      descricao: formatCurrency(total)
    };
  }

  let descontoValor = 0;
  let descricao = formatCurrency(total);

  // 📊 Desconto em %
  if (typeof desconto === "string" && desconto.trim().endsWith("%")) {
    const perc = parseFloat(desconto.replace("%", "").trim());

    if (!isNaN(perc) && perc > 0) {
      descontoValor = (perc / 100) * total;

      const totalFinal = Math.max(0, total - descontoValor);

      descricao = `~${formatCurrency(total)}~ ${formatCurrency(totalFinal)} (-${perc}%)`;

      return {
        totalFinal,
        descontoAplicado: descontoValor,
        descricao
      };
    }

    // inválido → ignora
    return {
      totalFinal: total,
      descontoAplicado: 0,
      descricao
    };
  }

  // 💰 Desconto fixo
  const valor = Number(desconto);

  if (!isNaN(valor) && valor > 0) {
    descontoValor = valor;

    const totalFinal = Math.max(0, total - descontoValor);

    descricao = `~${formatCurrency(total)}~ ${formatCurrency(totalFinal)} (-${formatCurrency(valor)})`;

    return {
      totalFinal,
      descontoAplicado: descontoValor,
      descricao
    };
  }

  // inválido → ignora
  return {
    totalFinal: total,
    descontoAplicado: 0,
    descricao
  };
}

module.exports = aplicarDesconto;