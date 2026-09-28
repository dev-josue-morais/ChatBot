const { handleGPTCommand } = require('./handleGPTCommand');
const handleOrcamentoCommand = require('./handleOrcamentoCommand');
const handleAgendaCommand = require('./handleAgendaCommand');
const handleDespesasCommand = require('./handleDespesasCommand');
const openai = require('./openai');

// 🧠 Função para limitar contexto: 20 primeiras + 10 últimas palavras
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

    // 1️⃣ CLASSIFICAÇÃO RÁPIDA

    const contextWords = getContextWords(userMessage);

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
        model: "gpt-4o-mini",
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
        .replace(/```json\s*|```/g, "")
        .trim();

    let classification;

    try {

      classification =
        JSON.parse(quickJSON);

    } catch (err) {

      console.error(
        "Erro ao parsear classificação GPT:",
        quickJSON
      );

      return "⚠️ Não consegui identificar o tipo de comando.";
    }

    const {
      modulo,
      action,
      id
    } = classification;


    // ======================================================
    // 🗑️ DELETE DIRETO
    // ======================================================

    // Para DELETE de agenda ou despesas,
    // vamos direto para os handlers.

    if (
      (modulo === 'agenda' ||
       modulo === 'despesas') &&
      action === 'delete' &&
      id
    ) {

      if (modulo === 'agenda') {

        return await handleAgendaCommand(
          { modulo, action, id },
          userPhone
        );

      } else if (modulo === 'despesas') {

        return await handleDespesasCommand(
          { modulo, action, id },
          userPhone
        );
      }
    }


    // 🧠 GPT COMPLETO

    const gptData =
  await handleGPTCommand(
    userMessage,
    modulo,
    action,
    id,
    userPhone
  );
if (gptData?.error) {
  return gptData.error;
}

    gptData.modulo ??= modulo;
    gptData.action ??= action;

    if (!gptData.id && id) {
      gptData.id = id;
    }


    // ======================================================
    // 🚦 DIRECIONAMENTO
    // ======================================================

    switch (gptData.modulo) {

      case "agenda":

        return await handleAgendaCommand(
          gptData,
          userPhone
        );

      case "orcamento":

        return await handleOrcamentoCommand(
          gptData,
          userPhone
        );

      case "despesas":

        return await handleDespesasCommand(
          gptData,
          userPhone
        );

      default:

        return "⚠️ Não entendi se é AGENDA, ORÇAMENTO ou DESPESAS.";
    }

  } catch (err) {

    console.error(
      "Erro em processCommand:",
      err
    );

    return "⚠️ Erro interno ao processar comando.";
  }
}

module.exports = {
  processCommand
};