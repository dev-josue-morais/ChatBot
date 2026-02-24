const { getNowBRT } = require('../utils/utils');
const openai = require('./openai');
const supabase = require("./supabase");
const { DateTime } = require('luxon');

async function handleGPTCommand(rawMessage, modulo, action, id) {
    const userMessage = (rawMessage || "").trim();
    let prompt = '';

    // 🆕 Função NOW com dia da semana
    function nowWithWeekday() {
        const now = getNowBRT();
        const weekday = now.setLocale('pt').toFormat('cccc');
        return `Hoje é ${weekday}, ${now.toFormat("yyyy-MM-dd HH:mm:ss")}`;
    }

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
    "descricoes": ["texto1", "texto2"] | [],
    "telefone_cliente": "string",
    "etapa": "negociacao" ou "finalizado" ou "andamento" ou "perdido" ou "aprovado", // defalt "negociacao"
    "observacoes": ["Garantia 90 dias", "Pagamento via Pix"] | [],
    "materiais": [{ "nome": "fio 2,5mm azul", "qtd": 30, "unidade": "m", "valor": 2.5 }] | [],
    "servicos": [{ "titulo": "Instalação de tomada", "quantidade": 10, "valor": 25.0 }] | [],
    "desconto_materiais": number | "10%" | null,
    "desconto_servicos": number | "10%" | null
  }

  Regras
  - Não inclua expressões matemáticas, apenas números.
  - Campo "unidade" pode ser: "und", "m", "cm", "kit", "caixa", etc.
  - se o valor não for informado use 0.
  - sempre utilize os nomes dos itens (serviço , materiais) completos fornecidos no texto.
  - sempre separe os itens (ex: 25m cada fio 4mm sendo azul e verde = 25m fio 4mm azul, 25m fio 4mm verde)
  - Valores monetários devem ser números usando ponto como decimal (ex: 10.20).
  - caso seja solicitado adicionar desconto modifique apenas: "desconto_materiais", "desconto_servicos" usando valores como "40" ou "4.5%""10%" etc, não modifique valores dos serviços ou materiais.

  Texto: """${userMessage}"""
  `;
            break;
        }

        // ============================================================
        // ✏️ ORÇAMENTO - EDIT
        // ============================================================
        case 'orcamento_edit': {
  // console.log(rawMessage, modulo, action, id)
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
  Exemplo:
  {
    "modulo": "orcamento",
    "action": "edit",
    "orcamento_numero": número, // ex = 1051225001
    "nome_cliente": "string",
    "descricoes": ["texto1", "texto2"] ou [],
    "telefone_cliente": "string",
    "etapa": "negociacao" ou "finalizado" ou "andamento" ou "perdido" ou "aprovado",
    "observacoes": ["Garantia 90 dias", "Pagamento via Pix"] ou [],
    "materiais": [{ "nome": "fio 2,5mm azul", "qtd": 30, "unidade": "m", "valor": 2.5 }],
    "servicos": [{ "titulo": "Instalação de tomada", "quantidade": 10, "valor": 25.0 }],
    "desconto_materiais": number | "10%" | null,
    "desconto_servicos": number | "10%" | null
  }

  Orçamento atual:
  ${JSON.stringify(currentData, null, 2)}

  Instruções do usuário:
  "${userMessage}"

  Regras:
  - Mantenha toda a estrutura original Atualize apenas o que o usuário pediu.
  - Campos vazios podem ser null.
  - caso seja solicitado adicionar desconto modifique apenas: "desconto_materiais", "desconto_servicos" usando valores como "40" ou "4.5%""10%" etc, não modifique valores dos serviços ou materiais.
  - sempre utilize os nomes dos itens (serviço , materiais) completos fornecidos no texto.
  - Campo "unidade" pode ser: "und", "m", "cm", "kit", "caixa", etc.
  - se o valor não for informado use 0.
  - Não crie novas colunas.
  - sempre separe os itens(ex: 25m cada fio 4mm sendo azul e verde = 25m fio 4mm azul, 25m fio 4mm verde)
  - Valores monetários devem ser números usando ponto como decimal (ex: 10.20).

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
O usuário está no fuso GMT-3 (Brasil).
${nowWithWeekday()}
  Responda apenas com JSON válido no seguinte formato:

  {
    "modulo": "orcamento",
    "action": "list",
    "id": número ou null,
    "nome_cliente": string ou null,
    "telefone_cliente": string ou null,
    "etapa": "negociacao" | "andamento" | "aprovado" | "perdido" | "finalizado" | "todos",
    "periodo_start": "YYYY-MM-DD",
    "periodo_end": "YYYY-MM-DD",
    "periodo_texto": string
  }

  Regras importantes:
  - Pelo menos um dos campos (id, nome_cliente, telefone_cliente ou etapa) é obrigatório.
  - Se a etapa não for mencionada, use "negociacao", so Use "todos" apenas se o usuário pedir explicitamente.
  - O período é sempre obrigatório. Se o usuário não pedir → usar últimos 30 dias.
  - "periodo_texto" deve sempre conter uma descrição humana do período solicitado, como: "últimos 6 meses", "de 10 a 20 de março", "ano de 2024", "todo o período", etc.

  Texto do usuário: """${userMessage}"""
  `;
    break;
}

        // ============================================================
        // 🗑️ ORÇAMENTO - DELETE
        // ============================================================
        case 'orcamento_delete': {
            prompt = `
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
  Você é um assistente que gera PDFs.
  Responda **somente com JSON válido**:

{
  "modulo": "orcamento",
  "action": "pdf",
  "id": número,
  "tipo": "Orçamento" | "Ordem de Serviço" | "Relatório Técnico" | "Nota de Serviço" | "Pedido" | "Proposta Comercial" | "Recibo", // defalt "Orçamento"
  "opcoes": {
    "listaServicos": true, // se tipo = "Pedido" false.
    "listaMateriais": true,
    "ocultarValorServicos": false,
    "garantia": true,
    "assinaturaCliente": false,
    "assinaturaEmpresa": false
  },
  "valorRecibo": número | null
}

Texto: """${userMessage}"""
⚠️ Regras:

1. Sempre retorne JSON válido.
2. Se tipo = "Recibo", inclua valorRecibo, se não informado valor use null. 
3. Não altere as flags sem instrução explícita do texto:
   - “ocultar materiais | serviços” → lista"Materiais | Servicos": false
   - nunca ocultar materiais e serviços no mesmo pdf
   - Se não houver instrução, use valores defalt do exemplo.
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
${nowWithWeekday()}

Retorne apenas JSON válido.

{
  "modulo": "agenda",
  "action": "create",
  "title": "string", // nome ou local 
  "datetime": "Data/hora ISO 8601 no GMT-3",
  "reminder_minutes": número (default 30) // lembrete em minutos 
}

Texto: """${userMessage}"""
`;
            break;
        }

        // ============================================================
        // 📅 AGENDA - LIST (NOW atualizado)
        // ============================================================
case 'agenda_list': {
  prompt = `
Você é um assistente que lista eventos da agenda.
O usuário está no fuso GMT-3 (Brasil).
${nowWithWeekday()}

Responda apenas com JSON válido:

{
  "modulo": "agenda",
  "action": "list",
  "title": "string" ou null,
  "id": "number" ou null,
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD"
}

Regras importantes:

1. **ID sempre prevalece sobre título**
   - preencher Se o usuário mencionar um ID (ex: "1171125001"),
   - Quando "id" estiver preenchido, "title" deve ser null.

2. **Título**
   - Só preencha "title" se o usuário citar (nome ou local)
   - Não trate números como título.

3. **Datas**
   - Sempre preencher "start_date" e "end_date".
   - Se o usuário citar dias como "amanhã", "sábado", etc → usar exatamente esse dia.
   - Se citar um período ("de segunda a sexta") → gerar um intervalo correspondente.
   - Se não falar nada sobre data → usar a data de hoje para ambos.

4. Não invente nada. Analise somente o texto fornecido.

Texto: """${userMessage}"""
`;
  break;
}
        // ============================================================
        // ✏️ AGENDA - EDIT  (NOW atualizado)
        // ============================================================
        case 'agenda_edit': {
// console.log('hoje enviado ao gpt:', nowWithWeekday());
            if (!id)
                return { error: "⚠️ É necessário informar o ID do evento para editar." };

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

            prompt = `
Você é um assistente que edita eventos de uma agenda.
${nowWithWeekday()}

Retorne apenas JSON válido.

{
  "modulo": "agenda",
  "action": "edit",
  "title": "string", // nome ou local 
  "datetime": "Data/hora ISO 8601 no GMT-3",
  "reminder_minutes": número (default 30) // lembrete em minutos.
}

Regras obrigatórias:
 Todas as datas em GMT-3 com offset "-03:00".
 Para "daqui X minutos/horas", "amanhã", "mais tarde":
    • SEMPRE use a hora atual como base da soma.
 Para horário exato ("às 14h" ou "7:40"): Só substitua a hora.
 atualizar a data solicitada conforme semana ou dia.
 Mantenha a estrutura original.


Evento atual:
${JSON.stringify({ ...currentData, date: dateBRT }, null, 2)}

Mensagem do usuário:
"${userMessage}"
`;
            break;
        }

        // ============================================================
        // DESPESAS
        // ============================================================
        case 'despesas_create': {
            prompt = `
Você é um assistente financeiro que registra despesas.
Retorne apenas JSON válido.

{
  "modulo": "despesas",
  "action": "create",
  "tipo": "conducao" | "materiais" | "outras",
  "valor": número,
  "descricao": "string"
}

Texto: """${userMessage}"""
`;
            break;
        }

        case 'despesas_edit': {
            if (!id) return { error: "⚠️ Informe o ID da despesa." };

            const { data: currentData } = await supabase
                .from('despesas')
                .select('*')
                .eq('despesa_numero', id)
                .single();

            if (!currentData)
                return { error: `⚠️ Despesa ID ${id} não encontrada.` };

            prompt = `
Você é um assistente financeiro que edita despesas.
Responda com JSON válido.

Despesa atual:
${JSON.stringify(currentData, null, 2)}

Instruções do usuário:
"${userMessage}"

Regras:
- Atualize apenas campos mencionados.
- tipo deve ser: "conducao", "materiais", "outras".
`;
            break;
        }

        case 'despesas_list': {
            prompt = `
Você é um assistente financeiro que lista despesas.
${nowWithWeekday()}

Retorne apenas JSON válido:

{
  "modulo": "despesas",
  "action": "list",
  "tipo": "conducao" | "materiais" | "outras" | "todos",
  "start_date": "ISO GMT-3",
  "end_date": "ISO GMT-3"
}

Texto: """${userMessage}"""
`;
            break;
        }

        case 'despesas_pdf': {
            prompt = `
Você é um assistente financeiro que gera PDFs de despesas.
${nowWithWeekday()}

Retorne JSON válido:

{
  "modulo": "despesas",
  "action": "pdf",
  "tipo": "conducao" | "materiais" | "outras" | "alimentacao" | "todos",
  "start_date": "ISO GMT-3",
  "end_date": "ISO GMT-3"
}

Texto: """${userMessage}"""
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
            console.error("❌ JSON inválido retornado pelo GPT:", content);
            return { erro: "JSON inválido retornado pelo GPT", raw: content };
        }

    } catch (err) {
        console.error('Erro ao processar GPT:', err);
        return { erro: 'Falha ao chamar GPT', modulo, action };
    }
}

module.exports = { handleGPTCommand };