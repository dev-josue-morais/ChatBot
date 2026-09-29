const supabase = require('../services/supabase');
const { sendPDFOrcamento } = require('../services/whatsappService');

function getPdfPrompt(modulo, userMessage, nowWithWeekday) {

  if (modulo !== 'orcamento') {
    return null;
  }

  return `
Você é um assistente que gera PDFs.

Responda somente com JSON válido:

{
  "modulo": "orcamento",
  "action": "pdf",
  "id": número,
  "tipo": "Orçamento" | "Ordem de Serviço" | "Relatório Técnico" | "Nota de Serviço" | "Pedido" | "Proposta Comercial" | "Recibo",
  "opcoes": {
    "listaServicos": true,
    "listaMateriais": true,
    "ocultarValorServicos": false,
    "garantia": true,
    "assinaturaCliente": false,
    "assinaturaEmpresa": false
  },
  "valorRecibo": número | null
}

${nowWithWeekday ? nowWithWeekday() : ''}

Texto: """${userMessage}"""

⚠️ Regras:

1. Sempre retorne JSON válido.

2. Se tipo = "Recibo", inclua valorRecibo.
   Se o valor não for informado, use null.

3. Não altere as flags sem instrução explícita do texto.

4. Se o usuário pedir para ocultar materiais:
   "listaMateriais": false

5. Se o usuário pedir para ocultar serviços:
   "listaServicos": false

6. Nunca oculte materiais e serviços ao mesmo tempo no mesmo PDF.

7. Se não houver instrução específica, utilize os valores padrão:

"listaServicos": true
"listaMateriais": true
"ocultarValorServicos": false
"garantia": true
"assinaturaCliente": false
"assinaturaEmpresa": false
`;
}

async function executePdf(command, userPhone) {

  if (command.modulo !== 'orcamento') {
    return '⚠️ Este módulo não possui geração de PDF.';
  }

  try {

    if (!command.id) {
      return '⚠️ É necessário informar o ID do orçamento para gerar o PDF.';
    }

    const { data: orcamentos, error: orcamentoError } = await supabase
      .from('orcamentos')
      .select('*')
      .eq('orcamento_numero', command.id)
      .eq('user_telefone', userPhone)
      .limit(1);

    if (orcamentoError) {
      console.error(
        'Erro ao buscar orçamento para PDF:',
        orcamentoError
      );

      return `⚠️ Não foi possível buscar o orçamento ${command.id}.`;
    }

    if (!orcamentos?.length) {
      return `⚠️ Orçamento ${command.id} não encontrado.`;
    }

    const o = orcamentos[0];

    const { data: users, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('telefone', userPhone)
      .limit(1);

    if (userError) {
      console.error(
        'Erro ao buscar usuário para PDF:',
        userError
      );

      return '⚠️ Não foi possível buscar o usuário para gerar o PDF.';
    }

    if (!users?.length) {
      return '⚠️ Usuário não encontrado para gerar o PDF.';
    }

    const user = users[0];

    // ================================
    // 📄 Configuração do PDF
    // ================================

    const pdfConfig = {
      tipo: command.tipo || 'Orçamento',

      opcoes: command.opcoes || {
        listaServicos: true,
        listaMateriais: true,
        ocultarValorServicos: false,
        garantia: true,
        assinaturaEmpresa: false,
        assinaturaUser: false
      }
    };

    // ================================
    // 🧾 Recibo
    // ================================

    if (pdfConfig.tipo === 'Recibo') {

      const valor = parseFloat(command.valorRecibo);

      pdfConfig.valorRecibo =
        !isNaN(valor) && valor > 0
          ? valor
          : null;

    } else {

      pdfConfig.valorRecibo = null;
    }

    // ================================
    // 📌 Finaliza orçamento
    // ================================

    if (
      ['Recibo', 'Nota de Serviço'].includes(pdfConfig.tipo) &&
      o.etapa?.toLowerCase() !== 'finalizado'
    ) {

      const { error: updateError } = await supabase
        .from('orcamentos')
        .update({
          etapa: 'finalizado'
        })
        .eq('orcamento_numero', command.id)
        .eq('user_telefone', userPhone);

      if (updateError) {
        console.error(
          'Erro ao finalizar orçamento:',
          updateError
        );
      }
    }

    // ================================
    // 📤 Gera e envia PDF
    // ================================

    const enviado = await sendPDFOrcamento(
      userPhone,
      o,
      {
        ...pdfConfig,
        user
      }
    );

    if (enviado) {
      return;
    }

    return `⚠️ PDF do ${pdfConfig.tipo.toLowerCase()} ${command.id} gerado mas não foi possível enviar pelo WhatsApp.`;

  } catch (err) {

    console.error(
      'Erro ao gerar/enviar PDF:',
      err
    );

    return `⚠️ Erro ao gerar/enviar PDF do orçamento ${command.id}.`;
  }
}

module.exports = {
  getPdfPrompt,
  executePdf
};