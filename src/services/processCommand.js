const { DateTime } = require('luxon');
const openai = require('./openai');

const { getCreatePrompt, executeCreate } = require('../cases/create');
const { getEditPrompt, executeEdit } = require('../cases/edit');
const { getListPrompt, executeList } = require('../cases/list');
const { getPdfPrompt, executePdf } = require('../cases/pdf');
const { executeDelete } = require('../cases/delete');

const { getContextWords } = require('../utils/processFunctions');

const MODULOS_VALIDOS = [
    'orcamento',
    'agenda',
    'despesas'
];

const ACTIONS_VALIDAS = [
    'create',
    'edit',
    'delete',
    'list',
    'pdf'
];

function normalizeId(value) {

    if (
        value === null ||
        value === undefined ||
        value === ''
    ) {
        return null;
    }

    const id = Number(value);

    return Number.isFinite(id)
        ? id
        : null;
}

function normalizeAgendaDateTime(value) {

    if (!value) {
        return value;
    }

    const dt = DateTime.fromISO(
        value,
        {
            setZone: true
        }
    );

    if (!dt.isValid) {
        return null;
    }

    return dt
        .setZone('America/Sao_Paulo')
        .toISO();
}

function normalizeAgendaDateOnly(value, endOfDay = false) {

    if (!value) {
        return value;
    }

    const date = DateTime.fromISO(
        value,
        {
            zone: 'America/Sao_Paulo'
        }
    );

    if (!date.isValid) {
        return null;
    }

    const localDate = endOfDay
        ? date.endOf('day')
        : date.startOf('day');

    return localDate
        .toUTC()
        .toISO();
}

async function processCommand(userMessage, userPhone) {

    try {

        // =========================================================
        // 1. VALIDAÇÃO DA MENSAGEM
        // =========================================================

        if (
            !userMessage ||
            typeof userMessage !== 'string'
        ) {
            return '⚠️ Não consegui entender a mensagem.';
        }

        userMessage = userMessage.trim();

        if (!userMessage) {
            return '⚠️ Envie uma mensagem com o que deseja fazer.';
        }


        // =========================================================
        // 2. CONTEXTO PARA CLASSIFICAÇÃO
        // =========================================================

        const contextWords = getContextWords(userMessage);


        // =========================================================
        // 3. CLASSIFICAÇÃO INICIAL
        // =========================================================

        const classifierPrompt = `
Você é o classificador inicial de comandos de um assistente de WhatsApp.

Identifique SOMENTE:
- módulo
- ação
- ID, quando existir

Não execute o comando.
Não responda ao usuário.
Não invente dados.

MÓDULOS:

orcamento:
- orçamento
- cliente
- proposta
- materiais ou serviços de orçamento
- valor, etapa ou desconto de orçamento
- alteração de orçamento
- PDF de orçamento
- ordem de serviço
- recibo
- proposta comercial
- pedido
- nota de serviço
- relatório relacionado ao orçamento

agenda:
- compromisso
- evento
- atendimento
- visita
- reunião
- serviço agendado
- horário marcado
- lembrete
- alteração ou exclusão de evento

IMPORTANTE:
Atendimento, visita, reunião ou serviço marcado para determinado dia ou horário pertence à AGENDA, mesmo que o usuário use palavras como cliente ou serviço.

despesas:
- gasto
- despesa
- gasolina
- combustível
- estacionamento
- pedágio
- Uber
- alimentação
- comida
- marmita
- material comprado
- ferramenta comprada
- gasto diverso
- lançamento, alteração, exclusão ou consulta de despesas

AÇÕES:

create:
- criar
- adicionar
- cadastrar
- lançar
- registrar
- marcar novo evento
- criar orçamento
- lançar despesa

edit:
- alterar
- editar
- mudar
- corrigir
- atualizar
- trocar
- ajustar algo que já existe

delete:
- excluir
- apagar
- remover
- cancelar registro existente

list:
- listar
- mostrar
- consultar
- buscar
- ver registros
- quais são
- quanto gastei
- meus orçamentos
- meus eventos
- minhas despesas

pdf:
- gerar PDF
- gerar documento
- imprimir
- criar orçamento em PDF
- gerar ordem de serviço
- gerar recibo
- gerar proposta
- gerar relatório
- gerar nota de serviço
- gerar pedido

REGRAS DE PRIORIDADE:

- Alteração de registro existente = edit.
- Consulta de registros = list.
- Exclusão de registro existente = delete.
- Novo registro = create.
- Geração de documento/PDF = pdf.

"Adicionar item a um orçamento existente" = orcamento + edit.

"Adicionar nova despesa" = despesas + create.

ID:

O ID pode aparecer como:
- número isolado
- número de orçamento
- número de evento
- número de despesa
- "orçamento 1080826001"
- "evento 1080826001"
- "despesa 1080826001"
- "o 1080826003"
- "número 1080826002"

Não confunda telefone com ID.

Se houver dúvida se um número é telefone ou ID:
"id": null

Se não houver ID claramente identificável:
"id": null

RESPONDA SOMENTE COM JSON VÁLIDO.
NÃO ESCREVA NENHUM TEXTO FORA DO JSON.

{
  "modulo": "orcamento" | "agenda" | "despesas" | "outro",
  "action": "create" | "edit" | "delete" | "list" | "pdf",
  "id": number | null
}

Mensagem:
"${userMessage}"

Contexto:
"${contextWords}"
`;


        const classifierResponse =
            await openai.chat.completions.create({
                model: 'gpt-6-luna',

                messages: [
                    {
                        role: 'system',
                        content: classifierPrompt
                    }
                ],

                response_format: {
                    type: 'json_object'
                }
            });


        let quickJSON =
            classifierResponse.choices?.[0]?.message?.content;


        if (!quickJSON) {
            return '⚠️ Não consegui interpretar o comando.';
        }


        quickJSON = quickJSON
            .replace(/```json\s*|```/g, '')
            .trim();


        let classification;

        try {

            classification = JSON.parse(quickJSON);

        } catch (error) {

            console.error(
                '❌ Erro ao interpretar classificação:',
                error
            );

            console.error(
                'Resposta recebida:',
                quickJSON
            );

            return '⚠️ Não consegui interpretar o comando.';
        }


        // =========================================================
        // 4. NORMALIZAÇÃO DA CLASSIFICAÇÃO
        // =========================================================

        const modulo = classification.modulo;
        const action = classification.action;
        const id = normalizeId(classification.id);


        if (!MODULOS_VALIDOS.includes(modulo)) {
            return '⚠️ Não consegui identificar se o comando é de orçamento, agenda ou despesa.';
        }

        if (!ACTIONS_VALIDAS.includes(action)) {
            return '⚠️ Não consegui identificar a ação solicitada.';
        }


        // =========================================================
        // 5. DELETE
        // =========================================================
        //
        // Delete não precisa de uma segunda interpretação GPT.
        // O classificador já informou módulo, ação e ID.
        // =========================================================

        if (action === 'delete') {

            return await executeDelete(
                {
                    modulo,
                    action,
                    id
                },
                userPhone
            );
        }


        // =========================================================
        // 6. PROMPT ESPECIALIZADO
        // =========================================================

        let prompt;
        let editContext = null;


        // ---------------------------------------------------------
        // CREATE
        // ---------------------------------------------------------

        if (action === 'create') {

            prompt = await getCreatePrompt(
                modulo,
                userMessage,
                userPhone
            );
        }


        // ---------------------------------------------------------
        // EDIT
        // ---------------------------------------------------------

        else if (action === 'edit') {

            const result = await getEditPrompt(
                modulo,
                userMessage,
                id,
                userPhone
            );


            if (
                result &&
                typeof result === 'object' &&
                result.error
            ) {
                return result.error;
            }


            if (
                result &&
                typeof result === 'object' &&
                result.prompt
            ) {

                prompt = result.prompt;

                editContext = {
                    currentData: result.currentData
                };

            } else {

                // Compatibilidade com módulos antigos.
                prompt = result;
            }
        }


        // ---------------------------------------------------------
        // LIST
        // ---------------------------------------------------------

        else if (action === 'list') {

            prompt = await getListPrompt(
                modulo,
                userMessage
            );
        }


        // ---------------------------------------------------------
        // PDF
        // ---------------------------------------------------------

        else if (action === 'pdf') {

            prompt = await getPdfPrompt(
                modulo,
                userMessage
            );
        }


        if (
            !prompt ||
            typeof prompt !== 'string'
        ) {
            return '⚠️ Não consegui preparar a interpretação do comando.';
        }


        // =========================================================
        // 7. INTERPRETAÇÃO ESPECIALIZADA
        // =========================================================

        const finalPrompt = `
${prompt}

REGRAS GERAIS:

1. Retorne SOMENTE JSON válido.
2. Não utilize markdown.
3. Não coloque explicações fora do JSON.
4. Não invente informações.
5. Não invente IDs, datas, horários, telefones, valores ou nomes.
6. Respeite exatamente o módulo e a ação definidos pelo sistema.
7. Para edição, retorne somente as alterações solicitadas conforme o formato definido no prompt.
`;


        const response =
            await openai.chat.completions.create({
                model: 'gpt-6-luna',

                messages: [
                    {
                        role: 'system',
                        content: finalPrompt
                    },
                    {
                        role: 'user',
                        content: userMessage
                    }
                ],

                response_format: {
                    type: 'json_object'
                }
            });


        let content =
            response.choices?.[0]?.message?.content;


        if (!content) {
            return '⚠️ Não consegui interpretar os dados do comando.';
        }


        content = content
            .replace(/```json\s*|```/g, '')
            .trim();


        let gptData;

        try {

            gptData = JSON.parse(content);

        } catch (error) {

            console.error(
                '❌ Erro ao interpretar resposta final do GPT:',
                error
            );

            console.error(
                'Resposta recebida:',
                content
            );

            return '⚠️ Não consegui interpretar corretamente o comando.';
        }


        if (
            !gptData ||
            typeof gptData !== 'object' ||
            Array.isArray(gptData)
        ) {
            return '⚠️ A resposta interpretada não possui um formato válido.';
        }


        // =========================================================
        // 8. MÓDULO E AÇÃO SÃO DEFINIDOS PELO CLASSIFICADOR
        // =========================================================

        gptData.modulo = modulo;
        gptData.action = action;


        // =========================================================
        // 9. ID OFICIAL
        // =========================================================
        //
        // O segundo GPT não pode trocar o ID identificado
        // pelo classificador.
        // =========================================================

        if (action === 'edit') {

            if (id !== null) {

                if (modulo === 'orcamento') {
                    gptData.orcamento_numero = id;
                }

                if (modulo === 'agenda') {
                    gptData.event_numero = id;
                }

                if (modulo === 'despesas') {
                    gptData.despesa_numero = String(id);
                }
            }
        }

        if (action === 'pdf') {

            if (modulo === 'orcamento' && id !== null) {
                gptData.id = id;
            }
        }


        // =========================================================
        // 10. DADOS ATUAIS DA EDIÇÃO
        // =========================================================
        //
        // getEditPrompt() já buscou o registro.
        //
        // Não fazer outra consulta aqui.
        // =========================================================

        if (
            action === 'edit' &&
            editContext?.currentData
        ) {

            gptData._currentData =
                editContext.currentData;
        }


        // =========================================================
        // 11. NORMALIZAÇÃO DAS DATAS DA AGENDA
        // =========================================================

        if (modulo === 'agenda') {

            // -----------------------------------------------------
            // CREATE / EDIT
            // datetime
            // -----------------------------------------------------

            if (gptData.datetime) {

                const normalized =
                    normalizeAgendaDateTime(
                        gptData.datetime
                    );

                if (!normalized) {
                    return '⚠️ A data ou horário informado não é válido.';
                }

                gptData.datetime = normalized;
            }


            // -----------------------------------------------------
            // LIST
            // Datas vindas do prompt são datas locais BRT.
            // -----------------------------------------------------

            if (gptData.start_date) {

                const normalized =
                    normalizeAgendaDateOnly(
                        gptData.start_date,
                        false
                    );

                if (!normalized) {
                    return '⚠️ A data inicial informada não é válida.';
                }

                gptData.start_date = normalized;
            }


            if (gptData.end_date) {

                const normalized =
                    normalizeAgendaDateOnly(
                        gptData.end_date,
                        true
                    );

                if (!normalized) {
                    return '⚠️ A data final informada não é válida.';
                }

                gptData.end_date = normalized;
            }
        }


        // =========================================================
        // 12. VALIDAÇÕES FINAIS
        // =========================================================

        if (gptData.modulo !== modulo) {
            return '⚠️ O módulo identificado não corresponde ao comando.';
        }

        if (gptData.action !== action) {
            return '⚠️ A ação identificada não corresponde ao comando.';
        }


        if (
            action === 'edit' &&
            !editContext?.currentData
        ) {
            return '⚠️ Não foi possível carregar os dados atuais para realizar a alteração com segurança.';
        }


        // =========================================================
        // 13. EXECUÇÃO
        // =========================================================

        switch (`${modulo}_${action}`) {

            case 'orcamento_create':
            case 'agenda_create':
            case 'despesas_create':

                return await executeCreate(
                    gptData,
                    userPhone
                );


            case 'orcamento_edit':
            case 'agenda_edit':
            case 'despesas_edit':

                return await executeEdit(
                    gptData,
                    userPhone
                );


            case 'orcamento_list':
            case 'agenda_list':
            case 'despesas_list':
console.log('📋 LIST COMMAND:', JSON.stringify(gptData, null, 2));
                return await executeList(
                    gptData,
                    userPhone
                );


            case 'orcamento_pdf':

                return await executePdf(
                    gptData,
                    userPhone
                );


            default:

                return '⚠️ Comando não reconhecido.';
        }

    } catch (error) {

        console.error(
            '❌ Erro em processCommand:',
            error
        );

        return '⚠️ Ocorreu um erro ao processar seu comando. Tente novamente.';
    }
}


module.exports = {
    processCommand
};