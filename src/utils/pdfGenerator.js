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

function renderServicos(servicos, opcoes) {
      if (!opcoes.listaServicos || !servicos?.length) return '';
    return `
    <table style="width:100%; border-collapse: collapse; border:2px solid #000; margin-top:15px;">
      <tr style="background-color:#e5e5e5;">
        <th style="border:2px solid #000; padding:8px; text-align:left;">Serviço</th>
        <th style="border:2px solid #000; padding:8px; text-align:left;">Quantidade</th>
        ${!opcoes.ocultarValorServicos ? `<th style="border:2px solid #000; padding:8px; text-align:left;">Preço</th><th style="border:2px solid #000; padding:8px; text-align:left;">Valor</th>` : ''}
      </tr>
      ${servicos.map(s => `
        <tr>
          <td style="border:2px solid #000; padding:8px;">${s.titulo}</td>
          <td style="border:2px solid #000; padding:8px;">${s.quantidade}</td>
          ${!opcoes.ocultarValorServicos ? `<td style="border:2px solid #000; padding:8px;">${formatCurrency(s.valor)}</td><td style="border:2px solid #000; padding:8px;">${formatCurrency(s.valor*s.quantidade)}</td>` : ''}
        </tr>
      `).join('')}
    </table>
    `;
}

function renderMateriais(materiais, opcoes) {
    if (!opcoes.listaMateriais || !materiais?.length) return '';
    return `
    <table style="width:100%; border-collapse: collapse; border:2px solid #000; margin-top:15px;">
      <tr style="background-color:#e5e5e5;">
        <th style="border:2px solid #000; padding:8px; text-align:left;">Material</th>
        <th style="border:2px solid #000; padding:8px; text-align:left;">Preço</th>
        <th style="border:2px solid #000; padding:8px; text-align:left;">Quantidade</th>
        <th style="border:2px solid #000; padding:8px; text-align:left;">Valor</th>
      </tr>
      ${materiais.map(m => `
        <tr>
          <td style="border:2px solid #000; padding:8px;">${m.nome}</td>
          <td style="border:2px solid #000; padding:8px;">${formatCurrency(m.valor)}</td>
          <td style="border:2px solid #000; padding:8px;">${m.qtd} (${m.unidade})</td>
          <td style="border:2px solid #000; padding:8px;">${formatCurrency(m.valor*m.qtd)}</td>
        </tr>
      `).join('')}
    </table>
    `;
}

function renderTotais(totalMateriais, totalServicos, descontoMateriais, descontoServicos, totalOriginal, totalFinal, opcoes, orcamento) {
    const materiaisHTML = (opcoes.listaMateriais && totalMateriais > 0) ? `
        <p style="margin:5px 0;"><strong>Total Materiais:</strong> ${
            descontoMateriais.totalFinal !== totalMateriais
                ? `<span style="text-decoration:line-through; color:red; margin-right:8px;">${formatCurrency(totalMateriais)}</span>
                   <span style="color:#007bff; margin:0 5px; font-weight:bold;">-${
                     typeof orcamento.desconto_materiais === "string" && orcamento.desconto_materiais.includes("%")
                     ? orcamento.desconto_materiais
                     : formatCurrency(orcamento.desconto_materiais || 0)
                   }</span>
                   <span style="color:green; font-weight:bold;">${formatCurrency(descontoMateriais.totalFinal)}</span>`
                : `<span style="color:green; font-weight:bold;">${formatCurrency(totalMateriais)}</span>`
        }</p>` : '';

    const servicosHTML = (opcoes.listaServicos && totalServicos > 0) ? `
        <p style="margin:5px 0;"><strong>Total Serviços:</strong> ${
            descontoServicos.totalFinal !== totalServicos
                ? `<span style="text-decoration:line-through; color:red; margin-right:8px;">${formatCurrency(totalServicos)}</span>
                   <span style="color:#007bff; margin:0 5px; font-weight:bold;">-${
                     typeof orcamento.desconto_servicos === "string" && orcamento.desconto_servicos.includes("%")
                     ? orcamento.desconto_servicos
                     : formatCurrency(orcamento.desconto_servicos || 0)
                   }</span>
                   <span style="color:green; font-weight:bold;">${formatCurrency(descontoServicos.totalFinal)}</span>`
                : `<span style="color:green; font-weight:bold;">${formatCurrency(totalServicos)}</span>`
        }</p>` : '';

    const totalHTML = `
        <p style="margin:5px 0;"><strong>Total Geral:</strong> ${
            totalFinal !== totalOriginal
                ? `<span style="text-decoration:line-through; color:red; margin-right:8px;">${formatCurrency(totalOriginal)}</span><span style="color:green; font-weight:bold;">${formatCurrency(totalFinal)}</span>`
                : `<span style="color:green; font-weight:bold;">${formatCurrency(totalFinal)}</span>`
        }</p>
    `;

    return `
    <div style="display:flex; justify-content:center; margin:20px 0;">
        <div style="width:100%; border:2px solid #000; background-color:#f9f9f9; padding:10px 15px; margin-top:10px; text-align:right; box-sizing:border-box;">
            ${materiaisHTML}
            ${servicosHTML}
            ${totalHTML}
        </div>
    </div>
    `;
}

function renderObservacoes(orcamento, opcoes) {
    if (!(opcoes.observacoes || opcoes.garantia || (orcamento.descricao_atividades?.trim()))) return '';
    const defaultObs = [
        opcoes.garantia ? "<strong>Garantia da mão de obra:</strong> 90 Dias" : null,
        "Todo o material é de responsabilidade do cliente.",
        "Em caso de atraso no pagamento, será aplicada multa de 2% sobre o valor total, mais juros de 1% ao mês."
    ].filter(Boolean);
    let gptObs = [];
    if (orcamento.descricao_atividades?.trim()) {
        try {
            const parsed = JSON.parse(orcamento.descricao_atividades);
            if (Array.isArray(parsed)) gptObs = parsed;
        } catch {
            gptObs = orcamento.descricao_atividades.split(/\n|;/).map(s => s.trim()).filter(Boolean);
        }
    }
    const allObs = [...defaultObs, ...gptObs];
    return `
    <div style="display:flex; justify-content:center; align-items:center; border:2px solid #000; padding:15px; flex-direction:column; margin-top:20px;">
        <h3 style="margin-bottom:10px; font-size:18px; color:#333;">Observações Importantes</h3>
        <ul style="margin:0; padding-left:20px;">
            ${allObs.map(obs => `<li>${obs}</li>`).join('')}
        </ul>
    </div>
`;}

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
            ? orcamento.materiais.reduce((sum, m) => sum + (m.qtd || 0) * (m.valor || 0), 0)
            : 0;

        const totalServicos = (opcoes.listaServicos && orcamento?.servicos?.length > 0)
            ? orcamento.servicos.reduce((sum, s) => sum + (s.quantidade || 0) * (s.valor || 0), 0)
            : 0;

        const descontoMateriais = aplicarDesconto(totalMateriais, orcamento.desconto_materiais);
        const descontoServicos = aplicarDesconto(totalServicos, orcamento.desconto_servicos);

        const totalOriginal = totalMateriais + totalServicos;
        const totalFinal = descontoMateriais.totalFinal + descontoServicos.totalFinal;

        const htmlContent = `
        <html>
        <body style="font-family:Arial, sans-serif; font-size:14px; margin:20px; color:#333; border:3px solid #000; padding:20px;">

        <!-- Cabeçalho -->
        <div style="display:flex; justify-content:space-between; align-items:center;  padding-bottom:10px; margin-bottom:20px;">
            <div style="display:flex; align-items:center; text-align:left; flex:1; gap:15px;">
                <img src="data:image/png;base64,${logoBase64}" alt="Logo" style="max-width:100px; height:auto;">
                <div style="display:flex; flex-direction:column;">
                    <h2>EletriCaldas Eletricista Residencial e Predial</h2>
                    <p><strong>CNPJ:</strong> 56.259.116/0001-02 | <strong>Tel:</strong> 64 99286 9608</p>
                    <p><strong>Cidade:</strong> Caldas Novas <strong>Estado:</strong> Goiás</p>
                    <p><strong>CEP:</strong> 75690-000</p>
                </div>
            </div>

            <div style="display:flex; flex-direction:column; align-items:flex-end; width:40%;">
                <div style="text-align:right; margin-bottom:10px;">
                    <h2>${documentoTipo}</h2>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <p><strong>Nº do Documento:</strong></p>
                            <p><strong>Data do Documento:</strong></p>
                        </div>
                        <div>
                            <p>${orcamento.orcamento_numero}</p>
                            <p>${formatarData(orcamento.criado_em)}</p>
                        </div>
                    </div>
                </div>

                <div style="text-align:right; margin-bottom:10px;">
                    <p><strong>Cliente:</strong> ${orcamento.nome_cliente}</p>
                    <p><strong>Tel:</strong> ${orcamento.telefone_cliente}</p>
                </div>
            </div>
        </div>

        ${renderServicos(orcamento.servicos, opcoes)}
        ${renderMateriais(orcamento.materiais, opcoes)}
        ${renderTotais(totalMateriais, totalServicos, descontoMateriais, descontoServicos, totalOriginal, totalFinal, opcoes, orcamento)}
${renderObservacoes(orcamento, opcoes)}
        <!-- PIX -->
        <div style="display:flex; justify-content:center; align-items:center; border:2px solid #000; padding:15px; flex-direction:column; margin-top:20px;">
            <div style="text-align:center;">
                <img src="data:image/jpeg;base64,${pixBase64}" alt="QR Code Pix" style="width:150px; height:150px;">
            </div>
            <div style="margin-right:5px; text-align:center;">
                <h1>Pague com Pix</h1>
                <h2><strong>Chave Pix Tel:</strong> 64992869608</h2>
                <h2><strong>Nome:</strong> Josué de Souza Morais</h2>
                <h2><strong>Instituição:</strong> Mercado Pago</h2>
            </div>
        </div>

        <!-- Assinaturas -->
        ${ (opcoes.assinaturaCliente || opcoes.assinaturaUser) ? `
            <div style="display:flex; justify-content:space-between; margin-top:50px;">
                ${opcoes.assinaturaUser ? `<div style="width:45%; text-align:center; border-top:2px solid #000; padding-top:5px; margin-top:40px;"><strong>EletriCaldas Eletricista Residencial</strong></div>` : ""}
                ${opcoes.assinaturaCliente ? `<div style="width:45%; text-align:center; border-top:2px solid #000; padding-top:5px; margin-top:40px;"><strong>Assinatura do Cliente</strong></div>` : ""}
            </div>` : ""}

        </body>
        </html>
        `;

        const pdfPath = `/tmp/orcamento_${orcamento.orcamento_numero}.pdf`;
        await pdf.generatePdf({ content: htmlContent }, { path: pdfPath });
        return pdfPath;

    } catch (err) {
        console.error("Erro ao gerar PDF:", err);
        throw err;
    }
}

module.exports = generatePDF;