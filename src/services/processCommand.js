const { DateTime } = require('luxon');
const openai = require('./openai');

const {
  getCreatePrompt,
  executeCreate
} = require('../cases/create');

const {
  getEditPrompt,
  executeEdit
} = require('../cases/edit');

const {
  getListPrompt,
  executeList
} = require('../cases/list');

const {
  getPdfPrompt,
  executePdf
} = require('../cases/pdf');

const {
  executeDelete
} = require('../cases/delete');

const {
  getContextWords
} = require('../utils/processFunctions');

const GPT_MODEL = 'gpt-6-luna';

const MODULOS_VALIDOS = [
  'agenda',
  'orcamento',
  'despesas'
];

const ACOES_VALIDAS = [
  'create',
  'edit',
  'delete',
  'list',
  'pdf'
];

const ACOES_POR_MODULO = {
  agenda: [
    'create',
    'edit',
    'delete',
    'list'
  ],

  orcamento: [
    'create',
    'edit',
    'delete',
    'list',
    'pdf'
  ],

  despesas: [
    'create',
    'edit',
    'delete',
    'list'
  ]
};


// ============================================================
// CLASSIFICAÇÃO
// ============================================================

function getClassificationPrompt() {

  return `
Você é o classificador principal de um assistente de gestão.

Sua única função é identificar:
1. módulo;
2. ação;
3. identificador do registro, quando existir.

Não interprete detalhes do cadastro.
Não execute a ação.
Não invente informações.

Retorne SOMENTE JSON válido neste formato:

{
  "modulo": "orcamento" | "agenda" | "despesas" | "outro",
  "action": "create" | "edit" | "delete" | "list" | "pdf",
  "id": número | null
}

MÓDULOS:

orcamento:
- orçamento
- proposta
- cotação
- cliente
- materiais
- serviços
- orçamento em negociação
- orçamento aprovado
- orçamento finalizado

agenda:
- atendimento
- evento
- compromisso
- visita
- reunião
- horário
- agendamento

despesas:
- gasto
- despesa
- gasolina
- combustível
- material comprado
- alimentação
- condução
- estacionamento
- Uber
- pedágio
- pagamento de despesa

IMPORTANTE:
atendimento, evento, compromisso, visita, reunião e agendamento pertencem à AGENDA.

AÇÕES:

create:
- criar
- adicionar
- cadastrar
- marcar
- agendar
- lançar
- registrar novo

edit:
- alterar
- editar
- corrigir
- mudar
- atualizar
- modificar

delete:
- excluir
- apagar
- remover
- cancelar

list:
- listar
- mostrar
- consultar
- buscar
- ver
- resumo
- relatório
- total
- quanto gastei
- quanto tenho
- quais
- meus orçamentos
- minhas despesas

pdf:
- gerar PDF
- enviar PDF
- criar PDF
- imprimir
- gerar documento

REGRAS DO PDF:

- PDF existe somente para ORÇAMENTO.
- Pedido de PDF de orçamento → action = "pdf".
- PDF de agenda não existe.
- PDF de despesas não existe.
- "resumo", "relatório", "total" ou "quanto gastei" em despesas → action = "list".

IDENTIFICADOR:

Se houver um número que claramente identifica um registro existente, coloque-o em "id".

Conforme o módulo:
- orçamento → orcamento_numero
- agenda → event_numero
- despesas → despesa_numero

No JSON, sempre use o campo "id".

Regras:
- Não altere o número.
- Não remova zeros.
- Não faça cálculos.
- Não invente identificadores.
- Não confunda ID com telefone.
- Não confunda ID com valor.
- Não confunda ID com quantidade.
- Não confunda ID com data.
- Não confunda ID com horário.
- Se houver vários números, use o contexto para identificar o número do registro.
- Se não houver um identificador claramente relacionado a um registro, use null.

AMBIGUIDADE:

Se não houver informação suficiente para identificar um registro, NÃO invente.

Exemplo:
"edita meu orçamento"
→ id = null

"edita o orçamento 1060626002"
→ id = 1060626002

"mostra meu orçamento"
→ action = list, id = null

"apaga a despesa 1300926001"
→ action = delete, id = 1300926001

"gera o PDF do orçamento 1060626002"
→ modulo = orcamento, action = pdf, id = 1060626002

REGRAS DE PRIORIDADE:

1. Identifique primeiro o módulo.
2. Depois identifique a ação.
3. Depois identifique o ID.
4. Nunca deixe o ID alterar a identificação do módulo.
5. Nunca deixe um valor monetário ser interpretado como ID.
6. Nunca deixe telefone ser interpretado como ID.

Se a mensagem não pertencer a nenhum módulo:
"modulo": "outro"

Quando modulo = "outro", action pode ser "list" somente se for necessário para completar o JSON; caso contrário use "create".

Retorne somente JSON.
`;
}


// ============================================================
// VALIDAÇÃO DA CLASSIFICAÇÃO
// ============================================================

function validateClassification(classification) {

  if (!classification || typeof classification !== 'object') {
    return {
      valido: false,
      mensagem: '⚠️ Não consegui identificar o tipo de comando.'
    };
  }

  const {
    modulo,
    action,
    id
  } = classification;

  if (!modulo || !action) {
    return {
      valido: false,
      mensagem: '⚠️ Não consegui identificar o tipo de comando.'
    };
  }

  if (!MODULOS_VALIDOS.includes(modulo)) {
    return {
      valido: false,
      mensagem: '⚠️ Não entendi se é AGENDA, ORÇAMENTO ou DESPESAS.'
    };
  }

  if (!ACOES_VALIDAS.includes(action)) {
    return {
      valido: false,
      mensagem: '⚠️ Ação não reconhecida.'
    };
  }

  if (!ACOES_POR_MODULO[modulo]?.includes(action)) {

    if (action === 'pdf') {
      return {
        valido: false,
        mensagem: '⚠️ Geração de PDF está disponível somente para ORÇAMENTOS.'
      };
    }

    return {
      valido: false,
      mensagem: `⚠️ A ação "${action}" não está disponível para ${modulo}.`
    };
  }

  if (
    id !== null &&
    id !== undefined &&
    typeof id !== 'number' &&
    typeof id !== 'string'
  ) {
    return {
      valido: false,
      mensagem: '⚠️ O identificador informado é inválido.'
    };
  }

  return {
    valido: true
  };
}


// ============================================================
// CONVERSÃO DE DATAS DA AGENDA
// ============================================================

function normalizeAgendaDates(gptData) {

  if (!gptData || gptData.modulo !== 'agenda') {
    return gptData;
  }

  if (gptData.datetime) {

    const date = DateTime.fromISO(
      gptData.datetime,
      {
        zone: 'America/Sao_Paulo'
      }
    );

    if (date.isValid) {

      gptData.datetime =
        date
          .toUTC()
          .toISO();
    }
  }

  if (gptData.start_date) {

    const date = DateTime.fromISO(
      gptData.start_date,
      {
        zone: 'America/Sao_Paulo'
      }
    );

    if (date.isValid) {

      gptData.start_date =
        date.toISO({
          includeOffset: false
        });
    }
  }

  if (gptData.end_date) {

    const date = DateTime.fromISO(
      gptData.end_date,
      {
        zone: 'America/Sao_Paulo'
      }
    );

    if (date.isValid) {

      gptData.end_date =
        date.toISO({
          includeOffset: false
        });
    }
  }

  return gptData;
}


// ============================================================
// PROCESSAMENTO PRINCIPAL
// ============================================================

async function processCommand(userMessage, userPhone) {

  try {

    userMessage =
      (userMessage || '').trim();

    if (!userMessage) {
      return '⚠️ Informe o comando que deseja executar.';
    }


    // ========================================================
    // CONTEXTO PARA CLASSIFICAÇÃO
    // ========================================================

    const contextWords =
      getContextWords(userMessage);


    // ========================================================
    // 1. CLASSIFICAÇÃO
    // ========================================================

    const classificationPrompt =
      getClassificationPrompt();

    let quickResponse;

    try {

      quickResponse =
        await openai.chat.completions.create({

          model: GPT_MODEL,

          messages: [
            {
              role: 'system',
              content: classificationPrompt
            },
            {
              role: 'user',
              content: contextWords
            }
          ],

          response_format: {
            type: 'json_object'
          }
        });

    } catch (err) {

      console.error(
        '\n======================================================'
      );

      console.error(
        '🔥 [GPT CLASSIFICADOR] ERRO AO CHAMAR OPENAI'
      );

      console.error(
        '======================================================'
      );

      console.error(
        '📩 Mensagem original:',
        userMessage
      );

      console.error(
        '📦 Contexto enviado:',
        contextWords
      );

      console.error(
        '🤖 Modelo:',
        GPT_MODEL
      );

      console.error(
        '\n💥 Erro:',
        err
      );

      console.error(
        '\n📚 Stack:',
        err.stack
      );

      console.error(
        '======================================================\n'
      );

      return {
        erro: 'Falha ao chamar GPT classificador',
        detalhe: err?.message || String(err)
      };
    }


    // ========================================================
    // PARSE DA CLASSIFICAÇÃO
    // ========================================================

    let quickJSON =
      quickResponse
        ?.choices?.[0]
        ?.message
        ?.content;

    if (!quickJSON) {

      console.error(
        '❌ [GPT CLASSIFICADOR] Resposta vazia.'
      );

      return '⚠️ Não consegui identificar o tipo de comando.';
    }

    quickJSON =
      quickJSON
        .replace(/```json\s*|```/g, '')
        .trim();

    let classification;

    try {

      classification =
        JSON.parse(quickJSON);

    } catch (err) {

      console.error(
        '❌ Erro ao parsear classificação GPT:',
        quickJSON
      );

      return '⚠️ Não consegui identificar o tipo de comando.';
    }


    // ========================================================
    // VALIDA CLASSIFICAÇÃO
    // ========================================================

    const classificationValidation =
      validateClassification(
        classification
      );

    if (!classificationValidation.valido) {

      return classificationValidation.mensagem;
    }

    const {
      modulo,
      action,
      id
    } = classification;


    // ========================================================
    // DELETE
    //
    // Delete não precisa de uma segunda interpretação GPT.
    // ========================================================

    if (action === 'delete') {

      if (
        id === null ||
        id === undefined ||
        id === ''
      ) {

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


    // ========================================================
    // 2. OBTÉM O PROMPT ESPECÍFICO
    // ========================================================

    let prompt = '';


    switch (action) {

      case 'create':

        prompt =
          await getCreatePrompt(
            modulo,
            userMessage
          );

        break;


      case 'edit': {

        const result =
          await getEditPrompt(
            modulo,
            userMessage,
            id,
            userPhone
          );

        /*
         * Alguns casos do edit podem ser resolvidos
         * diretamente pelo case, por exemplo:
         *
         * - registro não encontrado;
         * - ID inválido;
         * - erro ao buscar dados atuais.
         *
         * Nesse caso o case retorna uma resposta pronta.
         */

        if (
          result &&
          typeof result === 'object'
        ) {

          return result;
        }

        prompt = result;

        break;
      }


      case 'list':

        prompt =
          await getListPrompt(
            modulo,
            userMessage
          );

        break;


      case 'pdf':

        prompt =
          await getPdfPrompt(
            modulo,
            userMessage
          );

        break;


      default:

        return '⚠️ Ação não reconhecida.';
    }


    if (!prompt) {

      return {
        erro: 'Prompt não definido',
        modulo,
        action
      };
    }


    // ========================================================
    // 3. SEGUNDA CHAMADA GPT
    //
    // Aqui o GPT NÃO decide novamente:
    // - módulo
    // - ação
    // - ID
    //
    // Ele apenas interpreta os dados necessários para
    // executar a ação já classificada.
    // ========================================================

    prompt = `${prompt}

IMPORTANTE:
O módulo, a ação e o identificador já foram definidos pelo classificador.

Módulo: ${modulo}
Ação: ${action}
ID: ${id ?? 'null'}

Não altere o módulo.
Não altere a ação.
Não altere o ID.
Interprete somente os dados necessários para executar a ação.

Retorne exclusivamente JSON válido.`;


    let completion;

    try {

      completion =
        await openai.chat.completions.create({

          model: GPT_MODEL,

          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],

          response_format: {
            type: 'json_object'
          }
        });

    } catch (err) {

      console.error(
        '\n======================================================'
      );

      console.error(
        '🔥 [GPT INTERPRETADOR] ERRO AO CHAMAR OPENAI'
      );

      console.error(
        '======================================================'
      );

      console.error(
        '📩 Mensagem original:',
        userMessage
      );

      console.error(
        '📦 Módulo:',
        modulo
      );

      console.error(
        '⚙️ Action:',
        action
      );

      console.error(
        '🆔 ID:',
        id
      );

      console.error(
        '🤖 Modelo:',
        GPT_MODEL
      );

      console.error(
        '\n💥 Erro:',
        err
      );

      console.error(
        '\n📚 Stack:',
        err.stack
      );

      console.error(
        '======================================================\n'
      );

      return {
        erro: 'Falha ao chamar GPT',
        detalhe: err?.message || String(err),
        modulo,
        action
      };
    }


    // ========================================================
    // PARSE DO SEGUNDO GPT
    // ========================================================

    let content =
      completion
        ?.choices?.[0]
        ?.message
        ?.content;

    if (!content) {

      console.error(
        '❌ [GPT INTERPRETADOR] Resposta vazia.'
      );

      return {
        erro: 'GPT não retornou dados',
        modulo,
        action
      };
    }

    content =
      content
        .trim()
        .replace(/```json\s*|```/g, '')
        .trim();

    let gptData;

    try {

      gptData =
        JSON.parse(content);

    } catch (parseErr) {

      console.error(
        '\n======================================================'
      );

      console.error(
        '❌ [GPT] ERRO AO FAZER JSON.parse()'
      );

      console.error(
        '======================================================'
      );

      console.error(
        '📩 Mensagem original:',
        userMessage
      );

      console.error(
        '📦 Módulo:',
        modulo
      );

      console.error(
        '⚙️ Action:',
        action
      );

      console.error(
        '🆔 ID:',
        id
      );

      console.error(
        '\n📥 JSON QUE O GPT DEVOLVEU:'
      );

      console.error(content);

      console.error(
        '\n💥 ERRO DO JSON.parse:'
      );

      console.error(
        parseErr.message
      );

      console.error(
        '\n📚 STACK DO ERRO:'
      );

      console.error(
        parseErr.stack
      );

      console.error(
        '======================================================\n'
      );

      return {
        erro: 'JSON inválido retornado pelo GPT',
        raw: content
      };
    }


    // ========================================================
    // FORÇA O RESULTADO DA CLASSIFICAÇÃO
    //
    // O segundo GPT não pode mudar a decisão do primeiro.
    // ========================================================

    gptData.modulo =
      modulo;

    gptData.action =
      action;

    if (
      id !== null &&
      id !== undefined
    ) {

      gptData.id =
        id;
    }


    // ========================================================
    // NORMALIZA DATAS DA AGENDA
    // ========================================================

    gptData =
      normalizeAgendaDates(
        gptData
      );


    // ========================================================
    // EXECUÇÃO
    // ========================================================

    switch (modulo) {

      // ======================================================
      // AGENDA
      // ======================================================

      case 'agenda':

        switch (action) {

          case 'create':

            return await executeCreate(
              gptData,
              userPhone
            );

          case 'edit':

            return await executeEdit(
              gptData,
              userPhone
            );

          case 'list':

            return await executeList(
              gptData,
              userPhone
            );

          default:

            return '⚠️ Ação de agenda não reconhecida.';
        }


      // ======================================================
      // ORÇAMENTO
      // ======================================================

      case 'orcamento':

        switch (action) {

          case 'create':

            return await executeCreate(
              gptData,
              userPhone
            );

          case 'edit':

            return await executeEdit(
              gptData,
              userPhone
            );

          case 'list':

            return await executeList(
              gptData,
              userPhone
            );

          case 'pdf':

            return await executePdf(
              gptData,
              userPhone
            );

          default:

            return '⚠️ Ação de orçamento não reconhecida.';
        }


      // ======================================================
      // DESPESAS
      // ======================================================

      case 'despesas':

        switch (action) {

          case 'create':

            return await executeCreate(
              gptData,
              userPhone
            );

          case 'edit':

            return await executeEdit(
              gptData,
              userPhone
            );

          case 'list':

            return await executeList(
              gptData,
              userPhone
            );

          default:

            return '⚠️ Ação de despesa não reconhecida.';
        }


      default:

        return '⚠️ Não entendi se é AGENDA, ORÇAMENTO ou DESPESAS.';
    }

  } catch (err) {

    console.error(
      '💥 Erro em processCommand:',
      err
    );

    return '⚠️ Erro interno ao processar comando.';
  }
}


module.exports = {
  processCommand
};