const { handleGPTCommand } = require('./handleGPTCommand');
const handleOrcamentoCommand = require('./handleOrcamentoCommand');
const handleAgendaCommand = require('./handleAgendaCommand');
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
Analise a frase e retorne apenas JSON:
{
  "modulo": "orcamento" | "agenda",
  "action": "create" | "edit" | "delete" | "list" | "pdf",
  "id": número de 10 dígitos ou null "nao e telefone"
}
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
    console.log("🧠 Classificação GPT:", classification);

    // 2️⃣ Gera o JSON final a partir do novo handler
    const gptData = await handleGPTCommand(userMessage, modulo, action, id);

    // Garante que módulo e ação do classificador são mantidos
    gptData.modulo ??= modulo;
    gptData.action ??= action;
    if (!gptData.id && id) gptData.id = id;

    console.log("🧩 GPT Parsed JSON:", gptData);

    // 3️⃣ Direciona execução
    switch (gptData.modulo) {
      case "agenda":
        return await handleAgendaCommand(gptData, userPhone);
      case "orcamento":
        return await handleOrcamentoCommand(gptData, userPhone);
      default:
        return "⚠️ Não entendi se é AGENDA ou ORÇAMENTO.";
    }

  } catch (err) {
    console.error("Erro em processCommand:", err);
    return "⚠️ Erro interno ao processar comando.";
  }
}

module.exports = { processCommand };