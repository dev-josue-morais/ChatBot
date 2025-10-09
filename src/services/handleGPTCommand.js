const { getNowBRT } = require('../utils/utils');
const openai = require('./openai');
const supabase = require("./supabase");

async function handleGPTCommand(userMessage, modulo, action, id) {
  let prompt = '';

  switch (`${modulo}_${action}`) {

    // ============================================================
    // 🧾 ORÇAMENTO - CREATE
    // ============================================================
    case 'orcamento_create': {
      prompt = `
      Você é um assistente comercial. O usuário está criando um novo orçamento.
      Sempre responda **apenas com JSON válido**, sem texto fora do JSON.

      Exemplo:
      {
        "modulo": "orcamento",
        "action": "create",
        "nome_cliente": "string",
        "telefone_cliente": "string",
        "observacoes": ["Garantia 90 dias", "Pagamento via Pix"] ou null,
        "materiais": [{"nome": "string", "qtd": número, "unidade": "string", "valor": número}],
        "servicos": [{"titulo": "string", "quantidade": número, "valor": número}],
        "desconto_materiais": número ou string ("10%" ou 10) ou null,
        "desconto_servicos": número ou string ("10%" ou 10) ou null
      }

      Regras:
      - Não inclua expressões matemáticas, apenas números.
      - Datas não são necessárias neste módulo.
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
      Você é um assistente comercial que ajusta JSONs existentes de orçamentos.
      Responda **somente com JSON válido**, sem texto fora do JSON.

      Orçamento atual:
      ${JSON.stringify(currentData, null, 2)}

      Instruções do usuário:
      "${userMessage}"

      Regras:
      - Mantenha toda a estrutura original.
      - Atualize apenas o que o usuário pediu (ex: itens, quantidades, descontos).
      - Campos vazios podem ser null.
      - Não crie novas colunas.
      - "descricao_atividades" corresponde a "observacoes".

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
        "telefone_cliente": string ou null
      }

      Pelo menos um dos campos (id, nome_cliente ou telefone_cliente) é obrigatório.

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
      Você é um assistente que gera PDFs de orçamentos.
      Retorne apenas **JSON válido** no formato:

      {
        "modulo": "orcamento",
        "action": "pdf",
        "id": número,
        "tipo": "Orçamento" (default) | "Ordem de Serviço" | "Relatório Técnico" | "Nota de Serviço" | "Pedido" | "Proposta Comercial",
        "opcoes": {
          "listaServicos": true,          // se tipo = "Pedido" usar false
          "listaMateriais": true,
          "ocultarValorServicos": false,
          "garantia": true,
          "assinaturaCliente": false,
          "assinaturaEmpresa": false
        }
      }

      Texto: """${userMessage}"""
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
        "title": "Nome do cliente ou local",
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
      Você é um assistente que lista compromissos da agenda.
      O usuário está no fuso GMT-3 (Brasil).
      A data e hora atual é ${getNowBRT().toFormat("yyyy-MM-dd HH:mm:ss")}.
      Responda apenas com JSON válido no formato:

      {
        "modulo": "agenda",
        "action": "list",
        "title": "Nome do cliente/local ou null",
        "start_date": "Data/hora início ISO 8601 no GMT-3 (obrigatória)",
        "end_date": "Data/hora fim ISO 8601 no GMT-3 (obrigatória)"
      }

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

      prompt = `
      Você é um assistente que edita eventos de agenda.
      O usuário está no fuso GMT-3 (Brasil).
      A data e hora atual é ${getNowBRT().toFormat("yyyy-MM-dd HH:mm:ss")}.
      Retorne apenas **JSON válido**, sem texto fora do JSON.

      Instruções:
      - Mantenha a estrutura original do evento.
      - Atualize apenas os campos pedidos pelo usuário.
      - Não converta para UTC, mantenha em GMT-3.

      Evento atual:
      ${JSON.stringify(currentData, null, 2)}

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
      return JSON.parse(content);
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