const openai = require('./openai');
const supabase = require('./supabase');
const handleOrcamentoCommand = require('./handleOrcamentoCommand');
const handleAgendaCommand = require('./handleAgendaCommand');
const { getNowBRT } = require('./utils');

// Processa comandos de agenda recebidos do WhatsApp
async function processCommand(text, userPhone) {
  try {
    const gptPrompt = `
Você é um assistente de automação pessoal e comercial. O usuário está no fuso GMT-3 (Brasil).
A data e hora atual é ${getNowBRT().toFormat("yyyy-MM-dd HH:mm:ss")}.
Você entende comandos de agenda ou orçamentos e converte em JSON válido.

📅 Para AGENDA, siga este formato:
{
  "modulo": "agenda",
  "action": "create" | "list" | "delete",
  "title": "Somente nome do cliente ou do local",
  "datetime": "Data/hora ISO no GMT-3",
  "reminder_minutes": número (default 30),
  "start_date": "Data/hora início ISO (GMT-3)",
  "end_date": "Data/hora fim ISO (GMT-3)"
}

💰 Para ORÇAMENTO:
{
  "modulo": "orcamento",
  "action": "create" | "list" | "edit" | "delete" | "pdf",
  "id": número (para edit/delete/pdf, obrigatório nesses casos),
  "nome_cliente": string (obrigatório em create),
  "telefone_cliente": string (obrigatório em create),
  "descricao_atividades": string ou null,

  "add_materiais": [{"nome": "string", "qtd": número, "unidade": "string", "valor": número}],
  "edit_materiais": [{"nome": "string", "qtd": número?, "unidade": "string?", "valor": número?}],
  "remove_materiais": [{"nome": "string"}],

  "add_servicos": [{"nome": "string", "valor": número}],
  "edit_servicos": [{"nome": "string", "valor": número?}],
  "remove_servicos": [{"nome": "string"}],

  "desconto_materiais": número (ex: 10) ou string com porcentagem (ex: "10%") ou null,
"desconto_servicos": número (ex: 10) ou string com porcentagem (ex: "10%") ou null. 
}

Regras importantes para ORÇAMENTO:

1. Nunca use expressões matemáticas (ex: 30 * 4). Use sempre números literais.
2. Campos obrigatórios devem ter valores reais. Campos opcionais podem ser null.
3. Sempre gere JSON válido e completo para o comando solicitado.
4. Para 'edit', 'delete' ou 'pdf', o campo "id" é obrigatório.
5. Para 'create', inclua todos os campos obrigatórios e materiais/serviços fornecidos.
6. Nunca adicione explicações ou textos descritivos no JSON.
7. Para datas, use sempre o formato ISO 8601 em GMT-3.

Mensagem do usuário: "${text}"
`;

    // 1️⃣ Chama GPT
    const gptResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: gptPrompt }],
    });

    let gptJSON = gptResponse.choices[0].message.content;
    gptJSON = gptJSON.replace(/```json\s*|```/g, "").trim();

    // 2️⃣ Parse JSON
    let command;
    try {
      command = JSON.parse(gptJSON);
    } catch (err) {
      console.error("Erro ao parsear JSON do GPT:", gptJSON);
      return "⚠️ Não consegui entender o comando.";
    }

    console.log("🧠 GPT output:", command);

    // 3️⃣ Executa módulo correto
    if (command.modulo === "agenda") {
      return await handleAgendaCommand(command, userPhone);
    } else if (command.modulo === "orcamento") {
      return await handleOrcamentoCommand(command, userPhone);
    } else {
      return "⚠️ Não entendi se é agenda ou orçamento.";
    }

  } catch (err) {
    console.error("Erro em processCommand:", err);
    return "⚠️ Erro interno ao processar comando.";
  }
}

module.exports = {
  processCommand
};