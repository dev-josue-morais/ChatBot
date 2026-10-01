const { DateTime } = require('luxon');
const openai = require('./openai');

const { getCreatePrompt, executeCreate } = require('../cases/create');
const { getEditPrompt, executeEdit } = require('../cases/edit');
const { getListPrompt, executeList } = require('../cases/list');
const { getPdfPrompt, executePdf } = require('../cases/pdf');
const { executeDelete } = require('../cases/delete');

const { getContextWords } = require('../utils/processFunctions');

const GPT_MODEL = 'gpt-6-luna';


async function processCommand(userMessage, userPhone) {
    try {
        userMessage = String(userMessage || '').trim();

        if (!userMessage) {
            return '⚠️ Não encontrei nenhuma instrução para processar.';
        }

        /*
        ============================================================
        1. CONTEXTO REDUZIDO PARA O CLASSIFICADOR
        ============================================================
        */

        const contextWords = getContextWords(userMessage);


        /*
        ============================================================
        2. PRIMEIRA CHAMADA — CLASSIFICAÇÃO
        ============================================================
        */

        const classifierPrompt = `
Você é o classificador de comandos de um assistente empresarial.

Sua única função é identificar:

- modulo
- action
- id

NÃO execute o comando.
NÃO explique nada.
NÃO faça alterações.
Retorne SOMENTE JSON válido.

FORMATO OBRIGATÓRIO:

{
  "modulo": "orcamento" | "agenda" | "despesas" | "outro",
  "action": "create" | "edit" | "delete" | "list" | "pdf",
  "id": number | null
}

REGRAS:

MÓDULOS:

1. "orcamento"
Use quando o usuário estiver falando de:
- orçamento
- cliente
- proposta
- materiais de orçamento
- serviços de orçamento
- desconto de orçamento
- etapa de orçamento
- observações de orçamento
- número de orçamento

2. "agenda"
Use quando estiver falando de:
- compromisso
- evento
- atendimento
- visita
- reunião
- serviço agendado
- horário marcado
- lembrete
- número de evento

ATENÇÃO:
Atendimento, visita, reunião ou compromisso futuro são AGENDA,
mesmo que o usuário use a palavra "serviço".

3. "despesas"
Use quando estiver falando de:
- gasto
- despesa
- gasolina
- combustível
- alimentação
- almoço
- jantar
- marmita
- estacionamento
- pedágio
- materiais comprados como despesa
- manutenção paga
- outros gastos

4. "outro"
Use quando não for possível identificar nenhum dos módulos acima.

AÇÕES:

1. "create"
Quando o usuário quer:
- criar
- cadastrar
- adicionar um novo registro
- lançar uma nova despesa
- marcar um novo evento
- fazer um novo orçamento

2. "edit"
Quando o usuário quer alterar algo que JÁ EXISTE.

Exemplos:
- "altera o orçamento 123"
- "muda o valor do fio no orçamento 123"
- "troca o horário do evento 456"
- "altera a descrição da despesa 789"
- "corrige o nome do cliente"

Se existe um registro identificado e o usuário quer modificar esse registro, é EDIT.

3. "delete"
Quando quer apagar/excluir/remover um registro inteiro.

IMPORTANTE:
"remover um material do orçamento" continua sendo EDIT do orçamento,
e NÃO DELETE do orçamento inteiro.

4. "list"
Quando quer consultar, listar, procurar, mostrar ou pesquisar registros.

Exemplos:
- "me mostra os orçamentos"
- "liste minhas despesas"
- "quais eventos tenho amanhã?"
- "procura o orçamento do João"

5. "pdf"
Quando quer gerar, enviar ou criar um PDF/documento relacionado a um orçamento.

Exemplos:
- "gera o PDF do orçamento 123"
- "manda a proposta em PDF"
- "gera uma ordem de serviço"

ID:

Extraia o número do registro quando ele estiver claramente identificado.

Tipos de ID:
- orçamento → orcamento_numero
- agenda → event_numero
- despesa → despesa_numero

Se não houver ID claramente identificável, use null.

NÃO confunda:
- telefone
- valor em dinheiro
- quantidade
- data
- horário
com ID.

Se houver vários números na mensagem, procure primeiro pelo número explicitamente associado ao registro.

CONTEXTO DA MENSAGEM:

${contextWords}
`;


        const classifierResponse = await openai.chat.completions.create({
            model: GPT_MODEL,
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


        let classifierData;

        try {
            const content =
                classifierResponse?.choices?.[0]?.message?.content || '';

            classifierData = JSON.parse(content);
        } catch (error) {
            console.error('Erro ao interpretar classificador:', error);
            return '⚠️ Não consegui identificar corretamente o comando.';
        }


        /*
        ============================================================
        3. NORMALIZAÇÃO DA CLASSIFICAÇÃO
        ============================================================
        */

        const modulo = classifierData.modulo;
        const action = classifierData.action;

        let id = classifierData.id;

        if (
            id !== null &&
            id !== undefined &&
            id !== ''
        ) {
            const numericId = Number(id);

            id = Number.isFinite(numericId)
                ? numericId
                : null;
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

        if (action === 'pdf' && modulo !== 'orcamento') {
            return '⚠️ A geração de PDF está disponível apenas para orçamentos.';
        }


        /*
        ============================================================
        4. DELETE
        ============================================================
        
        Delete não precisa passar pela segunda interpretação do GPT.
        A classificação já identificou módulo, ação e ID.
        */

        if (action === 'delete') {
            if (id === null) {
                return '⚠️ Informe o número do registro que deseja excluir.';
            }

            return await executeDelete(
                {
                    modulo,
                    action,
                    id
                },
                userPhone
            );
        }


        /*
        ============================================================
        5. BUSCA DO PROMPT ESPECIALIZADO
        ============================================================
        
        EDIT e LIST podem retornar:

        {
            prompt: '...',
            currentData: ...
        }

        CREATE e PDF continuam podendo retornar apenas uma string.

        O currentData nunca é enviado para o GPT como parte do
        comando final. Ele é mantido internamente para o execute.
        ============================================================
        */

        let promptResult;
        let prompt;
        let currentData = null;

        switch (`${modulo}_${action}`) {

            case 'orcamento_create':
            case 'agenda_create':
            case 'despesas_create':

                promptResult = await getCreatePrompt(
                    modulo,
                    userMessage,
                    userPhone
                );

                break;


            case 'orcamento_edit':
            case 'agenda_edit':
            case 'despesas_edit':

                if (id === null) {
                    return '⚠️ Informe o número do registro que deseja alterar.';
                }

                promptResult = await getEditPrompt(
                    modulo,
                    userMessage,
                    id,
                    userPhone
                );

                break;


            case 'orcamento_list':
            case 'agenda_list':
            case 'despesas_list':

                promptResult = await getListPrompt(
                    modulo,
                    userMessage,
                    userPhone
                );

                break;


            case 'orcamento_pdf':

                if (id === null) {
                    return '⚠️ Informe o número do orçamento para gerar o PDF.';
                }

                promptResult = await getPdfPrompt(
                    modulo,
                    userMessage
                );

                break;


            default:
                return '⚠️ Não consegui identificar o tipo de comando.';
        }


        /*
        ============================================================
        6. TRATAMENTO DO RESULTADO DO PROMPT
        ============================================================
        
        Agora aceitamos dois formatos:

        A) Prompt normal:
           "texto do prompt"

        B) Prompt com contexto já pesquisado:
           {
               prompt: "texto do prompt",
               currentData: {...}
           }

        Isso permite que edit/list façam a consulta apenas uma vez.
        */

        if (
            promptResult &&
            typeof promptResult === 'object' &&
            !Array.isArray(promptResult)
        ) {

            /*
            Erro retornado pelo case
            */
            if (promptResult.error) {
                return promptResult.error;
            }

            /*
            Contexto retornado pelo edit/list
            */
            if (typeof promptResult.prompt === 'string') {

                prompt = promptResult.prompt;

                if (
                    Object.prototype.hasOwnProperty.call(
                        promptResult,
                        'currentData'
                    )
                ) {
                    currentData = promptResult.currentData;
                }

            } else {
                return '⚠️ Não consegui preparar corretamente o comando.';
            }

        } else {

            prompt = promptResult;
        }


        if (typeof prompt !== 'string' || !prompt.trim()) {
            return '⚠️ Não consegui preparar corretamente a interpretação do comando.';
        }


        /*
        ============================================================
        7. SEGUNDA CHAMADA — INTERPRETAÇÃO ESPECIALIZADA
        ============================================================
        */

        const finalPrompt = `
${prompt}

REGRAS FINAIS OBRIGATÓRIAS:

- Retorne SOMENTE JSON válido.
- Não use markdown.
- Não coloque \`\`\`json.
- Não escreva explicações fora do JSON.
- Não invente dados que não estejam na mensagem ou no contexto fornecido.
- Não invente números, IDs, telefones, valores ou datas.
- Respeite exatamente o formato JSON solicitado pelo prompt.
`;


        const response = await openai.chat.completions.create({
            model: GPT_MODEL,
            messages: [
                {
                    role: 'system',
                    content: finalPrompt
                }
            ],
            response_format: {
                type: 'json_object'
            }
        });


        let gptData;

        try {
            const content =
                response?.choices?.[0]?.message?.content || '';

            gptData = JSON.parse(content);

        } catch (error) {
            console.error(
                'Erro ao interpretar resposta final do GPT:',
                error
            );

            return '⚠️ Não consegui interpretar corretamente os dados do comando.';
        }


        /*
        ============================================================
        8. DADOS AUTORITATIVOS DA PRIMEIRA ETAPA
        ============================================================
        
        O segundo GPT não pode alterar:
        - módulo
        - ação
        - ID

        Essas informações já foram classificadas antes.
        */

        gptData.modulo = modulo;
        gptData.action = action;


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


        /*
        ============================================================
        9. NORMALIZAÇÃO DAS DATAS DA AGENDA
        ============================================================
        */

        if (modulo === 'agenda') {

            /*
            O GPT trabalha com GMT-3.

            Antes de enviar ao Supabase, convertemos para UTC.
            */

            if (gptData.datetime) {

                const dateTime = DateTime.fromISO(
                    gptData.datetime,
                    {
                        setZone: true
                    }
                );

                if (dateTime.isValid) {
                    gptData.datetime = dateTime
                        .toUTC()
                        .toISO();
                }
            }


            if (gptData.start_date) {

                const startDate = DateTime.fromISO(
                    gptData.start_date,
                    {
                        setZone: true
                    }
                );

                if (startDate.isValid) {
                    gptData.start_date = startDate
                        .toUTC()
                        .toISO();
                }
            }


            if (gptData.end_date) {

                const endDate = DateTime.fromISO(
                    gptData.end_date,
                    {
                        setZone: true
                    }
                );

                if (endDate.isValid) {
                    gptData.end_date = endDate
                        .toUTC()
                        .toISO();
                }
            }
        }


        /*
        ============================================================
        10. ANEXA CONTEXTO DO SUPABASE
        ============================================================
        
        IMPORTANTE:

        _currentData NÃO faz parte do JSON produzido pelo GPT.

        Ele é adicionado somente depois da interpretação.

        Assim:
        
        GPT → interpreta o pedido
        currentData → dados reais já consultados no Supabase
        execute → junta os dois
        */

        if (currentData !== null) {
            gptData._currentData = currentData;
        }


        /*
        ============================================================
        11. EXECUÇÃO
        ============================================================
        */

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

        console.error(
            'Erro geral no processCommand:',
            error
        );

        return '⚠️ Ocorreu um erro ao processar o comando.';
    }
}


module.exports = processCommand;