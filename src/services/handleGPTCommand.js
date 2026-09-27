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

Sua função é identificar EXATAMENTE quais filtros o usuário solicitou
e se ele deseja uma LISTAGEM DETALHADA ou um RESUMO/RELATÓRIO.

Responda SOMENTE com JSON válido.
NÃO escreva explicações.
NÃO use markdown.
NÃO coloque texto fora do JSON.

============================================================
FORMATO OBRIGATÓRIO
============================================================

{
  "modulo": "orcamento",
  "action": "list",

  "resumo": false,

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

  "etapa": "negociacao" | "finalizado" | "andamento" | "perdido" | "aprovado",

  "periodo_start": null,
  "periodo_end": null,
  "periodo_texto": null
}

============================================================
1. RESUMO / RELATÓRIO
============================================================

O campo "resumo" controla se o usuário quer:

- uma LISTAGEM dos orçamentos individualmente
OU
- um RELATÓRIO consolidado.

Use obrigatoriamente:

"resumo": true

quando a mensagem indicar qualquer intenção de relatório,
resumo, panorama, totais ou valores consolidados.

PALAVRAS E EXPRESSÕES QUE INDICAM RESUMO:

- relatório
- resumo
- relatório de orçamentos
- relatório dos meus orçamentos
- relatório de orçamento
- resumo dos orçamentos
- resumo dos meus orçamentos
- total de orçamentos
- quantidade de orçamentos
- quantos orçamentos tenho
- quanto tenho em orçamentos
- valor dos orçamentos
- valores dos orçamentos
- situação dos orçamentos
- panorama dos orçamentos
- valores por etapa
- quantidade por etapa
- relatório completo
- relatório geral

IMPORTANTE:

A palavra "relatório" SEMPRE significa:

"resumo": true

mesmo que a mensagem também contenha palavras como:

- lista
- listar
- mostrar
- mostra
- meus
- todos

EXEMPLOS:

"Lista meu relatório de orçamento todo o período"
→ resumo=true

"Lista o relatório dos meus orçamentos"
→ resumo=true

"Lista meus orçamentos todo o período"
→ resumo=false

"Relatório dos meus orçamentos todo o período"
→ resumo=true

"Resumo dos meus orçamentos deste mês"
→ resumo=true

"Mostra meus orçamentos de João"
→ resumo=false

"Lista todos os orçamentos de João"
→ resumo=false

ATENÇÃO:

"lista meu relatório" NÃO significa listar os
orçamentos individualmente.

Nesse caso o usuário está solicitando um RELATÓRIO
CONSOLIDADO.

Quando "resumo": true, o sistema NÃO deve enviar
cada orçamento individualmente.

O resultado deverá ser um único relatório consolidado
por etapa.

============================================================
2. FILTRO POR ID
============================================================

Marque "por_id": true SOMENTE se o usuário informar
o ID/número do orçamento.

Quando true:

- preencher "id"
- não inventar outros valores.

Se não informar ID:

- por_id = false
- id = null

Não confunda número de orçamento com telefone.

============================================================
3. FILTRO POR NOME DO CLIENTE
============================================================

Marque "por_nome_cliente": true SOMENTE se o usuário
informar o nome do cliente.

Exemplos:

"orçamentos do João"
"orçamentos de Maria"
"resumo dos orçamentos do João"

Resultado:

"por_nome_cliente": true
"nome_cliente": "João"

Preencha somente o nome informado pelo usuário.

Não invente sobrenome.

============================================================
4. FILTRO POR TELEFONE DO CLIENTE
============================================================

Marque "por_telefone_cliente": true SOMENTE se o usuário
informar o telefone do cliente.

Preencha:

"telefone_cliente"

Não transforme número de orçamento em telefone.

Não transforme outros números da mensagem em telefone
sem que o usuário indique claramente que é um telefone.

============================================================
5. FILTRO POR ETAPA / STATUS
============================================================

Marque "por_etapa": true SOMENTE quando o usuário
informar explicitamente uma etapa/status.

Valores aceitos:

"negociacao"
"andamento"
"aprovado"
"perdido"
"finalizado"

Interpretação:

- negociação → "negociacao"
- em negociação → "negociacao"
- andamento → "andamento"
- em andamento → "andamento"
- aprovado → "aprovado"
- aprovados → "aprovado"
- perdido → "perdido"
- perdidos → "perdido"
- recusado → "perdido"
- recusados → "perdido"
- finalizado → "finalizado"
- finalizados → "finalizado"

Exemplos:

"Lista meus orçamentos em andamento"

→ por_etapa = true
→ etapa = "andamento"

"Resumo dos orçamentos aprovados"

→ por_etapa = true
→ etapa = "aprovado"

"Lista meus orçamentos recusados"

→ por_etapa = true
→ etapa = "perdido"

IMPORTANTE:

Se o usuário NÃO informar uma etapa:

→ por_etapa = false

O campo "etapa" deve continuar preenchido com:

"negociacao"

Mas essa etapa NÃO deve ser usada como filtro quando
"por_etapa" for false.

NUNCA use "todos" em "etapa".

============================================================
6. FILTRO POR PERÍODO
============================================================

Marque "por_periodo": true quando existir um período
de consulta.

Exemplos:

"últimos 6 meses"
"últimos 30 dias"
"este mês"
"este ano"
"em 2025"
"de março até junho"
"de 10 a 20 de março"
"desde janeiro"
"neste mês"

Quando true:

- preencher "periodo_start"
- preencher "periodo_end"
- preencher "periodo_texto"

As datas devem considerar o fuso GMT-3 e a data/hora
informada acima.

============================================================
PERÍODO PADRÃO
============================================================

Se o usuário NÃO informar nenhum período:

- por_periodo = true
- usar automaticamente os ÚLTIMOS 30 DIAS
- periodo_start = data de 30 dias atrás
- periodo_end = data atual
- periodo_texto = "últimos 30 dias"

============================================================
7. TODO O PERÍODO
============================================================

Quando o usuário disser:

- todo o período
- todos os períodos
- período completo
- período inteiro
- desde o começo
- desde sempre
- todos os meus orçamentos
- todos os orçamentos

NÃO aplique filtro de data.

Use:

"por_periodo": false

e:

"periodo_start": null
"periodo_end": null

Porém, se a expressão "todo o período" aparecer junto
com "relatório" ou "resumo", mantenha:

"resumo": true

Exemplo:

"Lista meu relatório de orçamento todo o período"

deve resultar em:

{
  "resumo": true,
  "filtros": {
    "por_periodo": false
  },
  "periodo_start": null,
  "periodo_end": null,
  "periodo_texto": "todo o período"
}

============================================================
8. MÚLTIPLOS FILTROS
============================================================

Os filtros podem ser combinados.

Exemplo:

"Lista todos os orçamentos de João em andamento dos últimos 6 meses"

Resultado:

{
  "modulo": "orcamento",
  "action": "list",
  "resumo": false,

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

  "periodo_start": "2026-03-27",
  "periodo_end": "2026-09-27",
  "periodo_texto": "últimos 6 meses"
}

============================================================
9. EXEMPLOS IMPORTANTES
============================================================

Exemplo 1:

"Lista meus orçamentos"

→ resumo = false
→ por_id = false
→ por_nome_cliente = false
→ por_telefone_cliente = false
→ por_etapa = false
→ por_periodo = true
→ últimos 30 dias

------------------------------------------------------------

Exemplo 2:

"Lista todos os orçamentos de João em andamento todo o período"

→ resumo = false
→ por_nome_cliente = true
→ nome_cliente = "João"
→ por_etapa = true
→ etapa = "andamento"
→ por_periodo = false
→ periodo_texto = "todo o período"

NÃO aplicar filtro de data.

------------------------------------------------------------

Exemplo 3:

"Resumo dos meus orçamentos deste mês"

→ resumo = true
→ por_etapa = false
→ por_periodo = true

------------------------------------------------------------

Exemplo 4:

"Resumo dos orçamentos de João em andamento deste mês"

→ resumo = true
→ por_nome_cliente = true
→ nome_cliente = "João"
→ por_etapa = true
→ etapa = "andamento"
→ por_periodo = true

------------------------------------------------------------

Exemplo 5:

"Resumo dos meus orçamentos aprovados"

→ resumo = true
→ por_etapa = true
→ etapa = "aprovado"

------------------------------------------------------------

Exemplo 6:

"Resumo dos meus orçamentos recusados"

→ resumo = true
→ por_etapa = true
→ etapa = "perdido"

------------------------------------------------------------

Exemplo 7:

"Lista os orçamentos do João"

→ resumo = false
→ por_nome_cliente = true
→ nome_cliente = "João"

============================================================
10. MOSTRAR FILTROS
============================================================

Se o usuário pedir:

"mostre os filtros"
"quais filtros foram usados"
"me diga os filtros"
"mostrar filtros"

→ mostrar_filtros = true

Caso contrário:

→ mostrar_filtros = false

============================================================
11. REGRAS ABSOLUTAS
============================================================

TODAS as propriedades do JSON devem existir SEMPRE.

Nunca omita nenhuma propriedade.

Use null quando não houver valor.

As flags dentro de "filtros" devem ser SEMPRE booleanos:

true ou false.

"resumo" deve ser SEMPRE booleano:

true ou false.

Não invente nomes.

Não invente telefones.

Não invente IDs.

Não invente etapas.

Não invente datas.

O handle irá verificar as flags e aplicar SOMENTE os filtros
marcados como true.

============================================================

Texto do usuário:

"""${userMessage}"""
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
Você é um assistente financeiro que registra uma nova despesa.

O usuário está no fuso GMT-3 (Brasil).
${nowWithWeekday()}

Responda SOMENTE com JSON válido.
Não escreva explicações.
Não use markdown.
Não coloque texto fora do JSON.

FORMATO OBRIGATÓRIO:

{
  "modulo": "despesas",
  "action": "create",
  "tipo": "conducao" | "materiais" | "alimentacao" | "outras",
  "valor": número,
  "descricao": "string"
}

============================================================
REGRAS
============================================================

1. TIPO
------------------------------------------------------------

Classifique automaticamente a despesa:

"conducao":
- gasolina
- combustível
- álcool combustível
- diesel
- estacionamento
- pedágio
- transporte
- ônibus
- Uber
- manutenção relacionada ao veículo
- outras despesas claramente relacionadas à condução

"materiais":
- tomada
- interruptor
- fio
- cabo
- disjuntor
- eletroduto
- eletrocalha
- condulete
- lâmpada
- fita de LED
- material elétrico
- ferramentas
- materiais utilizados na obra
- qualquer outro material comprado para serviço

"alimentacao":
- marmita
- almoço
- jantar
- café
- lanche
- comida
- alimentação
- bebida sem álcool
- qualquer despesa claramente relacionada à alimentação

"outras":
- despesas que não se enquadrem nas categorias acima.

2. DESCRIÇÃO
------------------------------------------------------------

A descrição deve registrar exatamente o que foi informado pelo usuário.

Exemplos:

"25 reais gasolina"
→ tipo: "conducao"
→ valor: 25
→ descricao: "gasolina"

"gastei 30 com marmita"
→ tipo: "alimentacao"
→ valor: 30
→ descricao: "marmita"

"adiciona gasto com tomada 15 reais"
→ tipo: "materiais"
→ valor: 15
→ descricao: "tomada"

Não invente detalhes.

3. VALOR
------------------------------------------------------------

- Retorne somente número.
- Use ponto como separador decimal.
- Não inclua "R$".
- Não faça cálculos.
- Não invente o valor.
- Se o valor não puder ser identificado, use 0,

Texto do usuário:
"""${userMessage}"""
`;
    break;
}

case 'despesas_edit': {
    if (!id) return { error: "⚠️ Informe o ID da despesa." };

    const { data: currentData, error: fetchError } = await supabase
        .from('despesas')
        .select('*')
        .eq('despesa_numero', id)
        .single();

    if (fetchError || !currentData) {
        return { error: `⚠️ Despesa ID ${id} não encontrada.` };
    }

    prompt = `
Você é um assistente financeiro que edita uma despesa existente.

Responda SOMENTE com JSON válido.
Não escreva explicações.
Não use markdown.

FORMATO OBRIGATÓRIO:

{
  "modulo": "despesas",
  "action": "edit",
  "despesa_numero": "${id}",
  "tipo": "conducao" | "materiais" | "alimentacao" | "outras",
  "valor": número,
  "descricao": "string"
}

============================================================
DESPESA ATUAL
============================================================

${JSON.stringify(currentData, null, 2)}

============================================================
INSTRUÇÕES DO USUÁRIO
============================================================

"${userMessage}"

============================================================
REGRAS
============================================================

1. Mantenha os dados atuais.

2. Altere SOMENTE o que o usuário solicitar.

3. Se o usuário alterar a descrição e ficar evidente que a
categoria também deve mudar, atualize o "tipo".

Exemplo:

"Altera para gasolina"
→ descricao = "gasolina"
→ tipo = "conducao"

"Altera para marmita"
→ descricao = "marmita"
→ tipo = "alimentacao"

"Altera para tomada"
→ descricao = "tomada"
→ tipo = "materiais"

4. Tipos permitidos:

"conducao"
"materiais"
"alimentacao"
"outras"

5. Não altere "despesa_numero".

6. Não crie novas propriedades.

7. Valores monetários devem ser números usando ponto como decimal.

Retorne a despesa completa após a alteração.

`;
    break;
}

case 'despesas_list': {
    prompt = `
Você é um assistente financeiro que interpreta comandos para LISTAR DESPESAS ou GERAR RESUMO DE DESPESAS.

O usuário está no fuso GMT-3 (Brasil).
${nowWithWeekday()}

Sua função é identificar exatamente quais filtros o usuário solicitou
e se ele deseja uma LISTAGEM detalhada ou um RESUMO agrupado.

Responda SOMENTE com JSON válido.
Não escreva explicações.
Não use markdown.
Não coloque texto fora do JSON.

FORMATO OBRIGATÓRIO:

{
  "modulo": "despesas",
  "action": "list",

  "resumo": false,

  "filtros": {
    "por_tipo": false,
    "por_descricao": false,
    "por_periodo": false
  },

  "mostrar_filtros": false,

  "tipo": "conducao" | "materiais" | "alimentacao" | "outras" | "todos",
  "descricao": null,

  "periodo_start": null,
  "periodo_end": null,
  "periodo_texto": null
}

============================================================
1. RESUMO
============================================================

Marque:

"resumo": true

quando o usuário pedir um RESUMO, TOTAL, SOMATÓRIO ou
RELATÓRIO resumido das despesas.

Exemplos:

"Resumo das minhas despesas do mês"
→ resumo = true

"Resumo das minhas despesas"
→ resumo = true

"Quero um resumo dos meus gastos"
→ resumo = true

"Relatório das minhas despesas do mês"
→ resumo = true

"Quanto gastei esse mês?"
→ resumo = true

"Qual o total das minhas despesas?"
→ resumo = true

"Me mostre o total que gastei com combustível"
→ resumo = true
→ por_tipo = true
→ tipo = "conducao"

"Lista minhas despesas do mês"
→ resumo = false

"Mostra minhas despesas"
→ resumo = false

IMPORTANTE:

Se o usuário pedir explicitamente para LISTAR ou MOSTRAR
as despesas individualmente, use:

"resumo": false

Se pedir resumo, total, somatório, relatório ou quanto gastou,
use:

"resumo": true

============================================================
2. FILTRO POR TIPO
============================================================

Marque "por_tipo": true quando o usuário solicitar
explicitamente uma CATEGORIA de despesa.

Categorias:

"conducao"
"materiais"
"alimentacao"
"outras"

IMPORTANTE:

A categoria "conducao" representa despesas relacionadas
a deslocamento/transporte, incluindo:

- combustível
- gasolina
- diesel
- etanol
- Uber
- táxi
- estacionamento
- pedágio
- transporte

PORÉM, quando o usuário especificar uma despesa concreta,
como "combustível", "gasolina", "diesel", "Uber",
"estacionamento" ou "pedágio", isso deve ser tratado
como FILTRO POR DESCRIÇÃO, e NÃO como filtro por tipo.

Exemplos:

"Lista minhas despesas de condução"
→ por_tipo = true
→ tipo = "conducao"
→ por_descricao = false
→ descricao = null

"Resumo das minhas despesas de combustível"
→ por_tipo = false
→ tipo = "todos"
→ por_descricao = true
→ descricao = "combustível"

"Lista minhas despesas de gasolina"
→ por_tipo = false
→ tipo = "todos"
→ por_descricao = true
→ descricao = "gasolina"

"Lista minhas despesas de Uber"
→ por_tipo = false
→ tipo = "todos"
→ por_descricao = true
→ descricao = "Uber"

"Lista minhas despesas de estacionamento"
→ por_tipo = false
→ tipo = "todos"
→ por_descricao = true
→ descricao = "estacionamento"

"Lista minhas despesas de material"
→ por_tipo = true
→ tipo = "materiais"
→ por_descricao = false

"Lista minhas despesas de alimentação"
→ por_tipo = true
→ tipo = "alimentacao"
→ por_descricao = false

"Lista minhas outras despesas"
→ por_tipo = true
→ tipo = "outras"
→ por_descricao = false

============================================================
3. FILTRO POR DESCRIÇÃO
============================================================
TERMOS QUE DEVEM SER TRATADOS COMO DESCRIÇÃO:

"combustível"
"gasolina"
"diesel"
"etanol"
"álcool"
"Uber"
"taxi"
"táxi"
"estacionamento"
"pedágio"
"mecânico"
"oficina"

Esses termos NÃO devem automaticamente definir:

tipo = "conducao"

Eles devem gerar:

por_tipo = false
tipo = "todos"
por_descricao = true
descricao = termo solicitado.

Marque "por_descricao": true quando o usuário procurar
uma despesa específica pelo nome/descrição.

Exemplos:

"Lista minhas despesas com gasolina"
→ por_descricao = true
→ descricao = "gasolina"

"Resumo das minhas despesas com gasolina"
→ por_descricao = true
→ descricao = "gasolina"

"Lista meus gastos com tomada"
→ por_descricao = true
→ descricao = "tomada"

"Quanto gastei com gasolina?"
→ resumo = true
→ por_descricao = true
→ descricao = "gasolina"

IMPORTANTE:

Uma palavra pode representar tanto uma categoria quanto
uma descrição.

Exemplo:

"Lista minhas despesas de material"

→ por_tipo = true
→ tipo = "materiais"
→ por_descricao = false

Já:

"Lista minhas despesas com tomada"

→ por_tipo = false
→ tipo = "todos"
→ por_descricao = true
→ descricao = "tomada"

============================================================
4. FILTRO POR PERÍODO
============================================================

Marque "por_periodo": true quando o usuário informar
qualquer período.

Exemplos:

"hoje"
"ontem"
"essa semana"
"semana passada"
"este mês"
"mês passado"
"setembro"
"em setembro de 2026"
"últimos 30 dias"
"últimos 6 meses"
"de 1 a 15 de setembro"
"desde o começo do mês"

Quando houver período:

- preencher "periodo_start"
- preencher "periodo_end"
- preencher "periodo_texto"

As datas devem ser calculadas considerando GMT-3.

Use ISO 8601.

============================================================
5. SEM PERÍODO
============================================================

Se o usuário não informar nenhum período:

- por_periodo = true
- usar os ÚLTIMOS 30 DIAS
- periodo_start = data/hora de 30 dias atrás
- periodo_end = data/hora atual
- periodo_texto = "últimos 30 dias"

============================================================
6. TODO O PERÍODO
============================================================

Se o usuário disser:

"todo o período"
"desde o começo"
"desde sempre"
"sem limite de data"
"todas as despesas que tenho"

Então:

- por_periodo = false
- periodo_start = null
- periodo_end = null
- periodo_texto = "todo o período"

Não crie datas artificiais.

============================================================
7. COMBINAÇÃO DE FILTROS
============================================================

Os filtros podem ser combinados.

Exemplo:

"Resumo das minhas despesas de gasolina desse mês"

Resultado:

{
  "modulo": "despesas",
  "action": "list",
  "resumo": true,
  "filtros": {
    "por_tipo": true,
    "por_descricao": true,
    "por_periodo": true
  },
  "mostrar_filtros": false,
  "tipo": "conducao",
  "descricao": "gasolina",
  "periodo_start": "2026-09-01T00:00:00-03:00",
  "periodo_end": "2026-09-27T23:59:59-03:00",
  "periodo_texto": "este mês"
}

Outro exemplo:

"Resumo das minhas despesas de material da semana"

→ resumo = true
→ por_tipo = true
→ tipo = "materiais"
→ por_descricao = false
→ por_periodo = true

Outro:

"Resumo das minhas despesas com tomada em setembro"

→ resumo = true
→ por_tipo = false
→ tipo = "todos"
→ por_descricao = true
→ descricao = "tomada"
→ por_periodo = true

============================================================
8. MOSTRAR FILTROS
============================================================

Se o usuário pedir:

"mostre os filtros"
"quais filtros foram usados"
"me diga os filtros"
"mostrar filtros"

→ mostrar_filtros = true

Caso contrário:

→ mostrar_filtros = false

============================================================
9. REGRAS ABSOLUTAS
============================================================

TODAS as propriedades devem existir sempre.

Nunca omita propriedades.

As flags devem ser sempre booleanos true ou false.

Não invente datas.

Não invente categorias.

Não invente descrições.

O handle será responsável por consultar o banco usando
somente os filtros marcados como true.

Quando "resumo" for true, o handle deverá calcular os
valores agrupados por categoria e apresentar:

🚗 Condução
🔨 Materiais
🍽️ Alimentação
📦 Outras
💰 Total

Quando "resumo" for false, o handle deverá apresentar
as despesas individualmente.

Texto do usuário:
"""${userMessage}"""
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