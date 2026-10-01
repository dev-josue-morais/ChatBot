const { DateTime } = require('luxon');
const openai = require('./openai');

const { getCreatePrompt, executeCreate } = require('../cases/create');
const { getEditPrompt, executeEdit } = require('../cases/edit');
const { getListPrompt, executeList } = require('../cases/list');
const { getPdfPrompt, executePdf } = require('../cases/pdf');
const { executeDelete } = require('../cases/delete');

const { getContextWords } = require('../utils/processFunctions');


async function processCommand(userMessage, userPhone) {
    try {
        if (!userMessage || typeof userMessage !== 'string') {
            return '⚠️ Não consegui entender a mensagem.';
        }

        userMessage = userMessage.trim();

        if (!userMessage) {
            return '⚠️ Envie uma mensagem com o que deseja fazer.';
        }


        // =========================================================
        // 1. CONTEXTO REDUZIDO PARA A CLASSIFICAÇÃO
        // =========================================================

        const contextWords = getContextWords(userMessage);


        // =========================================================
        // 2. CLASSIFICAÇÃO INICIAL
        // =========================================================

        const classifierPrompt = `
Você é o classificador inicial de comandos de um assistente de WhatsApp.

Sua função é identificar SOMENTE:
- módulo
- ação
- ID, quando existir

Não execute o comando.
Não invente dados.
Não tente responder ao usuário.

MÓDULOS POSSÍVEIS:

1. orcamento
Use quando o usuário estiver falando de:
- orçamento
- cliente
- proposta
- materiais de um orçamento
- serviços de um orçamento
- valor de orçamento
- etapa de orçamento
- desconto de orçamento
- alteração de orçamento
- PDF de orçamento
- ordem de serviço, recibo, proposta comercial ou outros documentos relacionados ao orçamento

2. agenda
Use quando estiver falando de:
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
Atendimento, visita, reunião ou serviço marcado para determinado dia/horário pertence à AGENDA, mesmo que o usuário use palavras relacionadas a cliente ou serviço.

3. despesas
Use quando estiver falando de:
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

4. outro
Use quando não for possível identificar nenhum dos módulos acima.

AÇÕES POSSÍVEIS:

create:
- criar
- adicionar
- cadastrar
- lançar
- registrar
- marcar um novo evento
- criar novo orçamento
- lançar nova despesa

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
- cancelar um registro existente

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

REGRAS IMPORTANTES SOBRE ID:

O ID pode aparecer como:
- número isolado
- número de orçamento
- número de evento
- número de despesa
- "orçamento 123456"
- "evento 123456"
- "despesa 123456"
- "o 123456"
- "número 123456"

Retorne o número identificado no campo "id".

NÃO confunda telefone com ID.

Se houver um telefone, não coloque o telefone em "id".

Se não houver ID claramente identificável:
"id": null

Se houver dúvida entre um número ser telefone ou ID:
"id": null

REGRAS DE PRIORIDADE:

- Se o usuário estiver alterando algo que já existe, use "edit".
- Se estiver apenas consultando registros, use "list".
- Se estiver excluindo algo existente, use "delete".
- Se estiver criando um novo registro, use "create".
- Se estiver pedindo geração de documento/PDF, use "pdf".

Não confunda "adicionar item a um orçamento existente" com criar novo orçamento.
Nesse caso é "orcamento" + "edit".

Não confunda "adicionar uma nova despesa" com editar uma despesa existente.
Nesse caso é "despesas" + "create".

Responda SOMENTE JSON válido neste formato:

{
  "modulo": "orcamento" | "agenda" | "despesas" | "outro",
  "action": "create" | "edit" | "delete" | "list" | "pdf",
  "id": number | null
}

Mensagem completa:
"${userMessage}"

Contexto principal da mensagem:
"${contextWords}"
`;


        const classifierResponse = await openai.chat.completions.create({
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


        let quickJSON = classifierResponse.choices?.[0]?.message?.content;

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
            console.error('❌ Erro ao interpretar classificação:', error);
            console.error('Resposta recebida:', quickJSON);

            return '⚠️ Não consegui interpretar o comando.';
        }


        // =========================================================
        // 3. NORMALIZAÇÃO DA CLASSIFICAÇÃO
        // =========================================================

        const modulo = classification.modulo;
        const action = classification.action;

        let id = classification.id ?? null;

        if (
            id !== null &&
            id !== undefined &&
            id !== ''
        ) {
            const parsedId = Number(id);

            if (Number.isFinite(parsedId)) {
                id = parsedId;
            } else {
                id = null;
            }
        } else {
            id = null;
        }


        const modulosValidos = [
            'orcamento',
            'agenda',
            'despesas'
        ];

        const actionsValidas = [
            'create',
            'edit',
            'delete',
            'list',
            'pdf'
        ];


        if (!modulosValidos.includes(modulo)) {
            return '⚠️ Não consegui identificar se o comando é de orçamento, agenda ou despesa.';
        }

        if (!actionsValidas.includes(action)) {
            return '⚠️ Não consegui identificar a ação solicitada.';
        }


        // =========================================================
        // 4. DELETE
        // =========================================================
        // Delete continua sendo tratado diretamente porque não
        // precisa passar por uma segunda interpretação GPT.
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
        // 5. OBTENÇÃO DO PROMPT ESPECIALIZADO
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


            // Erro retornado pelo getEditPrompt
            if (
                result &&
                typeof result === 'object' &&
                result.error
            ) {
                return result.error;
            }


            // Novo formato:
            // {
            //     prompt,
            //     currentData
            // }
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
                // Compatibilidade caso algum módulo ainda retorne
                // apenas uma string.
                prompt = result;
            }
        }


        // ---------------------------------------------------------
        // LIST
        // ---------------------------------------------------------

        else if (action === 'list') {
            prompt = await getListPrompt(
                modulo,
                userMessage,
                userPhone
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


        if (!prompt || typeof prompt !== 'string') {
            return '⚠️ Não consegui preparar a interpretação do comando.';
        }


        // =========================================================
        // 6. SEGUNDA ETAPA — INTERPRETAÇÃO ESPECIALIZADA
        // =========================================================

        const finalPrompt = `
${prompt}

REGRAS GERAIS OBRIGATÓRIAS:

1. Retorne SOMENTE JSON válido.
2. Não utilize markdown.
3. Não coloque explicações antes ou depois do JSON.
4. Não invente informações que não estejam na mensagem do usuário ou nos dados fornecidos.
5. Não invente IDs.
6. Não altere IDs existentes.
7. Não invente datas, horários, telefones, valores ou nomes.
8. Quando uma informação não foi solicitada para alteração, preserve-a conforme as regras do prompt.
9. Respeite exatamente o módulo e a ação solicitados.
`;


        const response = await openai.chat.completions.create({
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


        let content = response.choices?.[0]?.message?.content;

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
            console.error('❌ Erro ao interpretar resposta final do GPT:', error);
            console.error('Resposta recebida:', content);

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
        // 7. GARANTIR MÓDULO / AÇÃO / ID
        // =========================================================

        // O classificador inicial é a fonte oficial para módulo
        // e ação. O GPT especializado não deve conseguir trocar
        // o tipo de operação no meio do processo.

        gptData.modulo = modulo;
        gptData.action = action;


        // Para operações que possuem ID, preservamos o ID
        // identificado na primeira etapa.

        if (action === 'edit' || action === 'pdf' || action === 'delete') {
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


        // =========================================================
        // 8. INJETAR DADOS ATUAIS DA EDIÇÃO
        // =========================================================
        //
        // IMPORTANTE:
        //
        // getEditPrompt() já consultou o Supabase.
        //
        // Portanto NÃO fazemos uma segunda consulta aqui.
        //
        // Os dados atuais são mantidos internamente em _currentData
        // e usados pelo executeEdit().
        //
        // Esse campo não veio do GPT.
        // =========================================================

        if (action === 'edit' && editContext?.currentData) {
            gptData._currentData = editContext.currentData;
        }


        // =========================================================
        // 9. NORMALIZAÇÃO DAS DATAS DA AGENDA
        // =========================================================

        if (modulo === 'agenda') {

            // -----------------------------------------------------
            // datetime
            // -----------------------------------------------------

            if (gptData.datetime) {
                const dt = DateTime.fromISO(
                    gptData.datetime,
                    {
                        setZone: true
                    }
                );

                if (dt.isValid) {
                    gptData.datetime = dt
                        .setZone('America/Sao_Paulo')
                        .toISO();
                }
            }


            // -----------------------------------------------------
            // start_date
            // -----------------------------------------------------

            if (gptData.start_date) {
                const start = DateTime.fromISO(
                    gptData.start_date,
                    {
                        setZone: true
                    }
                );

                if (start.isValid) {
                    gptData.start_date = start
                        .setZone('America/Sao_Paulo')
                        .toUTC()
                        .toISO();
                }
            }


            // -----------------------------------------------------
            // end_date
            // -----------------------------------------------------

            if (gptData.end_date) {
                const end = DateTime.fromISO(
                    gptData.end_date,
                    {
                        setZone: true
                    }
                );

                if (end.isValid) {
                    gptData.end_date = end
                        .setZone('America/Sao_Paulo')
                        .toUTC()
                        .toISO();
                }
            }
        }


        // =========================================================
        // 10. VALIDAÇÕES FINAIS
        // =========================================================

        if (gptData.modulo !== modulo) {
            return '⚠️ O módulo identificado não corresponde ao comando.';
        }

        if (gptData.action !== action) {
            return '⚠️ A ação identificada não corresponde ao comando.';
        }


        // Para edição, o registro atual é obrigatório.
        // Sem ele, não devemos correr o risco de atualizar
        // dados sem a referência original.

        if (
            action === 'edit' &&
            !editContext?.currentData
        ) {
            return '⚠️ Não foi possível carregar os dados atuais para realizar a alteração com segurança.';
        }


        // =========================================================
        // 11. EXECUÇÃO
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
        console.error('❌ Erro em processCommand:', error);

        return '⚠️ Ocorreu um erro ao processar seu comando. Tente novamente.';
    }
}


module.exports = {
    processCommand
};