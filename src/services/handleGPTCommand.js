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
    "materiais": [{ "nome": "fio 2,5mm azul", "qtd": 30, "und": "m", "valor": 2.5 }] | [],
    "servicos": [{ "titulo": "Instalação de tomada", "qtd": 10, "valor": 25.0 }] | [],
    "desconto_materiais": number | "10%" | null,
    "desconto_servicos": number | "10%" | null
  }

  Regras
  - Não inclua expressões matemáticas, apenas números.
  - Campo "und" pode ser: "und", "m", "cm", "kit", "caixa", etc.
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
    "materiais": [{ "nome": "fio 2,5mm azul", "qtd": 30, "und": "m", "valor": 2.5 }],
    "servicos": [{ "titulo": "Instalação de tomada", "qtd": 10, "valor": 25.0 }],
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
  - Campo "und" pode ser: "und", "m", "cm", "kit", "caixa", etc.
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
Você é um assistente que interpreta comandos para LISTAR ORÇAMENTOS.

O usuário está no fuso GMT-3 (Brasil).
${nowWithWeekday()}

Sua função é identificar EXATAMENTE quais filtros o usuário solicitou.

Responda SOMENTE com JSON válido.
NÃO escreva explicações.
NÃO use markdown.
NÃO coloque texto fora do JSON.

FORMATO OBRIGATÓRIO:

{
  "modulo": "orcamento",
  "action": "list",

  "filtros": {
    "por_id": false,
    "por_nome_cliente": false,
    "por_telefone_cliente": false,
    "por_etapa": false,
    "por_periodo": false
  },

  "mostrar_filtros": false,

  "id": null,
  "nome_cliente": null,
  "telefone_cliente": null,
  "etapa": "negociacao" | "finalizado" | "andamento" | "perdido" | "aprovado", // default "negociacao"

  "periodo_start": null,
  "periodo_end": null,
  "periodo_texto": null
}

============================================================
REGRAS
============================================================

1. por_id
------------------------------------------------------------
Marque true SOMENTE se o usuário informar o ID/número do orçamento.

Quando true:
- preencher "id"
- não inventar outros filtros.

Se não informar ID:
- false
- id = null

Não confunda número de orçamento com telefone.

============================================================

2. por_nome_cliente
------------------------------------------------------------
Marque true SOMENTE se o usuário informar o nome do cliente.

Exemplos:
"orçamentos do João"
"orçamentos de Maria"

Preencha somente o nome informado em "nome_cliente".

============================================================

3. por_telefone_cliente
------------------------------------------------------------
Marque true SOMENTE se o usuário informar o telefone do cliente.

Preencha "telefone_cliente".

Não transforme número de orçamento em telefone.

============================================================

4. por_etapa
------------------------------------------------------------
- "etapa" deve sempre ser preenchida.
- Se o usuário informar uma etapa, use a etapa informada e marque "por_etapa": true.
- Se o usuário não informar uma etapa, use "negociacao" como valor padrão, mas mantenha "por_etapa": false.
- Nunca use "todos" em "etapa".

Marque true SOMENTE quando o usuário informar explicitamente
uma etapa/status.

Valores aceitos:

"negociacao"
"andamento"
"aprovado"
"perdido"
"finalizado"

Se não informar etapa:
- por_etapa = false
- etapa = "negociacao"

============================================================

5. por_periodo
------------------------------------------------------------
Marque true quando existir um período de consulta.

Exemplos:
"últimos 6 meses"
"últimos 30 dias"
"este mês"
"este ano"
"em 2025"
"de março até junho"
"de 10 a 20 de março"

Quando true:
- preencher "periodo_start"
- preencher "periodo_end"
- preencher "periodo_texto"

As datas devem considerar o fuso GMT-3 e a data/hora informada acima.

------------------------------------------------------------
PERÍODO PADRÃO
------------------------------------------------------------
Se o usuário NÃO informar nenhum período:

- por_periodo = true
- usar automaticamente os ÚLTIMOS 30 DIAS
- periodo_start = data de 30 dias atrás
- periodo_end = data de hoje
- periodo_texto = "últimos 30 dias"

============================================================

6. TODO O PERÍODO
------------------------------------------------------------
Se o usuário disser:

"todo o período"
"todos os períodos"
"desde o começo"
"sem limite de data"
"não importa a data"

Então:

- por_periodo = false
- periodo_start = null
- periodo_end = null
- periodo_texto = "todo o período"

NÃO crie datas artificiais.

"periodo_texto" é apenas uma descrição humana do período
que será exibida ao usuário. Ele NÃO deve ser usado pelo handle
para decidir o filtro.

============================================================

7. MÚLTIPLOS FILTROS
------------------------------------------------------------
Os filtros podem ser combinados.

Exemplo:

"Lista todos os orçamentos de João em andamento dos últimos 6 meses"

Resultado:

{
  "filtros": {
    "por_id": false,
    "por_nome_cliente": true,
    "por_telefone_cliente": false,
    "por_etapa": true,
    "por_periodo": true
  },
  "mostrar_filtros": false,
  "id": null,
  "nome_cliente": "João",
  "telefone_cliente": null,
  "etapa": "andamento",
  "periodo_start": "2026-03-26",
  "periodo_end": "2026-09-26",
  "periodo_texto": "últimos 6 meses"
}

============================================================

8. MOSTRAR FILTROS
------------------------------------------------------------
Se o usuário pedir para mostrar os filtros utilizados:

"mostre os filtros"
"quais filtros foram usados"
"me diga os filtros"
"mostrar filtros"

→ mostrar_filtros = true

Caso contrário:
→ mostrar_filtros = false

============================================================

9. REGRA ABSOLUTA
------------------------------------------------------------
TODAS as propriedades do JSON devem existir SEMPRE.

Nunca omita nenhuma propriedade.

Use null quando não houver valor.

As flags dentro de "filtros" devem ser SEMPRE booleanos
true ou false.

O handle irá verificar as flags e aplicar SOMENTE os filtros
marcados como true.

============================================================

Texto do usuário:
"""${userMessage}"""
`;

    break;
}

        // ============================================================
        // 🗑️ ORÇAMENTO - DELETE
        // ============================================================
        case 'orcamento_delete': {
    prompt = `
Você é um assistente que identifica dados para excluir um orçamento.

RESPONDA SOMENTE COM JSON VÁLIDO.
NÃO escreva explicações.
NÃO escreva frases antes ou depois do JSON.
NÃO use markdown.
NÃO use bloco \`\`\`json.

Formato obrigatório:

{
  "modulo": "orcamento",
  "action": "delete",
  "id": número
}

Regras:
- "id" deve ser exatamente o número do orçamento informado pelo usuário.
- Não altere o número.
- Não faça cálculos.
- Não invente dados.
- Se o ID não estiver presente, use null.

Texto do usuário:
"""${userMessage}"""
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
  "title": "string",
  "datetime": "Data/hora ISO 8601 no GMT-3",
  "reminder_minutes": número,
  "telefone": "string" ou null
}

Regras obrigatórias:

1. "title"
- Deve conter o nome do compromisso, pessoa, serviço ou local informado pelo usuário.

2. "datetime"
- Deve ser uma data/hora válida em ISO 8601 com fuso GMT-3.
- Utilize o contexto de data e hora informado acima para interpretar expressões como "amanhã", "sexta", etc.

3. "reminder_minutes"
- Se o usuário informar um tempo de lembrete, utilize esse valor.
- Se não informar, use 30.

4. "telefone"
- É um campo OPCIONAL.
- Preencha SOMENTE se o usuário informar um número de telefone relacionado ao evento.
- Se o usuário não informar telefone, retorne obrigatoriamente:
  "telefone": null
- Não confunda o telefone do usuário que está utilizando o sistema com o telefone do contato do evento.
- Não invente ou complete números de telefone.
- Preserve o número informado pelo usuário.
- O telefone pode ser informado com ou sem formatação.

5. Não invente informações que não estejam na mensagem do usuário.

Texto: """${userMessage}"""
`;
    break;
}

        // ============================================================
// ✏️ AGENDA - EDIT
// ============================================================
case 'agenda_edit': {

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
  "title": "string",
  "datetime": "Data/hora ISO 8601 no GMT-3",
  "reminder_minutes": número,
  "telefone": "string" ou null
}

Regras obrigatórias:

1. Mantenha a estrutura original do evento.

2. Atualize SOMENTE os campos que o usuário solicitar.

3. "telefone":
- É opcional.
- Se o usuário informar um novo telefone, atualize o campo.
- Se o usuário pedir para remover/apagar o telefone, use null.
- Se o usuário NÃO mencionar telefone, mantenha o telefone atual do evento.
- Nunca invente ou altere o telefone sem solicitação.
- Não confunda o telefone do usuário que está utilizando o sistema com o telefone do contato do evento.

4. Todas as datas devem estar em GMT-3 com offset "-03:00".

5. Para "daqui X minutos/horas", "amanhã", "mais tarde":
- SEMPRE use a hora atual como base da soma.

6. Para horário exato ("às 14h" ou "7:40"):
- Só substitua a hora quando apropriado.
- Atualize a data conforme o dia solicitado.

Evento atual:
${JSON.stringify({ ...currentData, date: dateBRT }, null, 2)}

Mensagem do usuário:
"${userMessage}"
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
    messages: [{ role: 'user', content: prompt }],
    response_format: {
        type: 'json_object'
    }
});

        let content = completion.choices[0].message.content.trim();

        content = content.replace(/```json\s*|```/g, "").trim();

        try {
            const parsedContent = JSON.parse(content);

            return parsedContent;

        } catch (parseErr) {

            console.error('\n======================================================');
            console.error('❌ [GPT] ERRO AO FAZER JSON.parse()');
            console.error('======================================================');
            console.error('📩 Mensagem original:');
            console.error(userMessage);

            console.error('\n📦 Módulo:', modulo);
            console.error('⚙️ Action:', action);
            console.error('🆔 ID:', id);

            console.error('\n📥 JSON QUE O GPT DEVOLVEU:');
            console.error(content);

            console.error('\n💥 ERRO DO JSON.parse:');
            console.error(parseErr.message);

            console.error('\n📚 STACK DO ERRO:');
            console.error(parseErr.stack);

            console.error('======================================================\n');

            return {
                erro: "JSON inválido retornado pelo GPT",
                raw: content
            };
        }

    } catch (err) {

        console.error('\n======================================================');
        console.error('🔥 [GPT] ERRO AO CHAMAR OPENAI');
        console.error('======================================================');
        console.error('📩 Mensagem original:', userMessage);
        console.error('📦 Módulo:', modulo);
        console.error('⚙️ Action:', action);
        console.error('🆔 ID:', id);
        console.error('\n💥 Erro:', err);
        console.error('\n📚 Stack:', err.stack);
        console.error('======================================================\n');

        return {
            erro: 'Falha ao chamar GPT',
            modulo,
            action
        };
    }
}

module.exports = { handleGPTCommand };