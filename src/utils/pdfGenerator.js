const pdf = require('html-pdf-node');
const formatCurrency = require('./formatCurrency');
const { formatarData } = require('./utils');
const fs = require("fs");
const path = require("path");
const aplicarDesconto = require('./aplicarDesconto');

// Caminhos das imagens
const logoPath = path.join(__dirname, "../img/logo.png");
const pixPath = path.join(__dirname, "../img/QrCode.jpeg");

// Converte para Base64
const logoBase64 = fs.readFileSync(logoPath, { encoding: "base64" });
const pixBase64 = fs.readFileSync(pixPath, { encoding: "base64" });

async function generatePDF(orcamento, config = {}) {
    try {
        const { tipo = "Orçamento", opcoes: rawOpcoes = {} } = config;
        const opcoes = {
            listaServicos: true,
            listaMateriais: true,
            ocultarValorServicos: false,
            garantia: true,
            assinaturaCliente: false,
            assinaturaUser: false,
            observacoes: true,
            ...rawOpcoes
        };
        const documentoTipo = tipo || "Orçamento";
        const totalMateriais = (opcoes.listaMateriais && orcamento?.materiais?.length > 0)
            ? orcamento.materiais.reduce(
                (sum, m) => sum + (m.qtd || 0) * (m.valor || 0),
                0
            )
            : 0;

        const totalServicos = (opcoes.listaServicos && orcamento?.servicos?.length > 0)
            ? orcamento.servicos.reduce(
                (sum, s) => sum + (s.quantidade || 0) * (s.valor || 0),
                0
            )
            : 0;

        const descontoMateriais = aplicarDesconto(totalMateriais, orcamento.desconto_materiais);
        const descontoServicos = aplicarDesconto(totalServicos, orcamento.desconto_servicos);

        const totalOriginal = totalMateriais + totalServicos;
        const totalFinal = descontoMateriais.totalFinal + descontoServicos.totalFinal;
        const htmlContent = `
        <html>
<head>
  <style>
    @page { size: A4; margin: 10mm 5mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 14px; margin: 20px; color: #333; border: 3px solid #000; padding: 20px; }
    .old-price { text-decoration: line-through; color: red; margin-right: 8px; }
    .new-price { color: green; font-weight: bold; }
    .discount { color: #007bff; margin: 0 5px; font-weight: bold; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
    .header img { max-width: 120px; height: auto; }
    .company-info { display: flex; align-items: center; text-align: left; flex: 1; gap: 15px; }
    .company-info .logo { max-width: 100px; height: auto; }
    .company-details { display: flex; flex-direction: column; }
    .container { display: flex; flex-direction: column; align-items: flex-end; width: 40%; }
    .orcamento-info, .cliente-info { text-align: right; margin-bottom: 10px; }
    .row { display: flex; justify-content: space-between; align-items: center; }
    .table-container { width: 100%; border-collapse: collapse; border: 2px solid #000; margin-top: 15px; }
    th, td { border: 2px solid #000; padding: 8px; text-align: left; }
    th { background-color: #e5e5e5; }
    .containertotal { display: flex; justify-content: center; margin: 20px 0; }
    .totals { width: 100%; border: 2px solid #000; background-color: #f9f9f9; padding: 10px 15px; margin-top: 10px; text-align: right; box-sizing: border-box; }
    .totals p { margin: 5px 0; }
    .totals strong { font-weight: bold; color: #000; }
    .pix-container, .observacao { display: flex; justify-content: center; align-items: center; border: 2px solid #000; padding: 15px; flex-direction: column; }
    .pix-container { margin-top: 20px; }
    .pix { text-align: center; }
    .pix img { width: 150px; height: 150px; }
    .pixchave { margin-right: 5px; }
    .observacao h3 { margin-bottom: 10px; font-size: 18px; color: #333; }
    .observacao ul { margin: 0; padding-left: 20px; }
    .observacao li { margin-bottom: 5px; }
    .assinaturas { display: flex; justify-content: space-between; margin-top: 50px; }
    .assinaturas div { width: 45%; text-align: center; border-top: 2px solid #000; padding-top: 5px; margin-top: 40px; }
  </style>
</head>
        <body>
            <!-- Cabeçalho -->
            <div class="header">
                <div class="company-info">
                    <img src="data:image/png;base64,${logoBase64}" alt="Logo da Empresa" class="logo">
                    <div class="company-details">
                        <h2>EletriCaldas Eletricista Residencial e Predial</h2>
                        <p><strong>CNPJ:</strong> 56.259.116/0001-02 | <strong>Tel:</strong> 64 99286 9608</p>
                        <p><strong>Cidade:</strong> Caldas Novas <strong>Estado:</strong> Goiás</p>
                        <p><strong>CEP:</strong> 75690-000</p>
                    </div>
                </div>
                
                <div class="container">
                    <div class="orcamento-info">
                        <h2>${documentoTipo}</h2>
                        <div class="row">
                            <div class="document-info">
                                <p class="pixchave"><strong>Nº do Documento:</strong></p>
                                <p class="pixchave"><strong>Data do Documento:</strong></p>
                            </div>
                            <div class="document-dados">
                                <p>${orcamento.orcamento_numero}</p>
                                <p>${formatarData(orcamento.criado_em)}</p>
                            </div>
                        </div>
                    </div>
                
                    <div class="cliente-info">
                        <div class="row">
                            <div class="cliente-dados">
                                <p><strong>Cliente:</strong> ${orcamento.nome_cliente}</p>
                                <p><strong>Tel:</strong> ${orcamento.telefone_cliente}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
 <!-- Lista de Serviços -->
${
  (opcoes.listaServicos && orcamento?.servicos?.length > 0)
    ? `
    <table class="table-container">
      <tr>
        <th>Serviço</th>
        <th>Quantidade</th>
        ${!opcoes.ocultarValorServicos ? `<th>Preço</th><th>Valor</th>` : ""}
      </tr>
      ${orcamento.servicos.map(serv => `
        <tr>
          <td>${serv.titulo}</td>
          <td>${serv.quantidade}</td>
          ${
            !opcoes.ocultarValorServicos
              ? `<td>${formatCurrency(serv.valor)}</td>
                 <td>${formatCurrency(serv.valor * serv.quantidade)}</td>`
              : ""
          }
        </tr>
      `).join('')}
    </table>`
    : ''
}
            <!-- Lista de Materiais -->
            ${(opcoes.listaMateriais && orcamento?.materiais?.length > 0) ? `
            <table class="table-container">
                <tr>
                    <th>Material</th>
                    <th>Preço</th>
                    <th>Quantidade</th>
                    <th>Valor</th>
                </tr>
                ${orcamento.materiais.map(mat => `
                <tr>
                    <td>${mat.nome}</td>
                    <td>${formatCurrency(mat.valor)}</td>
                    <td>${mat.qtd} (${mat.unidade})</td>
                    <td>${formatCurrency(mat.valor * mat.qtd)}</td>
                </tr>
                `).join('')}
            </table>` : ''}
            ${(
  (opcoes.listaServicos && orcamento?.servicos?.length > 0) ||
  (opcoes.listaMateriais && orcamento?.materiais?.length > 0)
) ? `
  <div class="containertotal">
    <div class="totals">

      ${(opcoes.listaMateriais && orcamento?.materiais?.length > 0)
        ? `<p><strong>Total Materiais:</strong> ${
            descontoMateriais.totalFinal !== totalMateriais
              ? `<span class="old-price">${formatCurrency(totalMateriais)}</span> 
                 <span class="discount">-${
                   typeof orcamento.desconto_materiais === "string" && orcamento.desconto_materiais.includes("%")
                     ? orcamento.desconto_materiais
                     : formatCurrency(orcamento.desconto_materiais || 0)
                 }</span> 
                 <span class="new-price">${formatCurrency(descontoMateriais.totalFinal)}</span>`
              : `<span class="new-price">${formatCurrency(totalMateriais)}</span>`
          }</p>`
        : ''}

      ${(opcoes.listaServicos && orcamento?.servicos?.length > 0)
        ? `<p><strong>Total Serviços:</strong> ${
            descontoServicos.totalFinal !== totalServicos
              ? `<span class="old-price">${formatCurrency(totalServicos)}</span> 
                 <span class="discount">-${
                   typeof orcamento.desconto_servicos === "string" && orcamento.desconto_servicos.includes("%")
                     ? orcamento.desconto_servicos
                     : formatCurrency(orcamento.desconto_servicos || 0)
                 }</span> 
                 <span class="new-price">${formatCurrency(descontoServicos.totalFinal)}</span>`
              : `<span class="new-price">${formatCurrency(totalServicos)}</span>`
          }</p>`
        : ''}

      <p><strong>Total Geral:</strong> ${
        totalFinal !== totalOriginal
          ? `<span class="old-price">${formatCurrency(totalOriginal)}</span><span class="new-price">${formatCurrency(totalFinal)}</span>`
          : `<span class="new-price">${formatCurrency(totalFinal)}</span>`
      }</p>

    </div>
  </div>
` : ''}
<!-- Observações e Garantia -->
${
  (opcoes.observacoes || opcoes.garantia || (orcamento.descricao_atividades && orcamento.descricao_atividades.trim() !== ""))
    ? `
    <div class="observacao">
        <h3>Observações Importantes</h3>
        <ul>
            ${opcoes.garantia ? `<li><strong>Garantia da mão de obra:</strong> 90 Dias</li>` : ""}
            <li>Todo o material é de responsabilidade do cliente.</li>
            <li>Em caso de atraso no pagamento, será aplicada multa de 2% sobre o valor total, mais juros de 1% ao mês.</li>
            ${
              (orcamento.descricao_atividades && orcamento.descricao_atividades.trim() !== "")
                ? `<li>${orcamento.descricao_atividades}</li>`
                : ""
            }
        </ul>
    </div>
    `
    : ""
}
            <!-- PIX -->
            <div class="pix-container">
                <div class="pix">
                    <img src="data:image/jpeg;base64,${pixBase64}" alt="QR Code Pix">
                </div>
                <div class="pixchave">
                    <h1 class="center">Pague com Pix</h1>
                    <h2><strong>Chave Pix Tel:</strong> 64992869608</h2>
                    <h2><strong>Nome:</strong> Josué de Souza Morais</h2>
                    <h2><strong>Instituição:</strong> Mercado Pago</h2>
                </div>
            </div>
                
            <!-- Assinaturas -->
            ${(opcoes.assinaturaCliente || opcoes.assinaturaUser) ? `
            <div class="assinaturas">
                ${opcoes.assinaturaUser ? `<div><strong>EletriCaldas Eletricista Residencial</strong></div>` : ""}
                ${opcoes.assinaturaCliente ? `<div><strong>Assinatura do Cliente</strong></div>` : ""}
            </div>` : ''}
        </body>
        </html>`;

        const pdfPath = `/tmp/orcamento_${orcamento.orcamento_numero}.pdf`;
        await pdf.generatePdf({ content: htmlContent }, { path: pdfPath });
        return pdfPath;

    } catch (err) {
        console.error("Erro ao gerar PDF:", err);
        throw err;
    }
}

module.exports = generatePDF;
