const pdf = require('html-pdf-node');
const formatCurrency = require('./formatCurrency');
const { formatarData } = require('./utils');
const fs = require("fs");
const path = require("path");

// Caminhos das imagens
const logoPath = path.join(__dirname, "../img/logo.png");
const pixPath = path.join(__dirname, "../img/QrCode.jpeg");

// Converte para Base64
const logoBase64 = fs.readFileSync(logoPath, { encoding: "base64" });
const pixBase64 = fs.readFileSync(pixPath, { encoding: "base64" });

const totalMateriais = (orcamento.materiais || []).reduce(
    (sum, m) => sum + (m.qtd || 0) * (m.valor || 0),
    0
);
const totalServicos = (orcamento.servicos || []).reduce(
    (sum, s) => sum + (s.quantidade || 0) * (s.valor || 0),
    0
);

const descontoMateriais = aplicarDesconto(totalMateriais, orcamento.desconto_materiais);
const descontoServicos = aplicarDesconto(totalServicos, orcamento.desconto_servicos);

const totalOriginal = totalMateriais + totalServicos;
const totalFinal = descontoMateriais.totalFinal + descontoServicos.totalFinal;

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

        const htmlContent = `
    <html>
      <head>
          <style>
              @page {
                  size: A4;
                  margin: 10mm 5mm;
              }

              * {
                  margin: 0;
                  padding: 0;
                  box-sizing: border-box;
              }

              body {
                  font-family: Arial, sans-serif;
                  font-size: 14px;
                  margin: 20px;
                  color: #333;
                  border: 3px solid #000;
                  padding: 20px;
              }

              .header {
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  border-bottom: 2px solid #000;
                  padding-bottom: 10px;
                  margin-bottom: 20px;
              }

              .header img {
                  max-width: 120px;
                  height: auto;
              }

              .company-info {
                  text-align: left;
                  flex: 1;
              }

              .container {
                  display: flex;
                  flex-direction: column;
                  align-items: flex-end;
                  width: 40%;
              }

              .orcamento-info,
              .cliente-info {
                  text-align: right;
                  margin-bottom: 10px;
              }

              .row {
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
              }

              .table-container {
                  width: 100%;
                  border-collapse: collapse;
                  margin-top: 15px;
              }

              th,
              td {
                  border: 1px solid #000;
                  padding: 8px;
                  text-align: left;
              }

              th {
                  background-color: #e5e5e5;
              }

              .containertotal {
                  display: flex;
                  justify-content: flex-end;
                  margin-top: 15px;
              }

              .totals {
                  background-color: #f2f2f2;
                  padding: 10px;
                  text-align: right;
                  font-size: 16px;
              }

              .total {
                  background-color: #ddd;
                  font-weight: bold;
                  padding: 10px;
              }

              .flex-container {
                  display: flex;
                  justify-content: space-between;
                  align-items: flex-start;
                  gap: 20px;
                  margin-top: 20px;
              }

              .pixchave {
                  margin-right: 5px;
              }

              .pix-container,
              .observacao {
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  border: 2px solid #000;
                  padding: 15px;
              }

              .observacao h3 {
                  margin-bottom: 10px;
                  font-size: 18px;
                  color: #333;
              }

              .observacao ul {
                  margin: 0;
                  padding-left: 20px;
              }

              .observacao li {
                  margin-bottom: 5px;
              }

              .observacao {
                  flex-direction: column;
              }

              .pix {
                  text-align: center;
              }

              .pix img {
                  width: 150px;
                  height: 150px;
              }

              .company-info {
                  display: flex;
                  align-items: center;
                  /* Centraliza verticalmente */
                  gap: 15px;
                  /* Espaço entre logo e texto */
              }

              .company-info .logo {
                  max-width: 100px;
                  /* Ajuste o tamanho da logo */
                  height: auto;
              }

              .company-details {
                  display: flex;
                  flex-direction: column;
              }

              .assinaturas {
                  display: flex;
                  justify-content: space-between;
                  margin-top: 50px;
              }

              .assinaturas div {
                  width: 45%;
                  text-align: center;
                  border-top: 2px solid #000;
                  padding-top: 5px;
                  margin-top: 40px;
              }
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
        ${(opcoes.listaServicos && orcamento?.servicos?.length > 0) ? `
        <table class="table-container">
            <tr>
                <th>Serviço</th>
                ${!opcoes.ocultarValorServicos ? `<th>Preço</th>` : ""}
                <th>Quantidade</th>
                <th>Valor</th>
            </tr>
            ${orcamento.servicos.map(serv => `
            <tr>
                <td>${serv.titulo}</td>
                ${!opcoes.ocultarValorServicos ? `<td>${formatCurrency(serv.valor)}</td>` : ""}
                <td>${serv.quantidade}</td>
                <td>${formatCurrency(serv.valor * serv.quantidade)}</td>
            </tr>
            `).join('')}
        </table>` : ''}
            
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
            <div class="containertotal">
             <div class="totals">
                 ${opcoes.listaMateriais ? `<p><strong>Total Materiais:</strong> ${descontoMateriais.descricao}</p>` : ''}
                  ${opcoes.listaServicos ? `<p><strong>Total Serviços:</strong> ${descontoServicos.descricao}</p>` : ''}
                <p><strong>Total Geral:</strong> ${totalFinal !== totalOriginal
                ? `~${formatCurrency(totalOriginal)}~ ${formatCurrency(totalFinal)}`
                : formatCurrency(totalFinal)
            }</p>
             </div>
            </div>
        <!-- Observações e Garantia -->
        ${(opcoes.observacoes || opcoes.garantia) ? `
        <div class="observacao">
            ${opcoes.observacoes ? `
            <h3>Observações Importantes</h3>
            <ul>
            ${opcoes.garantia ? `<li><strong>Garantia da mão de obra:</strong> 90 Dias</li>` : ""}    
                <li>Todo o material é de responsabilidade do cliente.</li>
                <li>Em caso de atraso no pagamento, será aplicada multa de 2% sobre o valor total, mais juros de 1% ao mês.</li>
            </ul>` : ""}
        </div>` : ''}
            
        <!-- PIX -->
        <div class="pix-container"> 
            <div class="pix">
                <img src="data:image/jpeg;base64,${pixBase64}" alt="QR Code Pix">
            </div>             
            <div class="pixchave">
                <h3 class="center">Pague com Pix</h3>
                <p><strong>Chave Pix Tel:</strong> 64992869608</p>
                <p><strong>Nome:</strong> josue de Souza Morais</p>
                <p><strong>Instituição:</strong> Mercado Pago</p>
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
