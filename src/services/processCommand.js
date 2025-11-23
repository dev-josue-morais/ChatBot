const { handleGPTCommand } = require('./handleGPTCommand');
const handleOrcamentoCommand = require('./handleOrcamentoCommand');
const handleAgendaCommand = require('./handleAgendaCommand');
const handleDespesasCommand = require('./handleDespesasCommand');
const openai = require('./openai');

// 🧠 Função para limitar primeiras palavras (melhor contexto curto)
function getFirstWords(text, limit = 8) {
  return text.trim().split(/\s+/).slice(0, limit).join(' ');
}

async function processCommand(userMessage, userPhone) {
  try {
    // 1️⃣ Classificação rápida (módulo, ação, id)
    const firstWords = getFirstWords(userMessage);

    const classificationPrompt = `
      Analise a frase e Responda **APENAS JSON VÁLIDO**, sem texto fora do JSON.
      {
        "modulo": "orcamento" | "agenda" | "despesas" | "outro",
        "action": "create" | "edit" | "delete" | "list" | "pdf",
        "id": número de 10 dígitos ou null "nao e telefone"
      }
        obs: atendimento/evento = agenda
        - caso a msg não faz sentido use "outro".
      Frase: "${firstWords}"
`;

    const quickResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: classificationPrompt }],
    });

    let quickJSON = quickResponse.choices[0].message.content;
    quickJSON = quickJSON.replace(/```json\s*|```/g, "").trim();

    let classification;
    try {
      classification = JSON.parse(quickJSON);
    } catch (err) {
      console.error("Erro ao parsear classificação GPT:", quickJSON);
      return "⚠️ Não consegui identificar o tipo de comando.";
    }

    const { modulo, action, id } = classification;

    // 🔹 Para DELETE de agenda ou despesas, vamos direto para os handlers
    if ((modulo === 'agenda' || modulo === 'despesas') && action === 'delete' && id) {
      if (modulo === 'agenda') {
        return await handleAgendaCommand({ modulo, action, id }, userPhone);
      } else if (modulo === 'despesas') {
        return await handleDespesasCommand({ modulo, action, id }, userPhone);
      }
    }

    // 🔹 Para os demais comandos, chama o GPT
    const gptData = await handleGPTCommand(userMessage, modulo, action, id);

    gptData.modulo ??= modulo;
    gptData.action ??= action;
    if (!gptData.id && id) gptData.id = id;

    // 3️⃣ Direciona execução
    switch (gptData.modulo) {
      case "agenda":
        return await handleAgendaCommand(gptData, userPhone);
      case "orcamento":
        return await handleOrcamentoCommand(gptData, userPhone);
      case "despesas":
        return await handleDespesasCommand(gptData, userPhone);
      default:
        return "⚠️ Não entendi se é AGENDA, ORÇAMENTO ou DESPESAS.";
    }

  } catch (err) {
    console.error("Erro em processCommand:", err);
    return "⚠️ Erro interno ao processar comando.";
  }
}

module.exports = { processCommand };