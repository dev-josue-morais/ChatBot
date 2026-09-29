const supabase = require('../services/supabase');
const { sendPDFOrcamento } = require('../services/whatsappService');

function getPdfPrompt(modulo, userMessage) {

  if (modulo !== 'orcamento') {
    return null;
  }

  return `
Você é um assistente que gera PDFs de orçamentos.

Responda somente com JSON válido.

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

Texto do usuário:
"""${userMessage}"""

⚠️ REGRAS:

1. Sempre retorne JSON válido.

2. "id" deve ser o número do orçamento solicitado.

3. Se tipo = "Recibo", inclua "valorRecibo".
   Se o valor não for informado, use null.

4. Para documentos diferentes de "Pedido", se o usuário não informar nenhuma preferência sobre materiais ou serviços, use:

   "listaServicos": true
   "listaMateriais": true

5. Para tipo = "Pedido":

   "listaMateriais" DEVE SER SEMPRE true.

   Um Pedido sempre deve mostrar a lista de materiais,
   mesmo que o usuário não mencione materiais no comando.

   "listaServicos" deve ser false por padrão.

   Somente coloque "listaServicos": true se o usuário
   mencionar ou solicitar serviços.

6. Para tipo = "Pedido", se o usuário mencionar ou solicitar serviços, use:

   "listaServicos": true

7. Para tipo = "Pedido", se o usuário mencionar materiais E serviços, use:

   "listaMateriais": true
   "listaServicos": true

8. Para tipo = "Pedido", se o usuário não mencionou serviços, somente materiais:

   "listaMateriais": true
   "listaServicos": false

9. Se o usuário pedir explicitamente para ocultar materiais:

   "listaMateriais": false

   Porém, se o tipo for "Pedido", esta regra não se aplica,
   pois materiais são obrigatórios em um Pedido.

10. Se o usuário pedir explicitamente para ocultar serviços:

   "listaServicos": false

11. Não invente uma solicitação de materiais ou serviços que o usuário não fez.

12. "listaMateriais" controla se a lista de materiais será exibida no PDF.

13. "listaServicos" controla se a lista de serviços será exibida no PDF.

14. "ocultarValorServicos": true somente quando o usuário pedir para ocultar os valores dos serviços.

    Caso contrário:

    "ocultarValorServicos": false

15. "garantia": false somente se o usuário pedir para retirar ou ocultar a garantia.

    Caso contrário:

    "garantia": true

16. "assinaturaCliente": true somente se o usuário solicitar assinatura do cliente.

    Caso contrário:

    "assinaturaCliente": false

17. "assinaturaEmpresa": true somente se o usuário solicitar assinatura da empresa.

    Caso contrário:

    "assinaturaEmpresa": false

18. Nunca altere uma opção sem que exista uma instrução do usuário ou uma regra definida acima.

EXEMPLOS:

Usuário:
"Pedido 123"

Resultado:
{
  "modulo": "orcamento",
  "action": "pdf",
  "id": 123,
  "tipo": "Pedido",
  "opcoes": {
    "listaServicos": false,
    "listaMateriais": true,
    "ocultarValorServicos": false,
    "garantia": true,
    "assinaturaCliente": false,
    "assinaturaEmpresa": false
  },
  "valorRecibo": null
}

Usuário:
"Pedido 123 com os materiais"

Resultado:
{
  "modulo": "orcamento",
  "action": "pdf",
  "id": 123,
  "tipo": "Pedido",
  "opcoes": {
    "listaServicos": false,
    "listaMateriais": true,
    "ocultarValorServicos": false,
    "garantia": true,
    "assinaturaCliente": false,
    "assinaturaEmpresa": false
  },
  "valorRecibo": null
}

Usuário:
"Pedido 123 com materiais e serviços"

Resultado:
{
  "modulo": "orcamento",
  "action": "pdf",
  "id": 123,
  "tipo": "Pedido",
  "opcoes": {
    "listaServicos": true,
    "listaMateriais": true,
    "ocultarValorServicos": false,
    "garantia": true,
    "assinaturaCliente": false,
    "assinaturaEmpresa": false
  },
  "valorRecibo": null
}

Usuário:
"Orçamento 123"

Resultado:
{
  "modulo": "orcamento",
  "action": "pdf",
  "id": 123,
  "tipo": "Orçamento",
  "opcoes": {
    "listaServicos": true,
    "listaMateriais": true,
    "ocultarValorServicos": false,
    "garantia": true,
    "assinaturaCliente": false,
    "assinaturaEmpresa": false
  },
  "valorRecibo": null
}
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
        assinaturaCliente: false,
        assinaturaEmpresa: false
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
      } else {
        o.etapa = 'finalizado';
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