const { getNowBRT } = require('../utils/utils');
const openai = require('./openai');
const supabase = require("./supabase");
const { DateTime } = require('luxon');

async function handleGPTCommand(userMessage, modulo, action, id) {
  let prompt = '';

  switch (`${modulo}_${action}`) {

    // ============================================================
    // 🧾 ORÇAMENTO - CREATE
    //  ============================================================
    case 'orcamento_create': {
  prompt = `
  Você é um assistente comercial. O usuário está criando um novo orçamento.
  Sempre responda **apenas com JSON válido**, sem texto fora do JSON.

  Exemplo:
  {
    "modulo": "orcamento",
    "action": "create",
    "nome_cliente": "string",
    "descricoes": ["texto1", "texto2"] ou [],
    "telefone_cliente": "string",
    "etapa": "negociacao" ou "finalizado" ou "andamento" ou "perdido" ou "aprovado",
    "observacoes": ["Garantia 90 dias", "Pagamento via Pix"] ou [],
    "materiais": [{ "nome": "fio 2,5mm azul", "qtd": 30, "unidade": "m", "valor": 2.5 }],
    "servicos": [{ "titulo": "Instalação de tomada", "quantidade": 10, "valor": 25.0 }],
    "desconto_materiais": "10%" ou "10" ou null,
    "desconto_servicos": "10%" ou "10" ou null
  }

  Regras:
  - Os campos "descricoes", "observacoes" **sempre deve ser um array**, mesmo que vazio ([]).
  - O campo "etapa" deve ser sempre ser enviado.
  - Não inclua expressões matemáticas, apenas números.
  - Campo "unidade" pode ser: "und", "m", "cm", "kit", "caixa", etc.

  Texto: """${userMessage}"""
  `;
  break;
}
    // ============================================================
    // ✏️ ORÇAMENTO - EDIT
    // ============================================================
    case 'orcamento_edit': {
  if (!id) return { error: "⚠️ É necessário informar o ID do orçamento para editar." };

  const { data: currentData, error: fetchError } = await supabase
    .from('orcamentos')
    .select('*')
    .eq('orcamento_numero', id)
    .single();

  if (fetchError || !currentData)
    return { error: `⚠️ Não encontrei o orçamento ID ${id}.` };

  prompt = `
  Você é um assistente comercial que edita JSONs existentes de orçamentos.
  Responda **somente com JSON válido**, sem texto fora do JSON.

  Orçamento atual:
  ${JSON.stringify(currentData, null, 2)}

  Instruções do usuário:
  "${userMessage}"

  Regras:
  - Os campos "descricoes", "observacoes" deve ser sempre um array, mesmo que vazio ([]) Nunca quebre linhas com \\n. deve ser um item separado.
  - Mantenha toda a estrutura original.
  - Atualize apenas o que o usuário pediu (ex: itens, quantidades, descontos, etapa, observações, etc).
  - Campos vazios podem ser null.
  - caso seja solicitado adicionar desconto modifique apenas os campos "desconto_material", "desconto_servicos" não modifique os valores dos itens.
  - Não crie novas colunas.
  - O campo "etapa" (quando alterado) deve ser **uma dessas opções exatamente**:
    "negociacao", "andamento", "aprovado", "perdido", "finalizado".
  - Se o usuário não mencionar a etapa, mantenha o valor atual.
  - Use sempre este formato de estrutura:
  "descricoes": ["texto1", "texto2"] ou [],
  "observacoes": ["Garantia 90 dias", "Pagamento via Pix"] ou [],
  "materiais": [{ "nome": "fio 2,5mm azul", "qtd": 30, "unidade": "m", "valor": 2.5 }],
  "servicos": [{ "titulo": "Instalação de tomada", "quantidade": 10, "valor": 25.0 }],
  "desconto_materiais": "10%" ou "10" ou null,
  "desconto_servicos": "10%" ou "10" ou null

  Retorne o orçamento atualizado.
  `;
  break;
}

    // ============================================================
    // 📋 ORÇAMENTO - LIST
    // ============================================================
    case 'orcamento_list': {
  prompt = `
  Você é um assistente que ajuda a listar orçamentos existentes.
  Responda apenas com JSON válido no formato:

  {
    "modulo": "orcamento",
    "action": "list",
    "id": número ou null,
    "nome_cliente": string ou null,
    "telefone_cliente": string ou null,
    "etapa": "negociacao" | "andamento" | "aprovado" | "perdido" | "finalizado" | "todos"
  }

  Regras:
  - Pelo menos um dos campos (id, nome_cliente, telefone_cliente ou etapa) é obrigatório.
  - etapa deve sempre ter um valor; se não for pedido use o default. Exemplo: "lista os orçamentos de João" → "etapa": "negociacao".
  - Responda **somente com o JSON**, sem texto fora dele.

  Texto: """${userMessage}"""
  `;
  break;
}

    // ============================================================
    // 🗑️ ORÇAMENTO - DELETE
    // ============================================================
    case 'orcamento_delete': {
      prompt = `
      Você é um assistente que exclui orçamentos.
      Retorne apenas JSON válido no formato:

      { "modulo": "orcamento", "action": "delete", "id": número }

      Texto: """${userMessage}"""
      `;
      break;
    }

    // ============================================================
// 📄 ORÇAMENTO - PDF
// ============================================================
case 'orcamento_pdf': {
  prompt = `
  Você é um assistente que gera PDFs de orçamentos. Retorne **apenas JSON válido** no formato abaixo, sem explicações:

{
  "modulo": "orcamento",
  "action": "pdf",
  "id": número,
  "tipo": "Orçamento" | "Ordem de Serviço" | "Relatório Técnico" | "Nota de Serviço" | "Pedido" | "Proposta Comercial" | "Recibo",
  "opcoes": {
    "listaServicos": true,
    "listaMateriais": true,
    "ocultarValorServicos": false,
    "garantia": true,
    "assinaturaCliente": false,
    "assinaturaEmpresa": false
  },
  "valorRecibo": número | null
}

⚠️ Regras:

1. Sempre retorne JSON válido.
2. Se tipo = "Recibo", inclua valorRecibo, se não informado valor use null.
3. Não altere as flags sem instrução explícita do texto:
   - “ocultar materiais | serviços” → lista"Materiais | Servicos": false
   - nunca ocultar materiais e serviços no mesmo pdf
   - Se não houver instrução, use valores defalt do exemplo.

Texto do usuário: """${userMessage}"""
  `;
  break;
}

    // ============================================================
    // 📆 AGENDA - CREATE
    // ============================================================
    case 'agenda_create': {
      prompt = `
      Você é um assistente que cria compromissos de agenda.
      O usuário está no fuso GMT-3 (Brasil).
      A data e hora atual é ${getNowBRT().toFormat("yyyy-MM-dd HH:mm:ss")}.
      Retorne apenas JSON válido.

      {
        "modulo": "agenda",
        "action": "create",
        "title": "string" // use Nome do cliente ou local,
        "datetime": "Data/hora ISO 8601 no GMT-3",
        "reminder_minutes": número (default 30)
      }

      Texto: """${userMessage}"""
      `;
      break;
    }

    // ============================================================
    // 📅 AGENDA - LIST
    // ============================================================
case 'agenda_list': {
  prompt = `
  Você é um assistente que ajuda o usuário a listar eventos da agenda.
  O usuário está no fuso GMT-3 (Brasil).
  A data e hora atual é ${getNowBRT().toFormat("yyyy-MM-dd HH:mm:ss")}.

  Responda apenas com **JSON válido**, no formato:
  {
    "modulo": "agenda",
    "action": "list",
    "title": "string" Nome do cliente/local ou null,
    "start_date": "YYYY-MM-DD",
    "end_date": "YYYY-MM-DD"
  }

  Regras:
  - Sempre preencha **start_date** e **end_date**.
  - Se o usuário mencionar um dia específico (ex: "eventos de amanhã", "dia 8 de setembro"), use o mesmo valor para start e end.
  - Se mencionar um período (ex: "semana que vem", "do dia 10 ao dia 12", "mês passado"), use o intervalo correspondente.
  - Se não mencionar datas, use o dia atual.
  - As datas devem estar no fuso horário do Brasil (America/Sao_Paulo).
  - Formato sempre "YYYY-MM-DD" (sem hora nem offset).
  - Responda **somente com o JSON**, sem texto fora dele.

  Texto: """${userMessage}"""
  `;
  break;
}

    // ============================================================
    // ✏️ AGENDA - EDIT
    // ============================================================
    case 'agenda_edit': {
      if (!id) return { error: "⚠️ É necessário informar o ID do evento para editar." };

      const { data: currentData, error: fetchError } = await supabase
        .from('events')
        .select('*')
        .eq('event_numero', id)
        .single();

      if (fetchError || !currentData)
        return { error: `⚠️ Não encontrei o evento ID ${id}.` };
const dateBRT = DateTime.fromISO(currentData.date, { zone: 'utc' })
    .setZone('America/Sao_Paulo')
    .toISO();

  console.log('📤 date enviado ao GPT (GMT-3):', dateBRT);

      prompt = `
Você é um assistente que edita eventos de uma agenda.
O usuário está no fuso horário GMT-3 (Brasil).

Responda apenas com **JSON válido**, sem texto extra.

Regras obrigatórias:
1️⃣ Todas as datas devem estar em GMT-3 no formato ISO 8601 com offset "-03:00".
2️⃣ Quando o usuário disser algo como "daqui a X minutos", "daqui X horas", "mais tarde", "para amanhã", ou expressões semelhantes:
   - **Sempre use a hora atual (${getNowBRT().toFormat("yyyy-MM-dd HH:mm:ss")}) como ponto de referência.**
   - **Nunca use o campo "date" existente para somar tempo.**
   - sempre inclua o campo boolean "notified" mesmo que no defalt false.
   - Exemplo: se o usuário disser "daqui a 10 minutos", o novo campo "date" deve ser a hora atual + 10 minutos.
3️⃣ Quando o usuário disser uma hora exata ("às 14h", "para 8:30"), substitua apenas a hora no formato GMT-3.
4️⃣ Mantenha a estrutura original do evento e atualize apenas os campos solicitados.


Evento atual:
${JSON.stringify({ ...currentData, date: dateBRT }, null, 2)}

Mensagem do usuário:
"${userMessage}"
`;
      break;
    }

    default:
      return { erro: 'Prompt não definido', modulo, action };
  }

  try {
const completion = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: prompt }]
});

let content = completion.choices[0].message.content.trim();
content = content.replace(/```json\s*|```/g, "").trim();

try {
  const command = JSON.parse(content);

  // 🔹 Log apenas do campo date
  // console.log('🕒 Campo date retornado pelo GPT:', command.date);

  return command;
} catch (parseErr) {
  console.error("❌ Erro ao parsear JSON do GPT:", content);
  return { erro: "JSON inválido retornado pelo GPT", raw: content };
}

  } catch (err) {
    console.error('Erro ao processar GPT:', err);
    return { erro: 'Falha ao chamar GPT', modulo, action };
  }
}

module.exports = { handleGPTCommand };
