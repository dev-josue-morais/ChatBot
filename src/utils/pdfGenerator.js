const pdf = require('html-pdf-node');
const formatCurrency = require('./formatCurrency');
const { formatarData } = require('./utils');
const aplicarDesconto = require('./aplicarDesconto');
const axios = require("axios");
const { DateTime } = require("luxon");
const dataAtual = DateTime.now().setZone("America/Sao_Paulo");

let valorReciboFinal;
if (documentoTipo === "Recibo") {
    if (valorRecibo && valorRecibo > 0) {
        valorReciboFinal = valorRecibo;
    } else {
        valorReciboFinal = descontoServicos.totalFinal;
    }
}
const blocoPagamento = documentoTipo === "Recibo"
    ? `
    <div style="border:2px solid #000; padding:20px; margin-top:20px; text-align:center; page-break-inside:avoid;">
        <h2 style="margin-bottom:10px;">RECIBO</h2>
        <p style="font-size:16px; line-height:1.5;">
            Recebemos de <strong>${orcamento.nome_cliente}</strong> a importância de 
            <strong>${formatCurrency(valorReciboFinal)}</strong>
            (${valorRecibo && valorRecibo > 0 ? "valor total do recibo" : "valor referente aos serviços"}),
            referente aos serviços descritos acima.
        </p>
        <p style="margin-top:20px;">${user.cidade || ""}, ${dataAtual.toFormat("dd/MM/yyyy")}</p>
        <div style="margin-top:50px; border-top:2px solid #000; width:60%; margin-left:auto; margin-right:auto; padding-top:5px; text-align:center;">
            <strong>${user.assinatura || user.empresa_nome || "Assinatura do Responsável"}</strong>
        </div>
    </div>`
    : `
    <div style="display:flex; justify-content:center; align-items:center; border:2px solid #000; padding:15px; flex-direction:row; margin-top:20px; gap:20px; page-break-inside:avoid;">
        ${pixBase64 ? `<div style="text-align:center;"><img src="data:image/jpeg;base64,${pixBase64}" alt="QR Code Pix" style="width:150px; height:150px;"></div>` : ""}
        <div style="text-align:left;">
            <h1 style="margin:0;">Pague com Pix</h1>
            <h2 style="margin:5px 0;"><strong>Chave Pix:</strong> ${user.pix_chave || "-"}</h2>
            <h2 style="margin:5px 0;"><strong>Nome:</strong> ${user.pix_nome || "-"}</h2>
            <h2 style="margin:5px 0;"><strong>Instituição:</strong> ${user.pix_banco || "-"}</h2>
        </div>
    </div>
    ${ (opcoes.assinaturaCliente || opcoes.assinaturaEmpresa) ? `
        <div style="display:flex; justify-content:space-between; margin-top:50px;">
            ${opcoes.assinaturaEmpresa ? `<div style="width:45%; text-align:center; border-top:2px solid #000; padding-top:5px; margin-top:40px;"><strong>${user.assinatura || user.empresa_nome || "Sua Empresa"}</strong></div>` : ""}
            ${opcoes.assinaturaCliente ? `<div style="width:45%; text-align:center; border-top:2px solid #000; padding-top:5px; margin-top:40px;"><strong>Assinatura do Cliente</strong></div>` : ""}
        </div>` : ""}
    `;

async function getBase64FromUrl(url) {
    try {
        if (!url) return null;
        const response = await axios.get(url, { responseType: "arraybuffer" });
        return Buffer.from(response.data).toString("base64");
    } catch (err) {
        console.error("Erro ao converter imagem para base64:", err.message);
        return null;
    }
}

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
          ${!opcoes.ocultarValorServicos ? `<td style="border:2px solid #000; padding:8px;">${formatCurrency(s.valor)}</td><td style="border:2px solid #000; padding:8px;">${formatCurrency(s.valor * s.quantidade)}</td>` : ''}
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
          <td style="border:2px solid #000; padding:8px;">${formatCurrency(m.valor * m.qtd)}</td>
        </tr>
      `).join('')}
    </table>
    `;
}

function renderTotais(totalMateriais, totalServicos, descontoMateriais, descontoServicos, totalOriginal, totalFinal, opcoes, orcamento) {
    const materiaisHTML = (opcoes.listaMateriais && totalMateriais > 0) ? `
        <p style="margin:5px 0;"><strong>Total Materiais:</strong> ${descontoMateriais.totalFinal !== totalMateriais
            ? `<span style="text-decoration:line-through; color:red; margin-right:8px;">${formatCurrency(totalMateriais)}</span>
                   <span style="color:#007bff; margin:0 5px; font-weight:bold;">-${typeof orcamento.desconto_materiais === "string" && orcamento.desconto_materiais.includes("%")
                ? orcamento.desconto_materiais
                : formatCurrency(orcamento.desconto_materiais || 0)
            }</span>
                   <span style="color:green; font-weight:bold;">${formatCurrency(descontoMateriais.totalFinal)}</span>`
            : `<span style="color:green; font-weight:bold;">${formatCurrency(totalMateriais)}</span>`
        }</p>` : '';

    const servicosHTML = (opcoes.listaServicos && totalServicos > 0) ? `
        <p style="margin:5px 0;"><strong>Total Serviços:</strong> ${descontoServicos.totalFinal !== totalServicos
            ? `<span style="text-decoration:line-through; color:red; margin-right:8px;">${formatCurrency(totalServicos)}</span>
                   <span style="color:#007bff; margin:0 5px; font-weight:bold;">-${typeof orcamento.desconto_servicos === "string" && orcamento.desconto_servicos.includes("%")
                ? orcamento.desconto_servicos
                : formatCurrency(orcamento.desconto_servicos || 0)
            }</span>
                   <span style="color:green; font-weight:bold;">${formatCurrency(descontoServicos.totalFinal)}</span>`
            : `<span style="color:green; font-weight:bold;">${formatCurrency(totalServicos)}</span>`
        }</p>` : '';

    const totalHTML = `
        <p style="margin:5px 0;"><strong>Total Geral:</strong> ${totalFinal !== totalOriginal
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

function renderObservacoes(orcamento, opcoes, tipo) {
    if (!(opcoes.observacoes || opcoes.garantia || (Array.isArray(orcamento.observacoes) && orcamento.observacoes.length)))
        return '';

    const defaultObs = [
        opcoes.garantia ? "<strong>Garantia da mão de obra:</strong> 90 Dias" : null,
        "Todo o material é de responsabilidade do cliente.",
        "Em caso de atraso no pagamento, será aplicada multa de 2% sobre o valor total, mais juros de 1% ao mês."
    ].filter(Boolean);

    // ✅ Se o tipo for "Orçamento", adiciona a observação extra
   if (tipo === "Orçamento") {
    defaultObs.push("Validade do orçamento 7 dias.");
    defaultObs.push("Qualquer mudança nos serviços ou materiais pode alterar o valor final do orçamento, para mais ou para menos.");
}

    const gptObs = Array.isArray(orcamento.observacoes)
        ? orcamento.observacoes.filter(Boolean)
        : [];

    const allObs = [...defaultObs, ...gptObs];

    return `
    <div style="display:flex; justify-content:center; align-items:center; border:2px solid #000; padding:15px; flex-direction:column; margin-top:20px;">
        <h3 style="margin-bottom:10px; font-size:18px; color:#333;">Observações Importantes</h3>
        <ul style="margin:0; padding-left:20px;">
            ${allObs.map(obs => `<li>${obs}</li>`).join('')}
        </ul>
    </div>
    `;
}

async function generatePDF(orcamento, user, config = {}) {
    try {
        const { tipo = "Orçamento", opcoes: rawOpcoes = {}, valorRecibo = null } = config;
        const opcoes = {
            listaServicos: true,
            listaMateriais: true,
            ocultarValorServicos: false,
            garantia: true,
            assinaturaCliente: false,
            assinaturaEmpresa: false,
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

const logoBase64 = await getBase64FromUrl(user.logo_url);
const pixBase64 = await getBase64FromUrl(user.pix_img_url);

        const htmlContent = `
        <html>
        <body style="font-family:Arial, sans-serif; font-size:14px; margin:20px; color:#333; border:3px solid #000; padding:20px;">

<!-- Cabeçalho -->
<div style="display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:5px; margin-bottom:5px;">
    <div style="display:flex; align-items:flex-start; text-align:left; flex:1; gap:8px;">
        ${logoBase64 ? `<img src="data:image/png;base64,${logoBase64}" alt="Logo" style="max-width:90px; height:auto;">` : ""}
        <div style="display:flex; flex-direction:column; line-height:1.2;">
            <h2 style="margin:0; font-size:18px;">${user.empresa_nome || "Sua Empresa"}</h2>
            <p style="margin:2px 0;"><strong>${user.tipo_doc || "CNPJ"}:</strong> ${user.numero_doc || "-"} | <strong>Tel:</strong> ${user.empresa_telefone || "-"}</p>
            <p style="margin:2px 0;"><strong>Cidade:</strong> ${user.cidade || "-"} <strong>Estado:</strong> ${user.estado || "-"}</p>
            <p style="margin:2px 0;"><strong>CEP:</strong> ${user.cep || "-"}</p>
        </div>
    </div>

    <div style="display:flex; flex-direction:column; align-items:flex-end; width:40%; line-height:1.2;">
        <div style="text-align:right; margin-bottom:4px;">
            <h2 style="margin:0; font-size:18px;">${documentoTipo}</h2>
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
                <div style="text-align:right;">
                    <p style="margin:2px 0;"><strong>Nº do Documento:</strong></p>
                    <p style="margin:2px 0;"><strong>Data do Documento:</strong></p>
                </div>
                <div style="text-align:right;">
                    <p style="margin:2px 0;">${orcamento.orcamento_numero}</p>
                    <p style="margin:2px 0;">${formatarData(orcamento.criado_em)}</p>
                </div>
            </div>
        </div>

        <div style="text-align:right;">
            <p style="margin:2px 0;"><strong>Cliente:</strong> ${orcamento.nome_cliente}</p>
            <p style="margin:2px 0;"><strong>Tel:</strong> ${orcamento.telefone_cliente}</p>
        </div>
    </div>
</div>
        ${renderServicos(orcamento.servicos, opcoes)}
        ${renderMateriais(orcamento.materiais, opcoes)}
        ${renderTotais(totalMateriais, totalServicos, descontoMateriais, descontoServicos, totalOriginal, totalFinal, opcoes, orcamento)}
        ${renderObservacoes(orcamento, opcoes, tipo)}
        ${blocoPagamento}
        </body>
        </html>
        `;

const tipoSlug = (documentoTipo || "Orçamento")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/\s+/g, "_")
  .replace(/[^a-zA-Z0-9_-]/g, "");

const pdfPath = `/tmp/${tipoSlug}_${orcamento.orcamento_numero || "sem_numero"}.pdf`;
        await pdf.generatePdf({ content: htmlContent }, { path: pdfPath });
        return pdfPath;

    } catch (err) {
        console.error("Erro ao gerar PDF:", err);
        throw err;
    }
}

module.exports = generatePDF;