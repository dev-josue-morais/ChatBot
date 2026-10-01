const supabase = require('../services/supabase');
const { sendPDFOrcamento } = require('../services/whatsappService');

function getPdfPrompt(modulo, userMessage) {

    if (modulo !== 'orcamento') {
        return null;
    }

    return `
Você interpreta comandos para geração de PDF de um orçamento.

Responda SOMENTE com JSON válido, seguindo exatamente esta estrutura:

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

Comando do usuário:
"""${userMessage}"""

REGRAS DE INTERPRETAÇÃO:

1. O "id" é o número do orçamento solicitado. Nunca invente um ID.

2. Se o usuário não informar o tipo, use "Orçamento".

3. Para qualquer tipo diferente de "Pedido":
   - listaServicos = true por padrão.
   - listaMateriais = true por padrão.

4. Para "Pedido":
   - listaMateriais = true por padrão.
   - listaServicos = false por padrão.
   - Se o usuário pedir, mencionar ou incluir serviços, listaServicos = true.
   - Se pedir materiais e serviços, ambos ficam true.
   - Mesmo que o usuário diga para ocultar materiais, em "Pedido" listaMateriais continua true.

5. Fora de "Pedido":
   - Se pedir explicitamente para ocultar materiais, listaMateriais = false.
   - Se pedir explicitamente para ocultar serviços, listaServicos = false.

6. "ocultarValorServicos":
   - true somente se o usuário pedir para ocultar, esconder ou não mostrar os valores dos serviços.
   - Caso contrário, false.

7. "garantia":
   - false somente se o usuário pedir para retirar, ocultar ou não mostrar a garantia.
   - Caso contrário, true.

8. "assinaturaCliente":
   - true somente se o usuário solicitar assinatura do cliente.
   - Caso contrário, false.

9. "assinaturaEmpresa":
   - true somente se o usuário solicitar assinatura da empresa.
   - Caso contrário, false.

10. "Recibo":
   - Se o usuário informar o valor recebido, coloque o número em "valorRecibo".
   - Se não informar, use null.
   - Para qualquer outro tipo, "valorRecibo" deve ser null.

11. Não altere nenhuma opção sem:
   - uma solicitação explícita do usuário; ou
   - uma regra padrão definida acima.

12. Não invente materiais, serviços, valores, preferências ou outras informações.

EXEMPLOS:

"Pedido 123"
=> tipo Pedido, materiais true, serviços false.

"Pedido 123 com materiais e serviços"
=> tipo Pedido, materiais true, serviços true.

"Orçamento 123"
=> tipo Orçamento, materiais true, serviços true.

"Orçamento 123 sem materiais"
=> tipo Orçamento, materiais false, serviços true.

"Orçamento 123 sem valores dos serviços"
=> ocultarValorServicos true.

"Recibo 123 de 500 reais"
=> tipo Recibo, valorRecibo 500.

"Recibo 123"
=> tipo Recibo, valorRecibo null.
`;
}

async function executePdf(command, userPhone) {

    if (command.modulo !== 'orcamento') {
        return '⚠️ Este módulo não possui geração de PDF.';
    }

    try {

        if (
            command.id === null ||
            command.id === undefined ||
            command.id === '' ||
            Number.isNaN(Number(command.id))
        ) {
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

        const pdfConfig = {
            tipo: command.tipo || 'Orçamento',

            opcoes: {
                listaServicos: command.opcoes?.listaServicos ?? true,
                listaMateriais: command.opcoes?.listaMateriais ?? true,
                ocultarValorServicos:
                    command.opcoes?.ocultarValorServicos ?? false,
                garantia: command.opcoes?.garantia ?? true,
                assinaturaCliente:
                    command.opcoes?.assinaturaCliente ?? false,
                assinaturaEmpresa:
                    command.opcoes?.assinaturaEmpresa ?? false
            },

            valorRecibo: null
        };

        // Pedido sempre deve mostrar materiais.
        if (pdfConfig.tipo === 'Pedido') {
            pdfConfig.opcoes.listaMateriais = true;
        }

        // Recibo
        if (pdfConfig.tipo === 'Recibo') {

            const valor = Number(command.valorRecibo);

            if (!Number.isNaN(valor) && valor > 0) {
                pdfConfig.valorRecibo = valor;
            }
        }

        // Recibo e Nota de Serviço finalizam o orçamento.
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