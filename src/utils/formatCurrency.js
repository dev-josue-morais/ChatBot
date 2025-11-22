function formatCurrency(value) {
  const val = Number(value) || 0;
  const formatted = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(val);

  if (val === 0) {
    return `<span style="color: red;">${formatted}</span>`;
  }

  return formatted;
}

module.exports = formatCurrency;