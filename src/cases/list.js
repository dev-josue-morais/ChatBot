const supabase = require('../services/supabase');

const {
    TIPOS_DESPESA,
    emojiTipo,
    formatPeriodoTitulo,
    formatDateBR,
    nomeTipo,
    formatRelatorioOrcamentos,
    formatFiltrosOrcamento,
    getDateRange
} = require('../utils/processFunctions');

const {
    getNowBRT,
    formatLocal,
    formatPhoneNumber
} = require('../utils/utils');

const formatOrcamento = require('../utils/formatOrcamento');
const formatCurrency = require('../utils/formatCurrency');

const {
    sendWhatsAppRaw
} = require('../services/whatsappService');

const { DateTime } = require('luxon');


// ================================================================
// UTILITÁRIOS
// ================================================================

function nowWithWeekday() {

    const now = getNowBRT();

    const weekday = now
        .setLocale('pt')
        .toFormat('cccc');

    return `Hoje é ${weekday}, ${now.toFormat('yyyy-MM-dd HH:mm:ss')}`;
}


function isTrue(value) {
    return value === true;
}


function normalizeString(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return null;
    }

    const result = String(value).trim();

    return result || null;
}


function normalizeTipoDespesa(tipo) {

    if (!tipo) {
        return 'todos';
    }

    const value = String(tipo)
        .trim()
        .toLowerCase();

    const aliases = {
        conducao: 'conducao',
        condução: 'conducao',

        material: 'materiais',
        materiais: 'materiais',

        alimentacao: 'alimentacao',
        alimentação: 'alimentacao',

        ferramentas: 'ferramentas',
        ferramenta: 'ferramentas',

        outras: 'outras',
        outra: 'outras',

        todos: 'todos'
    };

    return aliases[value] || value;
}


function normalizeEtapa(etapa) {

    if (!etapa) {
        return null;
    }

    const value = String(etapa)
        .trim()
        .toLowerCase();

    const aliases = {
        negociação: 'negociacao',
        negociacao: 'negociacao',

        andamento: 'andamento',
        'em andamento': 'andamento',

        aprovado: 'aprovado',
        aprovados: 'aprovado',

        perdido: 'perdido',
        perdidos: 'perdido',
        recusado: 'perdido',
        recusados: 'perdido',

        finalizado: 'finalizado',
        finalizados: 'finalizado'
    };

    return aliases[value] || value;
}


// ================================================================
// PROMPT DE LISTAGEM
// ================================================================

async function getListPrompt(modulo, userMessage) {

    switch (modulo) {

        // ========================================================
        // ORÇAMENTOS
        // ========================================================

        case 'orcamento': {

            return `
Você é o interpretador de consultas de ORÇAMENTOS de um sistema de gestão.

Sua função é interpretar a intenção do usuário e transformar o pedido
em filtros estruturados.

Você NÃO consulta o banco.
Você NÃO deve responder ao usuário.
Você deve SOMENTE retornar o JSON solicitado.

Fuso horário:
America/Sao_Paulo (GMT-3)

${nowWithWeekday()}


============================================================
FORMATO OBRIGATÓRIO
============================================================

Retorne exatamente um JSON válido neste formato:

{
  "modulo": "orcamento",
  "action": "list",

  "resumo": false,

  "filtros": {
    "por_id": false,
    "por_nome_cliente": false,
    "por_telefone_cliente": false,
    "por_etapa": false,
    "por_periodo": true
  },

  "mostrar_filtros": false,

  "id": null,
  "nome_cliente": null,
  "telefone_cliente": null,

  "etapa": null,

  "periodo_start": "YYYY-MM-DD",
  "periodo_end": "YYYY-MM-DD",
  "periodo_texto": "últimos 15 dias"
}


============================================================
REGRA MAIS IMPORTANTE — LISTA x RESUMO
============================================================

Existem dois tipos de consulta:

1. LISTA DETALHADA
2. RESUMO / RELATÓRIO

------------------------------------------------------------
LISTA DETALHADA
------------------------------------------------------------

Use:

"resumo": false

quando o usuário quiser VER OS ORÇAMENTOS individualmente.

Palavras comuns:

- lista
- listar
- mostre
- mostra
- mostrar
- consulte
- consultar
- ver
- veja
- quais
- quais são meus orçamentos

Exemplos:

"Lista meus orçamentos"
→ resumo=false

"Mostra meus orçamentos aprovados"
→ resumo=false

"Quais são os orçamentos de João?"
→ resumo=false

"Lista os orçamentos de João dos últimos 30 dias"
→ resumo=false

IMPORTANTE:

A existência de filtros NÃO transforma uma lista em resumo.

------------------------------------------------------------
RESUMO / RELATÓRIO
------------------------------------------------------------

Use:

"resumo": true

somente quando o usuário pedir informação CONSOLIDADA.

Exemplos:

- resumo
- relatório
- panorama
- total
- quantidade
- quanto tenho
- valor total
- situação geral
- quantidade por etapa
- valores por etapa

Exemplos:

"Resumo dos meus orçamentos"
→ resumo=true

"Relatório dos meus orçamentos"
→ resumo=true

"Quanto tenho em orçamentos?"
→ resumo=true

"Quantos orçamentos tenho aprovados?"
→ resumo=true

"Qual o valor total dos meus orçamentos?"
→ resumo=true

"Resumo dos orçamentos aprovados"
→ resumo=true


============================================================
ATENÇÃO SOBRE "LISTA RELATÓRIO"
============================================================

Se o usuário utilizar explicitamente "relatório" ou "resumo",
mesmo que também utilize "lista", considere como resumo.

Exemplo:

"Lista relatório dos meus orçamentos"
→ resumo=true

"Lista resumo dos orçamentos aprovados"
→ resumo=true

Mas:

"Lista meus orçamentos aprovados"
→ resumo=false


============================================================
FILTRO POR ID
============================================================

Use:

"por_id": true

somente quando o usuário informar claramente o número do orçamento.

Exemplos:

"Lista o orçamento 1060926001"

"Mostra o orçamento número 1060926001"

"Consulta o orçamento 1060926001"

Resultado:

"por_id": true,
"id": 1060926001

Caso contrário:

"por_id": false,
"id": null


IMPORTANTE:

Nunca confunda telefone com ID.

Um telefone não deve ser colocado no campo "id".


============================================================
FILTRO POR CLIENTE
============================================================

Se o usuário informar o nome do cliente:

"por_nome_cliente": true

e:

"nome_cliente": "nome informado"

Use SOMENTE o nome do cliente.

Exemplo:

"Lista os orçamentos do João Silva"

→

"por_nome_cliente": true,
"nome_cliente": "João Silva"

Se não houver nome:

"por_nome_cliente": false,
"nome_cliente": null


============================================================
FILTRO POR TELEFONE
============================================================

Use:

"por_telefone_cliente": true

somente quando o usuário estiver claramente informando
um telefone de cliente.

Exemplo:

"Lista os orçamentos do cliente 64999999999"

→ telefone_cliente deve receber o telefone.

Nunca confunda um número de orçamento com telefone.

Se não houver telefone:

"por_telefone_cliente": false,
"telefone_cliente": null


============================================================
FILTRO POR ETAPA
============================================================

Use:

"por_etapa": true

somente quando o usuário indicar explicitamente uma etapa/status.

Mapeamento obrigatório:

negociação
em negociação
→ negociacao

andamento
em andamento
→ andamento

aprovado
aprovados
→ aprovado

perdido
perdidos
recusado
recusados
→ perdido

finalizado
finalizados
→ finalizado

Exemplo:

"Lista meus orçamentos aprovados"

→

"por_etapa": true,
"etapa": "aprovado"

Exemplo:

"Lista meus orçamentos em negociação"

→

"por_etapa": true,
"etapa": "negociacao"

Se nenhuma etapa foi mencionada:

"por_etapa": false,
"etapa": null

NÃO use "negociacao" como valor padrão quando o filtro não estiver
ativo.

Isso é importante porque "etapa" só deve ser utilizada pelo sistema
quando "por_etapa" for true.


============================================================
FILTRO POR PERÍODO
============================================================

O filtro por período é SEMPRE obrigatório.

Sempre:

"por_periodo": true

Nunca:

"por_periodo": false


Sempre preencher:

- periodo_start
- periodo_end
- periodo_texto


------------------------------------------------------------
SE O USUÁRIO INFORMAR UM PERÍODO
------------------------------------------------------------

Interprete exatamente o período solicitado.

Exemplos:

"hoje"

"ontem"

"esta semana"

"semana passada"

"este mês"

"mês passado"

"últimos 30 dias"

"últimos 6 meses"

"este ano"

"em 2025"

"em setembro"

"de março até junho"

"de 1 a 15 de setembro"


------------------------------------------------------------
SE NÃO INFORMAR PERÍODO
------------------------------------------------------------

Use obrigatoriamente:

"últimos 15 dias"

Exemplo:

"Lista meus orçamentos"

→

periodo_texto = "últimos 15 dias"

periodo_start = data de 15 dias atrás

periodo_end = data de hoje


============================================================
TODO O PERÍODO
============================================================

Se o usuário disser:

- todo o período
- período completo
- período inteiro
- desde o começo
- desde sempre
- todos os orçamentos

NÃO desative o filtro.

Use:

"por_periodo": true

"periodo_start": "2000-01-01"

"periodo_end": data de hoje

"periodo_texto": "todo o período"


============================================================
FORMATO DAS DATAS
============================================================

periodo_start e periodo_end devem conter SOMENTE:

YYYY-MM-DD

Correto:

"2026-09-01"

Errado:

"2026-09-01T00:00:00"

Errado:

"01/09/2026"

Errado:

"2026-09-01-03:00"

O sistema será responsável por transformar as datas em início/fim
do dia usando America/Sao_Paulo.


============================================================
PERIODO_TEXTO
============================================================

É somente uma descrição legível do período.

Exemplos:

"hoje"
→ "hoje"

"ontem"
→ "ontem"

"esta semana"
→ "esta semana"

"últimos 30 dias"
→ "últimos 30 dias"

"este ano"
→ "este ano"

"em 2025"
→ "ano de 2025"

"de 1 a 15 de setembro"
→ "01/09 a 15/09"

Não coloque horários ou informações extras.


============================================================
MÚLTIPLOS FILTROS
============================================================

Os filtros podem ser combinados.

Exemplo:

"Lista todos os orçamentos de João aprovados dos últimos 6 meses"

Resultado conceitual:

resumo=false
por_nome_cliente=true
nome_cliente="João"
por_etapa=true
etapa="aprovado"
por_periodo=true


Outro exemplo:

"Relatório dos orçamentos de João aprovados dos últimos 6 meses"

Resultado conceitual:

resumo=true
por_nome_cliente=true
nome_cliente="João"
por_etapa=true
etapa="aprovado"
por_periodo=true


============================================================
MOSTRAR FILTROS
============================================================

Use:

"mostrar_filtros": true

SOMENTE quando o usuário pedir explicitamente os filtros.

Exemplos:

"mostra os filtros"

"quais filtros foram usados"

"me mostre os filtros"

"quais foram os filtros da consulta"

Caso contrário:

"mostrar_filtros": false


============================================================
REGRAS FINAIS
============================================================

- Todas as propriedades do JSON devem existir.
- Flags devem ser true ou false.
- por_periodo deve ser SEMPRE true.
- periodo_start nunca pode ser null.
- periodo_end nunca pode ser null.
- periodo_texto nunca pode ser null.
- Nunca invente ID.
- Nunca invente nome.
- Nunca invente telefone.
- Nunca invente etapa.
- Não confunda telefone com ID.
- LISTA detalhada = resumo=false.
- RESUMO/RELATÓRIO = resumo=true.
- Filtros não transformam lista em resumo.
- "etapa" só deve ser utilizada como filtro quando por_etapa=true.
- Quando por_etapa=false, use etapa=null.
- O período padrão é últimos 15 dias.
- Todo o período começa em 2000-01-01.
- Retorne SOMENTE JSON válido.


Mensagem do usuário:

"""${userMessage}"""
`;
        }


        // ========================================================
        // DESPESAS
        // ========================================================

        case 'despesas': {

            return `
Você é o interpretador de consultas de DESPESAS de um sistema de gestão.

Você NÃO consulta o banco.
Você NÃO deve responder ao usuário.
Sua única função é transformar o pedido em filtros estruturados.

Fuso horário:
America/Sao_Paulo (GMT-3)

${nowWithWeekday()}


============================================================
FORMATO OBRIGATÓRIO
============================================================

Retorne somente JSON válido:

{
  "modulo": "despesas",
  "action": "list",

  "resumo": false,

  "filtros": {
    "por_tipo": false,
    "por_descricao": false,
    "por_periodo": true
  },

  "mostrar_filtros": false,

  "tipo": "todos",
  "descricao": null,

  "periodo_start": "YYYY-MM-DD",
  "periodo_end": "YYYY-MM-DD",
  "periodo_texto": "últimos 30 dias"
}


============================================================
LISTA x RESUMO
============================================================

LISTA:

Use resumo=false quando o usuário quiser visualizar as despesas
individualmente.

Exemplos:

"Lista minhas despesas"
→ resumo=false

"Mostra minhas despesas do mês"
→ resumo=false

"Lista meus gastos com gasolina"
→ resumo=false

"Quais despesas tive essa semana?"
→ resumo=false


RESUMO:

Use resumo=true quando o usuário pedir uma informação consolidada.

Exemplos:

"Resumo das minhas despesas"
→ resumo=true

"Relatório das minhas despesas"
→ resumo=true

"Quanto gastei?"
→ resumo=true

"Qual o total das minhas despesas?"
→ resumo=true

"Quanto gastei com gasolina?"
→ resumo=true

"Qual o total gasto com materiais?"
→ resumo=true

"Quanto gastei com ferramentas?"
→ resumo=true


IMPORTANTE:

Filtros não transformam lista em resumo.

"Lista minhas despesas de gasolina"
→ resumo=false

"Resumo das minhas despesas de gasolina"
→ resumo=true


============================================================
FILTRO POR TIPO
============================================================

Tipos permitidos:

- conducao
- materiais
- alimentacao
- ferramentas
- outras
- todos

Use por_tipo=true quando o usuário estiver pedindo uma CATEGORIA.

Condução:

- condução
- transporte
- deslocamento

Materiais:

- material
- materiais
- material elétrico

Ferramentas:

- ferramenta
- ferramentas
- equipamentos
- equipamentos de trabalho

IMPORTANTE:

Quando "ferramentas" for utilizado claramente como categoria de despesa,
use:

por_tipo=true
tipo="ferramentas"

Não classifique "ferramentas" como materiais.

Alimentação:

- alimentação
- comida
- refeições

Outras:

- outras
- outros gastos


Exemplos:

"Lista minhas despesas de condução"

→ por_tipo=true
→ tipo="conducao"

"Lista minhas despesas de materiais"

→ por_tipo=true
→ tipo="materiais"

"Lista minhas despesas de alimentação"

→ por_tipo=true
→ tipo="alimentacao"

"Lista minhas despesas de ferramentas"

→ por_tipo=true
→ tipo="ferramentas"


============================================================
DESCRIÇÃO ESPECÍFICA
============================================================

Quando o usuário citar uma despesa concreta, prefira filtro por
DESCRIÇÃO em vez de categoria.

Exemplos:

gasolina
combustível
diesel
etanol
Uber
táxi
estacionamento
pedágio
mecânico
oficina
tomada
fio
disjuntor
lâmpada
marmita

Exemplo:

"Lista minhas despesas com gasolina"

→

por_tipo=false
tipo="todos"
por_descricao=true
descricao="gasolina"


"Quanto gastei com gasolina?"

→

resumo=true
por_tipo=false
tipo="todos"
por_descricao=true
descricao="gasolina"


"Lista meus gastos com tomada"

→

por_tipo=false
tipo="todos"
por_descricao=true
descricao="tomada"


IMPORTANTE:

Não transforme automaticamente uma descrição específica em tipo.

"gasolina" não significa que o filtro por tipo deve ser usado.

"tomada" não significa que o filtro por tipo deve ser usado.

"ferramenta" pode ser uma categoria quando o usuário estiver
claramente se referindo ao tipo/categoria da despesa.


============================================================
QUANDO USAR TIPO E DESCRIÇÃO
============================================================

"Lista minhas despesas de materiais"

→ por_tipo=true
→ tipo="materiais"
→ por_descricao=false
→ descricao=null


"Lista minhas despesas com ferramentas"

→ por_tipo=true
→ tipo="ferramentas"
→ por_descricao=false
→ descricao=null


"Lista minhas despesas com tomada"

→ por_tipo=false
→ tipo="todos"
→ por_descricao=true
→ descricao="tomada"


"Resumo das minhas despesas de materiais com tomada"

Nesse caso podem existir dois filtros:

por_tipo=true
tipo="materiais"

por_descricao=true
descricao="tomada"


============================================================
FILTRO POR PERÍODO
============================================================

O período é SEMPRE obrigatório.

Sempre:

por_periodo=true

Nunca:

por_periodo=false


Se o usuário não informar período:

Use obrigatoriamente:

"últimos 30 dias"


Exemplo:

"Lista minhas despesas"

→

periodo_texto="últimos 30 dias"


Se o usuário informar período, respeite o período solicitado.

Exemplos:

hoje
ontem
esta semana
semana passada
este mês
mês passado
setembro
mês de janeiro
últimos 30 dias
últimos 6 meses
este ano
em 2025
de 1 a 15 de setembro


============================================================
TODO O PERÍODO
============================================================

Quando disser:

- todo o período
- desde o começo
- desde sempre
- sem limite de data
- todas as despesas que tenho

Use:

por_periodo=true

periodo_start="2000-01-01"

periodo_end=data de hoje

periodo_texto="todo o período"


============================================================
FORMATO DAS DATAS
============================================================

periodo_start:

YYYY-MM-DD

periodo_end:

YYYY-MM-DD

Nunca coloque:

- horário
- timezone
- T00:00:00
- texto adicional


============================================================
MOSTRAR FILTROS
============================================================

Use mostrar_filtros=true somente quando solicitado explicitamente.

Exemplos:

"mostra os filtros"

"quais filtros foram usados"

"me diga os filtros"

"quais filtros você utilizou"

Caso contrário:

mostrar_filtros=false.


============================================================
REGRAS FINAIS
============================================================

- Todas as propriedades devem existir.
- Flags devem ser true ou false.
- por_periodo sempre true.
- periodo_start nunca null.
- periodo_end nunca null.
- periodo_texto nunca null.
- tipo nunca deve ser null; use "todos" quando não houver filtro.
- descricao deve ser null quando não houver filtro.
- Não invente descrições.
- Não invente períodos.
- Não invente tipos.
- Os tipos válidos são: conducao, materiais, alimentacao, ferramentas e outras.
- Lista detalhada = resumo=false.
- Resumo/relatório/total = resumo=true.
- Retorne somente JSON válido.


Mensagem:

"""${userMessage}"""
`;
        }


        // ========================================================
        // AGENDA
        // ========================================================

        case 'agenda': {

            return `
Você é o interpretador de consultas da AGENDA.

Você NÃO consulta o banco.
Você NÃO deve responder ao usuário.
Sua função é transformar a solicitação em filtros estruturados.

Fuso horário:
America/Sao_Paulo (GMT-3)

${nowWithWeekday()}


============================================================
FORMATO OBRIGATÓRIO
============================================================

Retorne somente JSON válido:

{
  "modulo": "agenda",
  "action": "list",
  "title": null,
  "id": null,
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD"
}


============================================================
ID
============================================================

Se o usuário informar claramente o número do evento:

"id": número

e:

"title": null


Exemplos:

"Mostra o evento 1171125001"

"Consulta a agenda 1171125001"

"Lista o evento número 1171125001"


IMPORTANTE:

Não confunda telefone com ID.

Se houver dúvida, use:

"id": null


============================================================
TÍTULO
============================================================

Use title somente quando o usuário fornecer claramente
um nome, assunto ou local do evento.

Exemplos:

"Lista a reunião com João"

→ title="reunião com João"

"Mostra os eventos da obra"

→ title="obra"

Não transforme números em título.

Se o usuário informar ID:

id recebe o número
title deve ser null


============================================================
PRIORIDADE
============================================================

Se houver ID, o ID tem prioridade.

Se houver título e não houver ID, use o título.

Se não houver ID nem título, use somente o período.


============================================================
PERÍODO
============================================================

Sempre preencha:

start_date
end_date

As datas devem conter somente:

YYYY-MM-DD


Se o usuário disser:

"hoje"

→ start_date = hoje
→ end_date = hoje


"amanhã"

→ start_date = amanhã
→ end_date = amanhã


"ontem"

→ start_date = ontem
→ end_date = ontem


Se disser:

"esta semana"

use o intervalo correspondente à semana atual.


"semana passada"

use o intervalo correspondente à semana anterior.


"este mês"

use o primeiro e o último dia do mês atual.


"mês passado"

use o primeiro e o último dia do mês anterior.


"de segunda a sexta"

calcule o intervalo correspondente.


Se não informar nenhuma data:

use a data de hoje para start_date e end_date.


============================================================
REGRAS IMPORTANTES
============================================================

- Nunca retorne datas com horário.
- Nunca retorne timezone.
- Nunca invente ID.
- Nunca invente título.
- Não confunda telefone com ID.
- Sempre preencha start_date.
- Sempre preencha end_date.
- Se houver ID, title deve ser null.
- Retorne somente JSON válido.


Mensagem:

"""${userMessage}"""
`;
        }


        default:
            return null;
    }
}


// ================================================================
// EXECUTE LIST
// ================================================================

async function executeList(command, userPhone) {

    const { modulo } = command || {};

    if (!modulo) {
        return '⚠️ Módulo de listagem não informado.';
    }


    // ============================================================
    // AGENDA
    // ============================================================

    switch (modulo) {

        case 'agenda': {

            const zone = 'America/Sao_Paulo';

            const id =
                normalizeString(command.id);

            const title =
                normalizeString(command.title);

            const hasId = !!id;
            const hasTitle = !!title;


            let query = supabase
                .from('events')
                .select('*')
                .eq('user_telefone', userPhone);


            let startDT;
            let endDT;


            if (hasId) {

                query = query.eq(
                    'event_numero',
                    id
                );
            }


            else if (hasTitle) {

                query = query.ilike(
                    'title',
                    `%${title}%`
                );
            }


            else {

                if (
                    !command.start_date ||
                    !command.end_date
                ) {
                    return '⚠️ O período da agenda não foi informado.';
                }


                const range =
                    getDateRange(
                        command.start_date,
                        command.end_date,
                        zone
                    );


                if (!range.valid) {

                    console.error(
                        '❌ Datas inválidas na agenda:',
                        {
                            start_date:
                                command.start_date,

                            end_date:
                                command.end_date
                        }
                    );

                    return '⚠️ As datas informadas são inválidas.';
                }


                startDT =
                    range.startDT;

                endDT =
                    range.endDT;


                query = query
                    .gte(
                        'date',
                        range.startIso
                    )
                    .lte(
                        'date',
                        range.endIso
                    );
            }


            const {
                data: events,
                error
            } = await query.order(
                'date',
                {
                    ascending: true
                }
            );


            if (error) {

                console.error(
                    '❌ Erro ao buscar eventos:',
                    error
                );

                return '⚠️ Não foi possível buscar os eventos.';
            }


            if (!events?.length) {

                if (hasId) {

                    return `📅 Nenhum evento encontrado com o ID ${id}.`;
                }


                if (hasTitle) {

                    return `📅 Nenhum evento encontrado com o título contendo "${title}".`;
                }


                const startBr =
                    startDT.toFormat('dd/LL');

                const endBr =
                    endDT.toFormat('dd/LL');


                const periodo =
                    startBr === endBr
                        ? startBr
                        : `${startBr} a ${endBr}`;


                return `📅 Nenhum evento encontrado no período ${periodo}.`;
            }


            const list =
                events
                    .map(event => {

                        const telefone =
                            event.telefone
                                ? `\nTelefone ${event.telefone}`
                                : '';


                        return `- ID ${event.event_numero}: ${event.title}
Dia ${formatLocal(event.date)}${telefone}`;
                    })
                    .join('\n');


            if (hasId || hasTitle) {

                return `📅 Eventos encontrados:\n${list}`;
            }


            const startBr =
                startDT.toFormat('dd/LL');

            const endBr =
                endDT.toFormat('dd/LL');


            const periodo =
                startBr === endBr
                    ? startBr
                    : `${startBr} a ${endBr}`;


            return `📅 Eventos encontrados no período ${periodo}:\n${list}`;
        }


        // ========================================================
        // DESPESAS
        // ========================================================

        case 'despesas': {

            const filtros =
                command.filtros || {};


            const resumo =
                command.resumo === true;


            const porTipo =
                filtros.por_tipo === true;


            const porDescricao =
                filtros.por_descricao === true;


            const porPeriodo =
                filtros.por_periodo === true;


            const tipo =
                normalizeTipoDespesa(
                    command.tipo
                );


            const descricao =
                normalizeString(
                    command.descricao
                );


            // ----------------------------------------------------
            // VALIDAÇÃO DOS TIPOS
            // ----------------------------------------------------

            const tiposValidos = [
                'conducao',
                'materiais',
                'alimentacao',
                'ferramentas',
                'outras',
                'todos'
            ];


            if (
                porTipo &&
                !tiposValidos.includes(tipo)
            ) {

                return `⚠️ Tipo de despesa inválido: ${command.tipo}`;
            }


            // ----------------------------------------------------
            // QUERY
            // ----------------------------------------------------

            let query = supabase
                .from('despesas')
                .select('*')
                .eq(
                    'user_phone',
                    userPhone
                );


            // ----------------------------------------------------
            // FILTRO POR TIPO
            // ----------------------------------------------------

            if (
                porTipo &&
                tipo !== 'todos'
            ) {

                query = query.eq(
                    'tipo',
                    tipo
                );
            }


            // ----------------------------------------------------
            // FILTRO POR DESCRIÇÃO
            // ----------------------------------------------------

            if (
                porDescricao &&
                descricao
            ) {

                query = query.ilike(
                    'descricao',
                    `%${descricao}%`
                );
            }


            // ----------------------------------------------------
            // FILTRO POR PERÍODO
            // ----------------------------------------------------

            if (!porPeriodo) {

                return '⚠️ A consulta de despesas precisa informar um período.';
            }


            if (
                !command.periodo_start ||
                !command.periodo_end
            ) {

                return '⚠️ O filtro por período foi identificado, mas as datas não foram informadas.';
            }


            const startDate =
                DateTime
                    .fromISO(
                        command.periodo_start,
                        {
                            zone: 'America/Sao_Paulo'
                        }
                    )
                    .startOf('day');


            const endDate =
                DateTime
                    .fromISO(
                        command.periodo_end,
                        {
                            zone: 'America/Sao_Paulo'
                        }
                    )
                    .endOf('day');


            if (
                !startDate.isValid ||
                !endDate.isValid
            ) {

                console.error(
                    '❌ Datas inválidas no filtro de despesas:',
                    {
                        periodo_start:
                            command.periodo_start,

                        periodo_end:
                            command.periodo_end
                    }
                );

                return '⚠️ As datas do período informado são inválidas.';
            }


            /*
             * A coluna despesas.data está armazenando
             * a data/hora local de Brasília.
             *
             * Portanto a consulta utiliza o mesmo
             * formato local, sem conversão para UTC.
             */

            const startValue =
                startDate.toFormat(
                    'yyyy-MM-dd HH:mm:ss.SSS'
                );


            const endValue =
                endDate.toFormat(
                    'yyyy-MM-dd HH:mm:ss.SSS'
                );


            query = query
                .gte(
                    'data',
                    startValue
                )
                .lte(
                    'data',
                    endValue
                );


            // ----------------------------------------------------
            // ORDENAR
            // ----------------------------------------------------

            query = query.order(
                'data',
                {
                    ascending: false
                }
            );


            console.log(
                '🔎 FILTRO DESPESAS:',
                {
                    userPhone,
                    tipo,
                    porTipo,
                    descricao,
                    porDescricao,
                    periodo_start:
                        command.periodo_start,
                    periodo_end:
                        command.periodo_end,
                    startValue,
                    endValue
                }
            );


            const {
                data,
                error
            } = await query;


            console.log(
                '🔎 RESULTADO DESPESAS:',
                {
                    quantidade:
                        data?.length || 0,
                    data
                }
            );


            if (error) {

                console.error(
                    '❌ Erro ao listar despesas:',
                    error
                );

                return '❌ Erro ao consultar despesas.';
            }


            // ----------------------------------------------------
            // NENHUM RESULTADO
            // ----------------------------------------------------

            if (
                !data ||
                data.length === 0
            ) {

                return [
                    resumo
                        ? '📊 Nenhuma despesa encontrada para gerar o resumo.'
                        : '📋 Nenhuma despesa encontrada.',

                    '',

                    command.periodo_texto
                        ? `📅 Período: ${command.periodo_texto}`
                        : ''
                ]
                    .filter(Boolean)
                    .join('\n');
            }


            // ====================================================
            // RESUMO
            // ====================================================

            if (resumo) {

                const totais = {
                    conducao: 0,
                    materiais: 0,
                    alimentacao: 0,
                    ferramentas: 0,
                    outras: 0
                };


                data.forEach(despesa => {

                    const valor =
                        Number(
                            despesa.valor || 0
                        );


                    if (
                        Object.prototype.hasOwnProperty.call(
                            totais,
                            despesa.tipo
                        )
                    ) {

                        totais[despesa.tipo] += valor;
                    }
                });


                const totalGeral =
                    data.reduce(
                        (sum, despesa) =>
                            sum +
                            Number(
                                despesa.valor || 0
                            ),
                        0
                    );


                let titulo =
                    '📊 Despesas';


                if (command.periodo_texto) {

                    titulo +=
                        ` — ${formatPeriodoTitulo(
                            command.periodo_texto
                        )}`;
                }


                const linhas = [];


                // ------------------------------------------------
                // QUANDO HÁ FILTRO DE TIPO
                // ------------------------------------------------

                const tipoSelecionado =
                    porTipo &&
                    tipo !== 'todos';


                if (tipoSelecionado) {

                    linhas.push(
                        `${emojiTipo(tipo)} ${nomeTipo(tipo)}: ${formatCurrency(totais[tipo])}`
                    );
                }


                // ------------------------------------------------
                // SEM FILTRO DE TIPO
                // ------------------------------------------------

                else {

                    linhas.push(
                        `🚗 Condução:       ${formatCurrency(totais.conducao)}`
                    );

                    linhas.push(
                        `🔨 Materiais:      ${formatCurrency(totais.materiais)}`
                    );

                    linhas.push(
                        `🍽️ Alimentação:    ${formatCurrency(totais.alimentacao)}`
                    );

                    linhas.push(
                        `🛠️ Ferramentas:    ${formatCurrency(totais.ferramentas)}`
                    );

                    linhas.push(
                        `📦 Outras:         ${formatCurrency(totais.outras)}`
                    );
                }


                return [
                    titulo,
                    '',
                    linhas.join('\n'),
                    '────────────────────────',
                    `💰 Total: ${formatCurrency(totalGeral)}`
                ].join('\n');
            }


            // ====================================================
            // LISTA DETALHADA
            // ====================================================

            const linhas =
                data.map(despesa => {

                    return [
                        `🆔 ${despesa.despesa_numero}`,
                        `📅 ${formatDateBR(despesa.data)}`,
                        `📂 ${nomeTipo(despesa.tipo)}`,
                        `📘 ${despesa.descricao}`,
                        `💰 ${formatCurrency(despesa.valor)}`
                    ].join('\n');
                });


            const total =
                data.reduce(
                    (sum, despesa) =>
                        sum +
                        Number(
                            despesa.valor || 0
                        ),
                    0
                );


            const cabecalho = [
                '📋 *Despesas encontradas*',

                command.periodo_texto
                    ? `📅 ${command.periodo_texto}`
                    : null,

                ''
            ]
                .filter(Boolean)
                .join('\n');


            return [
                cabecalho,

                linhas.join('\n\n'),

                '',

                '────────────────────',

                `📊 Quantidade: ${data.length}`,

                `💰 Total: ${formatCurrency(total)}`
            ].join('\n');
        }


        // ========================================================
        // ORÇAMENTOS
        // ========================================================

        case 'orcamento': {

            const filtros =
                command.filtros || {};


            const porId =
                filtros.por_id === true;


            const porNome =
                filtros.por_nome_cliente === true;


            const porTelefone =
                filtros.por_telefone_cliente === true;


            const porEtapa =
                filtros.por_etapa === true;


            const porPeriodo =
                filtros.por_periodo === true;


            let query = supabase
                .from('orcamentos')
                .select('*')
                .eq(
                    'user_telefone',
                    userPhone
                );


            // ----------------------------------------------------
            // ID
            // ----------------------------------------------------

            if (porId) {

                if (
                    command.id === null ||
                    command.id === undefined ||
                    command.id === ''
                ) {

                    return '⚠️ O filtro por ID foi identificado, mas nenhum ID foi informado.';
                }


                query = query.eq(
                    'orcamento_numero',
                    command.id
                );
            }


            // ----------------------------------------------------
            // CLIENTE
            // ----------------------------------------------------

            if (porNome) {

                const nome =
                    normalizeString(
                        command.nome_cliente
                    );


                if (!nome) {

                    return '⚠️ O filtro por cliente foi identificado, mas nenhum nome foi informado.';
                }


                query = query.ilike(
                    'nome_cliente',
                    `%${nome}%`
                );
            }


            // ----------------------------------------------------
            // TELEFONE
            // ----------------------------------------------------

            if (porTelefone) {

                if (
                    !command.telefone_cliente
                ) {

                    return '⚠️ O filtro por telefone foi identificado, mas nenhum telefone foi informado.';
                }


                const telefone =
                    formatPhoneNumber(
                        command.telefone_cliente
                    );


                if (!telefone) {

                    return '⚠️ O telefone informado é inválido.';
                }


                query = query.eq(
                    'telefone_cliente',
                    telefone
                );
            }


            // ----------------------------------------------------
            // ETAPA
            // ----------------------------------------------------

            if (porEtapa) {

                const etapa =
                    normalizeEtapa(
                        command.etapa
                    );


                const etapasValidas = [
                    'negociacao',
                    'andamento',
                    'aprovado',
                    'perdido',
                    'finalizado'
                ];


                if (
                    !etapasValidas.includes(etapa)
                ) {

                    return `⚠️ Etapa inválida: ${command.etapa}`;
                }


                query = query.eq(
                    'etapa',
                    etapa
                );
            }


            // ----------------------------------------------------
            // PERÍODO
            // ----------------------------------------------------

            if (!porPeriodo) {

                return '⚠️ A consulta de orçamentos precisa informar um período.';
            }


            if (
                !command.periodo_start ||
                !command.periodo_end
            ) {

                return '⚠️ O filtro por período foi identificado, mas as datas não foram informadas.';
            }


            const range =
                getDateRange(
                    command.periodo_start,
                    command.periodo_end,
                    'America/Sao_Paulo'
                );


            if (!range.valid) {

                console.error(
                    '❌ Datas inválidas no filtro de orçamento:',
                    {
                        periodo_start:
                            command.periodo_start,

                        periodo_end:
                            command.periodo_end
                    }
                );

                return '⚠️ As datas do período informado são inválidas.';
            }


            // ----------------------------------------------------
            // DATA DO ORÇAMENTO
            // ----------------------------------------------------

            const etapaFinalizado =
                porEtapa &&
                normalizeEtapa(
                    command.etapa
                ) === 'finalizado';


            const campoData =
                etapaFinalizado
                    ? 'finalizado_em'
                    : 'criado_em';


            query = query
                .gte(
                    campoData,
                    range.startIso
                )
                .lte(
                    campoData,
                    range.endIso
                );


            // ----------------------------------------------------
            // ORDENAR
            // ----------------------------------------------------

            query = query.order(
                'criado_em',
                {
                    ascending: false
                }
            );


            // ----------------------------------------------------
            // CONSULTA
            // ----------------------------------------------------

            const {
                data: orcamentos,
                error
            } = await query;


            if (error) {

                console.error(
                    '❌ Erro ao listar orcamentos:',
                    error
                );

                return '⚠️ Não foi possível listar os orçamentos.';
            }


            // ----------------------------------------------------
            // NENHUM RESULTADO
            // ----------------------------------------------------

            if (
                !orcamentos ||
                orcamentos.length === 0
            ) {

                if (
                    command.mostrar_filtros === true
                ) {

                    return `📄 Nenhum orçamento encontrado.

🔎 Filtros utilizados:
${formatFiltrosOrcamento(command)}`;
                }


                return '📄 Nenhum orçamento encontrado.';
            }


            // ====================================================
            // RESUMO
            // ====================================================

            if (command.resumo === true) {

                const relatorio =
                    formatRelatorioOrcamentos(
                        orcamentos,
                        command.periodo_texto
                    );


                let resposta =
                    relatorio;


                if (
                    command.mostrar_filtros === true
                ) {

                    resposta +=
                        `\n\n🔎 Filtros utilizados:\n` +
                        formatFiltrosOrcamento(
                            command
                        );
                }


                return resposta;
            }


            // ====================================================
            // LISTA DETALHADA
            // ====================================================

            function wait(ms) {

                return new Promise(
                    resolve =>
                        setTimeout(
                            resolve,
                            ms
                        )
                );
            }


            for (
                let i = 0;
                i < orcamentos.length;
                i++
            ) {

                const orcamento =
                    orcamentos[i];


                await sendWhatsAppRaw({
                    messaging_product: 'whatsapp',

                    to: userPhone,

                    type: 'text',

                    text: {
                        body:
                            formatOrcamento(
                                orcamento
                            )
                    }
                });


                if (
                    i <
                    orcamentos.length - 1
                ) {

                    const delay =
                        1200 +
                        Math.floor(
                            Math.random() * 900
                        );


                    await wait(delay);
                }
            }


            let resposta =
                `✅ ${orcamentos.length} orçamento(s) enviado(s).`;


            if (command.periodo_texto) {

                resposta +=
                    `\n📅 Período: ${command.periodo_texto}`;
            }


            if (
                command.mostrar_filtros === true
            ) {

                resposta +=
                    `\n\n🔎 Filtros utilizados:\n` +
                    formatFiltrosOrcamento(
                        command
                    );
            }


            return resposta;
        }


        default:

            return `⚠️ Módulo de listagem não suportado: ${modulo}`;
    }
}


module.exports = {
    getListPrompt,
    executeList
};