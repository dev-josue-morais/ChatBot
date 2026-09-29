const { DateTime } = require('luxon');
const openai = require('./openai');
const { getCreatePrompt, executeCreate } = require('../cases/create');
const { getEditPrompt, executeEdit } = require('../cases/edit');
const { getListPrompt, executeList } = require('../cases/list');
const { getPdfPrompt, executePdf } = require('../cases/pdf');
const { executeDelete } = require('../cases/delete');
const { getContextWords } = require('../utils/processFunctions');

function getContextWords(text) {

  const words = text.trim().split(/\s+/);

  if (words.length <= 30) {
    return words.join(' ');
  }

  const first = words.slice(0, 20);
  const last = words.slice(-10);

  return [...first, ...last].join(' ');
}

async function processCommand(userMessage, userPhone) {

  try {

    userMessage = (userMessage || '').trim();

    const contextWords =
      getContextWords(userMessage);

    const classificationPrompt = `
Analise a mensagem e responda apenas com JSON válido, sem texto fora do JSON.

{
  "modulo": "orcamento" | "agenda" | "despesas" | "outro",
  "action": "create" | "edit" | "delete" | "list" | "pdf",
  "id": número | null
}

Identifique primeiro o módulo:

- "orcamento": orçamento, proposta, cotação, cliente, materiais, serviços, orçamento em negociação, orçamento finalizado etc.
- "agenda": atendimento, evento, compromisso, visita, reunião, horário, agendamento etc.
- "despesas": gasto, despesa, gasolina, combustível, material comprado, alimentação, condução, estacionamento, Uber, pedágio, pagamento de despesa etc.
- atendimento/evento/agendamento = agenda.
- Se a mensagem não fizer sentido ou não pertencer a nenhum módulo, use "outro".

Identifique a ação:

- create = criar, adicionar, cadastrar, marcar, lançar novo.
- edit = alterar, editar, corrigir, mudar, atualizar.
- delete = excluir, apagar, remover, cancelar.
- list = listar, mostrar, consultar, buscar, ver, resumo, relatório, total, quanto gastei etc.
- pdf = gerar, enviar, imprimir ou criar PDF.

Regras do PDF:

- PDF é disponível somente para "orcamento".
- Se o usuário solicitar PDF de orçamento, action = "pdf".
- Despesas não possuem geração de PDF.
- Agenda não possui geração de PDF.
- Se pedir resumo, relatório, total ou quanto gastou em despesas, action = "list".

Identificador:

- Se houver um número que claramente identifica um registro existente, coloque-o em "id".
- Os identificadores normalmente são números longos, por exemplo: 1060626002.
- Conforme o módulo:
  * orçamento → orcamento_numero
  * agenda → event_numero
  * despesas → despesa_numero
- Use sempre "id" para transportar o identificador, independentemente do nome da coluna no banco.
- Não transforme o número, não remova zeros internos e não faça cálculos.
- Se não houver identificador de registro, use "id": null.
- Não confunda telefone, valor, quantidade, data ou horário com identificador.
- Quando houver mais de um número, analise o contexto para identificar qual é o número do registro.
- Não invente identificadores.

O campo "id" representa o identificador do registro relacionado ao comando.

- orçamento → id ou orcamento_numero
- agenda → event_numero
- despesas → despesa_numero

Mensagem:
"${contextWords}"
`;

    const quickResponse =
      await openai.chat.completions.create({

        model: 'gpt-4o-mini',

        messages: [
          {
            role: 'user',
            content: classificationPrompt
          }
        ],

        response_format: {
          type: 'json_object'
        }
      });

    let quickJSON =
      quickResponse.choices[0].message.content;

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

    const {
      modulo,
      action,
      id
    } = classification;

    if (
      modulo !== 'agenda' &&
      modulo !== 'orcamento' &&
      modulo !== 'despesas'
    ) {

      return '⚠️ Não entendi se é AGENDA, ORÇAMENTO ou DESPESAS.';
    }

    if (action === 'delete') {

      if (!id) {

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

    let prompt = '';

    switch (action) {

      case 'create':

        prompt = await getCreatePrompt(
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

        prompt = await getListPrompt(
          modulo,
          userMessage
        );

        break;

      case 'pdf':

        prompt = await getPdfPrompt(
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

    prompt = `${prompt}

Retorne a resposta exclusivamente em JSON válido.`;

    let completion;

    try {

      completion =
        await openai.chat.completions.create({

          model: 'gpt-4o-mini',

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
      console.error( '\n======================================================' );
      console.error(
        '🔥 [GPT] ERRO AO CHAMAR OPENAI' );
       console.error( '======================================================' );
      console.error( '📩 Mensagem original:', userMessage );
      console.error( '📦 Módulo:', modulo );
      console.error( '⚙️ Action:', action );
      console.error( '🆔 ID:', id );
      console.error( '\n💥 Erro:', err );
      console.error( '\n📚 Stack:', err.stack );
      console.error( '======================================================\n' );

      return {
        erro: 'Falha ao chamar GPT',
        detalhe: err?.message || String(err),
        modulo,
        action
      };
    }

    let content =
      completion.choices[0].message.content.trim();

    content =
      content
        .replace(/```json\s*|```/g, '')
        .trim();

    let gptData;

    try {
      gptData =
        JSON.parse(content);

    } catch (parseErr) {

      console.error( '\n======================================================' );
      console.error(
        '❌ [GPT] ERRO AO FAZER JSON.parse()'
      ); console.error( '======================================================' );
      console.error( '📩 Mensagem original:' );
      console.error(userMessage);
      console.error( '\n📦 Módulo:', modulo );
      console.error( '⚙️ Action:', action );
      console.error( '🆔 ID:', id );
      console.error( '\n📥 JSON QUE O GPT DEVOLVEU:' );
      console.error(content);
      console.error( '\n💥 ERRO DO JSON.parse:' );
      console.error(parseErr.message);
      console.error( '\n📚 STACK DO ERRO:' );
      console.error(parseErr.stack);
      console.error( '======================================================\n' );

      return {
        erro: 'JSON inválido retornado pelo GPT',
        raw: content
      };
    }

    gptData.modulo ??= modulo;
    gptData.action ??= action;

    if (!gptData.id && id) {
      gptData.id = id;
    }

    if (gptData.modulo === 'agenda') {

      if (gptData.datetime) {

        gptData.datetime =
          DateTime
            .fromISO(
              gptData.datetime,
              {
                zone: 'America/Sao_Paulo'
              }
            )
            .toUTC()
            .toISO();
      }

      if (gptData.start_date) {

        gptData.start_date =
          DateTime
            .fromISO(
              gptData.start_date,
              {
                zone: 'America/Sao_Paulo'
              }
            )
            .toISO({
              includeOffset: false
            });
      }

      if (gptData.end_date) {

        gptData.end_date =
          DateTime
            .fromISO(
              gptData.end_date,
              {
                zone: 'America/Sao_Paulo'
              }
            )
            .toISO({
              includeOffset: false
            });
      }
    }

    switch (gptData.modulo) {

      case 'agenda':

        switch (gptData.action) {

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

          case 'delete':

            return await executeDelete(
              gptData,
              userPhone
            );

          default:

            return '⚠️ Ação de agenda não reconhecida.';
        }

      case 'orcamento':

        switch (gptData.action) {

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

          case 'delete':

            return await executeDelete(
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

      case 'despesas':

        switch (gptData.action) {

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

          case 'delete':

            return await executeDelete(
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

    console.error( '💥 Erro em processCommand:', err );

    return '⚠️ Erro interno ao processar comando.';
  }
}

module.exports = {
  processCommand
};