const { getNowBRT } = require('../utils/utils');
const openai = require('./openai');
const supabase = require("./supabase");

async function handleGPTCommand(userMessage, modulo, action, id) {
  let prompt = '';

  switch (`${modulo}_${action}`) {
    case 'orcamento_create': {
      prompt = `
      Você é um assistente de automação pessoal e comercial. O usuário está no fuso GMT-3 (Brasil).
      A data e hora atual é ${getNowBRT().toFormat("yyyy-MM-dd HH:mm:ss")}.
      Você entende o texto de orçamentos e sempre responda apenas em **JSON válido**.
          
      Exemplo:
      {
        "modulo": "orcamento", "action": "create",
        "nome_cliente": string,
        "telefone_cliente": string,
        "observacoes": ["Garantia 90 dias", "Pagamento via Pix"] ou null, // de 0 a 10 observações para o cliente. 
        "materiais": [{"nome": "string", "qtd": número, "unidade": "string", "valor": número}],
        "servicos": [{ "titulo": "string", "quantidade": número, "valor": número }],
        "desconto_materiais": número ou string com porcentagem (ex: 10 ou "10%") ou null,
        "desconto_servicos": número ou string com porcentagem (ex: 10 ou "10%") ou null
      }
          
      Regras importantes:
          
      1. Nunca use expressões matemáticas ou textos descritivos no JSON.
      2. Datas use formato ISO 8601 em GMT-3.
      3. materiais tem o campo unidade podendo ser diversas formas como "und, m, cm, dente, kit, caixa, etc"
          
      Texto: """${userMessage}"""
      `;
      break;
    }

    case 'orcamento_edit': {
      if (!id) {
        return { error: "⚠️ É necessário informar o ID do orçamento para editar." };
      }

      // 1️⃣ Buscar orçamento atual no Supabase
      const { data: currentData, error: fetchError } = await supabase
        .from('orcamentos')
        .select('*')
        .eq('orcamento_numero', id)
        .single();

      if (fetchError || !currentData) {
        console.error("Erro ao buscar orçamento:", fetchError);
        return { error: `⚠️ Não encontrei o orçamento ID ${id}.` };
      }

      // 2️⃣ Prompt para edição
      prompt = `
      Você é um assistente de automação pessoal e comercial. O usuário está no fuso GMT-3 (Brasil).
      A data e hora atual é ${getNowBRT().toFormat("yyyy-MM-dd HH:mm:ss")}.
      Você recebe e **edita** o JSON existente conforme as instruções do usuario.
      Responda **apenas com JSON válido**, sem texto extra.
          
      Orçamento atual:
      ${JSON.stringify(currentData, null, 2)}
          
      Mensagem do usuário:
      "${userMessage}"
          
      Retorne o mesmo orçamento em JSON, **mantendo toda a estrutura original nao crie colunas**, 
      mas ajustando conforme o que o usuário pediu (adicionar/remover itens, alterar quantidades, etc.).
      a coluna "descricao_atividades: []", corresponde a "observações".
      Não altere campos que não foram mencionados.
      `;

      break;
    }

    case 'orcamento_list': {
      prompt = `
      Você é um assistente de automação pessoal e comercial. O usuário quer listar os orcamentos no supabase,
      Você entende texto e sempre responde apenas em **JSON válido**.

      {
        "modulo": "orcamento",
        "action": "list",
        "id": número ou null,
        "nome_cliente": string ou null,
        "telefone_cliente": string ou null
      }

      importante um dos campos e obrigatorio id,nome_cliente ou telefone_cliente.
      Texto: """${userMessage}"""
      `;
      break;
    }

    case 'orcamento_delete': {
      prompt = `
      Você é um assistente que exclui orçamentos.
      Retorne apenas **JSON válido**:
      { "modulo": "orcamento", "action": "delete", "id": numero }
      Texto: """${userMessage}"""
      `;
      break;
    }

    case 'orcamento_pdf': {
      prompt = `
      Você é um assistente que gera PDF de um orçamento,
      Retorne apenas **JSON válido**:
      {
        "modulo": "orcamento",
        "action": "pdf",
        "id": número "obrigatório",
        "tipo": "Orçamento" defalt | "Ordem de Serviço" | "Relatório Técnico" | "Nota de Serviço" | "Pedido" | "Proposta Comercial",
      "opcoes": {
        "listaServicos" (true, se tipo=pedido usa false),
        "listaMateriais" (true),
        "ocultarValorServicos" (false),
        "garantia" (true),
        "assinaturaCliente" (false),
        "assinaturaEmpresa" (false)
      }}

      // Para "opcoes" Campos booleanos — valor padrão entre parênteses.

      Texto: """${userMessage}"""
      `;
      break;
    }

    case 'agenda_create': {
      prompt = `
      Você é um assistente que cria compromissos de agenda. O usuário está no fuso GMT-3 (Brasil).
      A data e hora atual é ${getNowBRT().toFormat("yyyy-MM-dd HH:mm:ss")}.
      Você entende comandos de agenda ou orçamentos e sempre responde em **JSON válido**.

      {
        "modulo": "agenda",
        "action": "create",
        "title": "Somente nome do cliente ou do local",
        "datetime": "Data/hora ISO no GMT-3",
        "reminder_minutes": número (default 30)
      }

      Texto: """${userMessage}"""
      `;
            break;
          }
        
    case 'agenda_list': {
      prompt = `
      Você é um assistente para listar agenda. O usuário está no fuso GMT-3 (Brasil).
      A data e hora atual é ${getNowBRT().toFormat("yyyy-MM-dd HH:mm:ss")}.
      responda apenas em **JSON válido**.

      {
        "modulo": "agenda",
        "action": "list",
        "title": "Somente nome do cliente ou do local ou null",
        "datetime": "Data/hora ISO no GMT-3",
        "start_date": "Data/hora início ISO 8601 no GMT-3 (obrigatório mesmo que seja o dia atual)",
        "end_date": "Data/hora fim ISO 8601 no GMT-3 (obrigatório mesmo que seja o dia atual)"
      }
      Texto: """${userMessage}"""
      `;
      break;
    }
    case 'agenda_edit': {
      if (!id) {
        return { error: "⚠️ É necessário informar o ID do evento para editar." };
      }

      // 1️⃣ Buscar orçamento atual no Supabase
      const { data: currentData, error: fetchError } = await supabase
        .from('events')
        .select('*')
        .eq('event_numero', id)
        .single();

      if (fetchError || !currentData) {
        console.error("Erro ao buscar Evento:", fetchError);
        return { error: `⚠️ Não encontrei o evento ID ${id}.` };
      }

      // 2️⃣ Prompt para edição
prompt = `
Você é um assistente de automação pessoal e comercial.
O usuário está no fuso GMT-3 (Brasil). A data e hora atual é ${getNowBRT().toFormat("yyyy-MM-dd HH:mm:ss")}.
Você recebe e **edita** o JSON existente conforme as instruções do usuário.
Responda **apenas com JSON válido**, sem texto extra.

Instruções importantes:
- converta "date" pro formato **UTC ISO 8601**
- Não altere campos que não foram mencionados.

evento atual:
${JSON.stringify(currentData, null, 2)}

Mensagem do usuário:
"${userMessage}"

Retorne o mesmo "evento de agenda" em JSON, mantendo toda a estrutura original, mas ajustando conforme o que o usuário pediu.
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
