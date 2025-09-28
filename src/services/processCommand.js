// services/agendaService.js
const openai = require('./openai');
const supabase = require('./supabase');
const handleOrcamentoCommand = require('./handleOrcamentoCommand');
const handleAgendaCommand = require('./handleAgendaCommand');
const { getNowBRT } = require('./utils');

// Processa comandos de agenda recebidos do WhatsApp
async function processCommand(text, userPhone) {
  try {
    const gptPrompt = `
Você é um assistente de automação comercial.
A data e hora atual é ${getNowBRT().toFormat("yyyy-MM-dd HH:mm:ss")}.
Você entende comandos de *agenda* ou *orcamentos* e converte em JSON válido.
Para AGENDA:
{
  "modulo": "agenda",
  "action": "create" | "list" | "delete",
  "title": "Somente nome do cliente ou do local",
  "datetime": "Data/hora ISO no GMT-3",
  "reminder_minutes": número (default 30),
  "start_date": "Data/hora início ISO (GMT-3)",
  "end_date": "Data/hora fim ISO (GMT-3)"
}
Para ORÇAMENTO:
{
  "modulo": "orcamento",
  "action": "create" | "list" | "edit" | "delete" | "pdf",
  "id": "Número do orçamento (para list/edit/delete/pdf)",
  "nome_cliente": "obrigatório em create",
  "telefone_cliente": "obrigatório em create",
  "descricao_atividades": "opcional",
  "materiais": [{"nome": "string", "qtd": número, "unidade": "string", "valor": número}], // para criar ou editar lista toda. 
  "servicos": [{"nome": "string", "valor": número}] // para criar ou editar lista toda. 
Para edição granular:
  "add_materiais": [{"nome": "string", "qtd": número, "unidade": "string", "valor": número}],
  "remove_materiais": [{"nome": "string"}],
  "edit_materiais": [{"nome": "string", "qtd": número?, "unidade": "string?", "valor": número?}],
  "add_servicos": [{"nome": "string", "valor": número}],
  "remove_servicos": [{"nome": "string"}],
  "edit_servicos": [{"nome": "string", "valor": número?}],
  "desconto_materiais": "opcional",
  "desconto_servicos": "opcional"
}
Regras ORÇAMENTO:
- Em "list", **se fornecido "nome_cliente, orçamento_numero, telefone_cliente"**.
- Em "edit":
   - Se vier "materiais" ou "servicos", substituem a lista inteira.
   - Se vier "add_", "remove_" ou "edit_", aplique apenas sobre os itens especificados.
- No campo "materiais", sempre inclua também "unidade" (ex: "m", "cm", "rolo", "kit", "caixa", "pacote", "dente").
- Sempre responda com JSON válido, sem texto adicional.
- Datas sempre em GMT-3 (Brasil). 

Mensagem do usuário: "\${text}"
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

    // 3️⃣ Checa memória pendente
    const { data: memoria } = await supabase
      .from("memoria_contexto")
      .select("*")
      .maybeSingle();

    if (memoria) {
      const pendente = memoria.dados;
      if (pendente.modulo === "orcamento" && pendente.action === "create" && pendente.falta_telefone) {
        pendente.telefone_cliente = text.trim();
        delete pendente.falta_telefone;
        await supabase.from("memoria_contexto").delete().eq("id", memoria.id);
        return await handleOrcamentoCommand(pendente, userPhone);
      }
    }

    // 4️⃣ Se faltar telefone no novo comando, salvar memória e perguntar
    if (command.modulo === "orcamento" && command.action === "create" && command.falta_telefone) {
      await supabase.from("memoria_contexto").insert([{
        user_id: userPhone,
        tipo: "orcamento_pendente",
        dados: command
      }]);
      return `📞 Qual o telefone do cliente ${command.nome_cliente}?`;
    }

    // 5️⃣ Executa módulo correto
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
