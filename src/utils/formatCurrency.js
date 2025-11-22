function formatCurrency(value) {
  const val = Number(value) || 0;
  const formatted = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(val);

  return formatted;
}

module.exports = formatCurrency;