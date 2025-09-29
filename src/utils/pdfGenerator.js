const pdf = require('html-pdf-node');
const formatCurrency = require('./formatCurrency');

async function generatePDF(o) {
  try {
    const htmlContent = `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; font-size: 14px; }
          h1 { text-align: center; margin-bottom: 5px; }
          h2 { margin-top: 30px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #ccc; padding: 6px; text-align: left; }
          th { background: #f4f4f4; }
          .right { text-align: right; }
          .total { font-weight: bold; background: #f9f9f9; }
          .discount { color: red; text-decoration: line-through; }
        </style>
      </head>
      <body>
        <h1>Orçamento ${o.orcamento_numero}</h1>
        <p><b>Cliente:</b> ${o.nome_cliente}</p>
        <p><b>Telefone:</b> ${o.telefone_cliente}</p>
        <p><b>Observações:</b> ${o.descricao_atividades || '-'}</p>

        <h2>Materiais</h2>
        <table>
          <tr>
            <th>Nome</th><th>Qtd</th><th>Unidade</th>
            <th class="right">Valor</th><th class="right">Total</th>
          </tr>
          ${(o.materiais && o.materiais.length > 0)
        ? o.materiais.map(m => {
          const subtotal = m.qtd * m.valor;
          return `
                    <tr>
                      <td>${m.nome}</td>
                      <td>${m.qtd}</td>
                      <td>${m.unidade || ''}</td>
                      <td class="right">${formatCurrency(m.valor)}</td>
                      <td class="right">${formatCurrency(subtotal)}</td>
                    </tr>
                  `;
        }).join("")
        : `<tr><td colspan="5">Nenhum material informado</td></tr>`
      }
        </table>

        <h2>Serviços</h2>
        <table>
          <tr>
            <th>Descrição</th><th class="right">Valor</th>
          </tr>
          ${(o.servicos && o.servicos.length > 0)
        ? o.servicos.map(s => `
                <tr>
                  <td>${s.nome}</td>
                  <td class="right">${formatCurrency(s.valor)}</td>
                </tr>
              `).join("")
        : `<tr><td colspan="2">Nenhum serviço informado</td></tr>`
      }
        </table>

        <h2>Total</h2>
        <table>
          <tr>
            <td>Materiais</td>
            <td class="right">
              ${formatCurrency((o.materiais || []).reduce((t, m) => t + m.qtd * m.valor, 0))}
              ${o.desconto_materiais ? `<span class="discount">${formatCurrency(o.desconto_materiais)}</span>` : ""}
            </td>
          </tr>
          <tr>
            <td>Serviços</td>
            <td class="right">
              ${formatCurrency((o.servicos || []).reduce((t, s) => t + s.valor, 0))}
              ${o.desconto_servicos ? `<span class="discount">${formatCurrency(o.desconto_servicos)}</span>` : ""}
            </td>
          </tr>
          <tr class="total">
            <td>Total Geral</td>
            <td class="right">${formatCurrency(
        ((o.materiais || []).reduce((t, m) => t + m.qtd * m.valor, 0) - (o.desconto_materiais || 0)) +
        ((o.servicos || []).reduce((t, s) => t + s.valor, 0) - (o.desconto_servicos || 0))
      )}</td>
          </tr>
        </table>
      </body>
    </html>
    `;

    const pdfPath = `/tmp/orcamento_${o.orcamento_numero}.pdf`;

    const file = { content: htmlContent };
    await pdf.generatePdf(file, { path: pdfPath });

    return pdfPath;
  } catch (err) {
    console.error("Erro ao gerar PDF:", err);
    throw err;
  }
}

module.exports = generatePDF;
