const supabase = require('../services/supabase');
const { DateTime } = require('luxon');

const {
    TIPOS_DESPESA,
    emojiTipo,
    formatPeriodoTitulo,
    formatDateBR,
    nomeTipo,
    formatRelatorioOrcamentos,
    formatFiltrosOrcamento,
    getDateRange
} = require('../utils/handlersFunctions');

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


// PROMPTS DE LISTAGEM

function nowWithWeekday() {

    const now = getNowBRT();

    const weekday =
        now
            .setLocale('pt')
            .toFormat('cccc');

    return `Hoje é ${weekday}, ${now.toFormat("yyyy-MM-dd HH:mm:ss")}`;
}


async function getListPrompt(modulo, userMessage) {

    switch (modulo) {


        // ORÇAMENTO

        case 'orcamento': {

            return `
Você interpreta comandos para consultar orçamentos.

Fuso horário: GMT-3.
${nowWithWeekday()}

Retorne somente JSON válido.

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
  "etapa": "negociacao",
  "periodo_start": "YYYY-MM-DD",
  "periodo_end": "YYYY-MM-DD",
  "periodo_texto": "últimos 15 dias"
}

RESUMO:
Use "resumo": true somente para RESUMO ou RELATÓRIO consolidado.

Ative para:
- relatório
- resumo
- panorama
- total de orçamentos
- quantidade de orçamentos
- quantidade por etapa
- valores por etapa
- quanto tenho em orçamentos
- valor total dos orçamentos
- situação geral dos orçamentos

"lista", "listar", "mostrar", "mostra", "consultar" e "ver meus orçamentos" significam "resumo": false, mesmo com filtros.

Exemplos:
"Lista meus orçamentos" → resumo=false
"Lista meus orçamentos aprovados" → resumo=false
"Lista meus orçamentos de João todo o período" → resumo=false
"lista relatório dos meus orçamentos" → resumo=true
"lista resumo dos meus orçamentos aprovados" → resumo=true
"lista resumo dos orçamentos de João em andamento" → resumo=true

Nunca transforme uma LISTA em resumo=true apenas por possuir filtros.

FILTRO POR ID:
Use "por_id": true somente quando o usuário informar claramente o ID do orçamento.

Ex.:
"Lista o orçamento 1060926001" →
por_id=true, id="1060926001".

Caso contrário:
por_id=false, id=null.

FILTRO POR CLIENTE:
Se informar o nome do cliente, use por_nome_cliente=true e coloque somente o nome em "nome_cliente".

Caso contrário:
por_nome_cliente=false, nome_cliente=null.

FILTRO POR TELEFONE:
Use por_telefone_cliente=true somente quando o usuário informar claramente um telefone de cliente.

Nunca confunda telefone com ID.

FILTRO POR ETAPA:
Use por_etapa=true somente quando informar explicitamente uma etapa/status.

Valores:
- negociação / em negociação → negociacao
- andamento / em andamento → andamento
- aprovado / aprovados → aprovado
- perdido / perdidos / recusado / recusados → perdido
- finalizado / finalizados → finalizado

Exemplos:
"Lista meus orçamentos aprovados" →
resumo=false, por_etapa=true, etapa="aprovado"

"Lista meus orçamentos em negociação" →
resumo=false, por_etapa=true, etapa="negociacao"

"lista relatório dos orçamentos aprovados" →
resumo=true, por_etapa=true, etapa="aprovado"

Se nenhuma etapa for informada:
por_etapa=false, etapa="negociacao".

Quando por_etapa=false, "etapa" não deve ser usada como filtro.

FILTRO POR PERÍODO:
O filtro por período é SEMPRE obrigatório para consultas de orçamento.

Sempre use:
por_periodo=true

Nunca use:
por_periodo=false

Sempre preencha:
- periodo_start
- periodo_end
- periodo_texto

Se o usuário informar um período, interprete o período solicitado e preencha as três propriedades.

Se o usuário NÃO informar nenhum período, use obrigatoriamente o período padrão de:
"últimos 15 dias"

Nesse caso:
por_periodo=true

periodo_start = data de 15 dias atrás, no fuso GMT-3.

periodo_end = data de hoje, no fuso GMT-3.

periodo_texto = "últimos 15 dias"

FORMATO DAS DATAS:
"periodo_start" e "periodo_end" devem sempre conter SOMENTE uma data no formato:

YYYY-MM-DD

NÃO coloque horário.
NÃO coloque fuso horário.
NÃO coloque T00:00:00.
NÃO coloque texto antes ou depois da data.

Exemplo:
"periodo_start": "2026-09-14"
"periodo_end": "2026-09-29"

O sistema será responsável por transformar essas datas em início e fim do dia usando o fuso America/Sao_Paulo.

FORMATO DE "periodo_texto":
"periodo_texto" deve ser uma descrição curta, clara e em português do período utilizado.

Exemplos:

"hoje" →
periodo_texto="hoje"

"ontem" →
periodo_texto="ontem"

"esta semana" →
periodo_texto="esta semana"

"semana passada" →
periodo_texto="semana passada"

"este mês" →
periodo_texto="este mês"

"mês passado" →
periodo_texto="mês passado"

"últimos 15 dias" →
periodo_texto="últimos 15 dias"

"últimos 30 dias" →
periodo_texto="últimos 30 dias"

"últimos 6 meses" →
periodo_texto="últimos 6 meses"

"este ano" →
periodo_texto="este ano"

"em 2025" →
periodo_texto="ano de 2025"

"de março até junho" →
periodo_texto="março a junho"

"de 1 a 15 de setembro" →
periodo_texto="01/09 a 15/09"

Não coloque as datas em "periodo_texto".

O "periodo_texto" deve ser apenas uma descrição legível para apresentação ao usuário.

Exemplo completo:
"Lista meus orçamentos dos últimos 30 dias" →

por_periodo=true,
periodo_start="2026-08-30",
periodo_end="2026-09-29",
periodo_texto="últimos 30 dias"

TODO O PERÍODO:
Quando o usuário disser:
"todo o período",
"período completo",
"período inteiro",
"desde o começo",
"desde sempre"
ou
"todos os orçamentos"

NÃO desative o filtro de período.

Como o período é obrigatório, use:

periodo_start = "2000-01-01"
periodo_end = data de hoje no GMT-3.
periodo_texto = "todo o período"

Isso não altera "resumo".

Ex.:
"Lista meus orçamentos aprovados todo o período" →

resumo=false,
por_etapa=true,
etapa="aprovado",
por_periodo=true,
periodo_start="2000-01-01",
periodo_end="2026-09-29",
periodo_texto="todo o período"

MÚLTIPLOS FILTROS:
Podem ser combinados.

"Lista todos os orçamentos de João aprovados dos últimos 6 meses" →

resumo=false,
por_nome_cliente=true,
nome_cliente="João",
por_etapa=true,
etapa="aprovado",
por_periodo=true

"lista relatório dos orçamentos de João aprovados dos últimos 6 meses" →

resumo=true,
por_nome_cliente=true,
nome_cliente="João",
por_etapa=true,
etapa="aprovado",
por_periodo=true

MOSTRAR FILTROS:
Use "mostrar_filtros": true somente se o usuário pedir explicitamente para mostrar os filtros utilizados.

Exemplos:
"mostra os filtros"
"quais filtros foram usados"
"me mostre os filtros"

Caso contrário:
mostrar_filtros=false.

REGRAS FINAIS:
- Todas as propriedades devem existir.
- Use null somente para campos que realmente não possuem informação.
- "periodo_start" NUNCA pode ser null.
- "periodo_end" NUNCA pode ser null.
- "periodo_texto" NUNCA pode ser null.
- "por_periodo" deve ser sempre true.
- Sempre existe um período: período solicitado ou últimos 15 dias.
- "periodo_start" e "periodo_end" devem conter SOMENTE YYYY-MM-DD.
- Nunca coloque horário ou fuso nas datas.
- "periodo_texto" deve ser curto, legível e descrever o período usado.
- Flags devem ser true ou false.
- Não invente IDs, nomes, telefones ou etapas.
- LISTA = resumo=false.
- RELATÓRIO/RESUMO = resumo=true.
- Filtros de cliente, etapa e período não transformam uma lista em relatório.

Mensagem:
"""${userMessage}"""
`;
        }


        // DESPESAS

        case 'despesas': {

            return `
Você interpreta comandos para listar despesas ou gerar resumo de despesas.
O usuário está no fuso GMT-3 (Brasil).
${nowWithWeekday()}

Identifique os filtros solicitados e se o usuário deseja LISTAGEM detalhada ou RESUMO agrupado.

Retorne somente JSON válido.

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
  "tipo": "conducao" | "materiais" | "alimentacao" | "outras" | "todos",
  "descricao": null,
  "periodo_start": "YYYY-MM-DD",
  "periodo_end": "YYYY-MM-DD",
  "periodo_texto": "últimos 30 dias"
}

RESUMO:
Use resumo=true quando o usuário pedir RESUMO, TOTAL, SOMATÓRIO ou RELATÓRIO resumido.

Exemplos:
"Resumo das minhas despesas do mês" → true
"Resumo das minhas despesas" → true
"Quero um resumo dos meus gastos" → true
"Relatório das minhas despesas do mês" → true
"Quanto gastei esse mês?" → true
"Qual o total das minhas despesas?" → true
"Me mostre o total que gastei com combustível" →
resumo=true, por_descricao=true, descricao="combustível"
Se pedir para LISTAR ou MOSTRAR as despesas individualmente:
resumo=false.

Exemplos:
"Lista minhas despesas do mês" → false
"Mostra minhas despesas" → false

FILTRO POR TIPO:
Use por_tipo=true quando o usuário solicitar explicitamente uma categoria:
"conducao", "materiais", "alimentacao" ou "outras".

"conducao" inclui deslocamento/transporte, como combustível, gasolina, diesel,
etanol, Uber, táxi, estacionamento, pedágio e transporte.

Porém, quando o usuário especificar uma despesa concreta, como combustível,
gasolina, diesel, Uber, estacionamento ou pedágio, trate como FILTRO POR
DESCRIÇÃO, não como filtro por tipo.

Exemplos:
"Lista minhas despesas de condução" →
por_tipo=true, tipo="conducao", por_descricao=false, descricao=null

"Resumo das minhas despesas de combustível" →
por_tipo=false, tipo="todos", por_descricao=true, descricao="combustível"

"Lista minhas despesas de gasolina" →
por_tipo=false, tipo="todos", por_descricao=true, descricao="gasolina"

"Lista minhas despesas de Uber" →
por_tipo=false, tipo="todos", por_descricao=true, descricao="Uber"

"Lista minhas despesas de estacionamento" →
por_tipo=false, tipo="todos", por_descricao=true, descricao="estacionamento"

"Lista minhas despesas de material" →
por_tipo=true, tipo="materiais", por_descricao=false

"Lista minhas despesas de alimentação" →
por_tipo=true, tipo="alimentacao", por_descricao=false

"Lista minhas outras despesas" →
por_tipo=true, tipo="outras", por_descricao=false

FILTRO POR DESCRIÇÃO:
Os termos abaixo devem ser tratados como descrição:
combustível, gasolina, diesel, etanol, álcool, Uber, taxi, táxi,
estacionamento, pedágio, mecânico, oficina.

Esses termos não devem automaticamente definir tipo="conducao".

Use por_descricao=true quando o usuário procurar uma despesa específica pelo nome.

Exemplos:
"Lista minhas despesas com gasolina" →
por_descricao=true, descricao="gasolina"

"Resumo das minhas despesas com gasolina" →
por_descricao=true, descricao="gasolina"

"Lista meus gastos com tomada" →
por_descricao=true, descricao="tomada"

"Quanto gastei com gasolina?" →
resumo=true, por_descricao=true, descricao="gasolina"

Uma palavra pode representar categoria ou descrição:

"Lista minhas despesas de material" →
por_tipo=true, tipo="materiais", por_descricao=false

"Lista minhas despesas com tomada" →
por_tipo=false, tipo="todos", por_descricao=true, descricao="tomada"

FILTRO POR PERÍODO:
O filtro por período é SEMPRE obrigatório.

Sempre use:
por_periodo=true

Nunca use:
por_periodo=false

Sempre preencha:
- periodo_start
- periodo_end
- periodo_texto

Se o usuário informar um período, interprete o período solicitado e preencha
as três propriedades.

Exemplos de períodos:
hoje, ontem, essa semana, semana passada, este mês, mês passado,
setembro, mês de janeiro, últimos 30 dias, últimos 6 meses,
de 1 a 15 de setembro, desde o começo do mês, etc.

FORMATO DAS DATAS:
"periodo_start" e "periodo_end" devem sempre conter SOMENTE uma data no formato:

YYYY-MM-DD

NÃO coloque horário.
NÃO coloque fuso horário.
NÃO coloque T00:00:00.
NÃO coloque texto antes ou depois da data.

Exemplo:

"periodo_start": "2026-09-01"
"periodo_end": "2026-09-29"

O sistema será responsável por transformar essas datas em início e fim do dia usando o fuso America/Sao_Paulo.

FORMATO DE "periodo_texto":
"periodo_texto" deve ser uma descrição curta, clara e legível em português
do período utilizado.

Exemplos:

"hoje" →
periodo_texto="hoje"

"ontem" →
periodo_texto="ontem"

"essa semana" →
periodo_texto="esta semana"

"semana passada" →
periodo_texto="semana passada"

"este mês" →
periodo_texto="este mês"

"mês passado" →
periodo_texto="mês passado"

"setembro" →
periodo_texto="setembro"

"últimos 30 dias" →
periodo_texto="últimos 30 dias"

"últimos 6 meses" →
periodo_texto="últimos 6 meses"

"este ano" →
periodo_texto="este ano"

"em 2025" →
periodo_texto="ano de 2025"

"de 1 a 15 de setembro" →
periodo_texto="01/09 a 15/09"

Não coloque as datas em "periodo_texto".

O "periodo_texto" serve apenas para apresentar ao usuário qual período
foi utilizado na consulta.

SEM PERÍODO:
Se nenhum período for informado, use obrigatoriamente:

"últimos 30 dias"

Nesse caso:

por_periodo=true

periodo_start = data de 30 dias atrás, no fuso GMT-3.

periodo_end = data de hoje, no fuso GMT-3.

periodo_texto="últimos 30 dias"

TODO O PERÍODO:
Quando o usuário disser:

"todo o período"
"desde o começo"
"desde sempre"
"sem limite de data"
"todas as despesas que tenho"

O período continua obrigatório.

Use:

por_periodo=true

periodo_start="2000-01-01"

periodo_end=data de hoje no GMT-3

periodo_texto="todo o período"

Não use null nas propriedades de período.

COMBINAÇÃO:
Os filtros podem ser combinados.

"Resumo das minhas despesas de gasolina desse mês" →
resumo=true,
por_tipo=false,
tipo="todos",
por_descricao=true,
descricao="gasolina",
por_periodo=true

"Resumo das minhas despesas de material da semana" →
resumo=true,
por_tipo=true,
tipo="materiais",
por_descricao=false,
por_periodo=true

"Resumo das minhas despesas com tomada em setembro" →
resumo=true,
por_tipo=false,
tipo="todos",
por_descricao=true,
descricao="tomada",
por_periodo=true

MOSTRAR FILTROS:
Use mostrar_filtros=true somente se o usuário pedir:

"mostre os filtros"
"quais filtros foram usados"
"me diga os filtros"
"mostrar filtros"

Caso contrário:
mostrar_filtros=false.

REGRAS FINAIS:
- Todas as propriedades devem existir.
- Flags devem ser true ou false.
- "por_periodo" deve ser sempre true.
- "periodo_start" NUNCA pode ser null.
- "periodo_end" NUNCA pode ser null.
- "periodo_texto" NUNCA pode ser null.
- Sempre existe um período: período solicitado ou últimos 30 dias.
- "periodo_start" e "periodo_end" devem conter SOMENTE YYYY-MM-DD.
- Nunca coloque horário ou fuso nas datas.
- "periodo_texto" deve ser curto, legível e descrever o período utilizado.
- Não invente categorias ou descrições.
- O handle consultará o banco usando somente os filtros marcados como true.
- Quando resumo=true, o handle calcula os valores agrupados por categoria:
  Condução, Materiais, Alimentação, Outras e Total.
- Quando resumo=false, o handle apresenta as despesas individualmente.

Texto:
"""${userMessage}"""
`;
        }


        // AGENDA

        case 'agenda': {

            return `
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

1. ID sempre prevalece sobre título
   - preencher se o usuário mencionar um ID (ex: "1171125001"),
   - Quando "id" estiver preenchido, "title" deve ser null.

2. Título
   - Só preencha "title" se o usuário citar nome ou local.
   - Não trate números como título.

3. Datas
   - Sempre preencher "start_date" e "end_date".
   - As datas devem conter SOMENTE YYYY-MM-DD.
   - Se o usuário citar dias como "amanhã", "sábado", etc → usar exatamente esse dia.
   - Se citar um período ("de segunda a sexta") → gerar um intervalo correspondente.
   - Se não falar nada sobre data → usar a data de hoje para ambos.

4. Não invente nada. Analise somente o texto fornecido.

Texto: """${userMessage}"""
`;
        }


        default:
            return null;
    }
}

// EXECUÇÃO DAS LISTAGENS


async function executeList(command, userPhone) {

    const { modulo } = command || {};

    switch (modulo) {


        // AGENDA

        case 'agenda': {

            const zone = 'America/Sao_Paulo';

            const hasId = !!command.id;
            const hasTitle = !!command.title;

            let query = supabase
                .from('events')
                .select('*')
                .eq('user_telefone', userPhone);

            let startDT;
            let endDT;

            if (hasId) {

                query = query.eq(
                    'event_numero',
                    command.id
                );
            }

            else if (hasTitle) {

                query = query.ilike(
                    'title',
                    `%${command.title}%`
                );
            }

            else {

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
                            start_date: command.start_date,
                            end_date: command.end_date
                        }
                    );

                    return '⚠️ As datas informadas são inválidas.';
                }

                startDT = range.startDT;
                endDT = range.endDT;

                query = query
                    .gte('date', range.startIso)
                    .lte('date', range.endIso);
            }

            const {
                data: events,
                error
            } = await query.order(
                'date',
                { ascending: true }
            );

            if (error) {

                console.error(
                    "❌ Erro ao buscar eventos:",
                    error
                );

                return "⚠️ Não foi possível buscar os eventos.";
            }

            if (!events?.length) {

                if (hasId || hasTitle) {

                    if (hasId) {
                        return `📅 Nenhum evento encontrado com o ID ${command.id}.`;
                    }

                    return `📅 Nenhum evento encontrado com o título contendo "${command.title}".`;
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

            const list = events
                .map(e => {

                    const telefone = e.telefone
                        ? `\nTelefone ${e.telefone}`
                        : '';

                    return `- ID ${e.event_numero}: ${e.title}
Dia ${formatLocal(e.date)}${telefone}`;
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


        // DESPESAS

        case 'despesas': {

            console.log(
                '🧠 JSON recebido do GPT para lista despesas:',
                JSON.stringify(command, null, 2)
            );

            const filtros =
                command.filtros || {};

            const resumo =
                command.resumo === true;

            let query = supabase
                .from('despesas')
                .select('*')
                .eq('user_phone', userPhone);

            if (
                filtros.por_tipo === true &&
                command.tipo &&
                command.tipo !== 'todos'
            ) {

                query = query.eq(
                    'tipo',
                    command.tipo
                );
            }

            if (
                filtros.por_descricao === true &&
                command.descricao
            ) {

                query = query.ilike(
                    'descricao',
                    `%${command.descricao}%`
                );
            }

            if (filtros.por_periodo === true) {

                if (
                    !command.periodo_start ||
                    !command.periodo_end
                ) {

                    return '⚠️ O filtro por período foi identificado, mas as datas não foram informadas.';
                }

                const range =
                    getDateRange(
                        command.periodo_start,
                        command.periodo_end
                    );

                if (!range.valid) {

                    console.error(
                        '❌ Datas inválidas no filtro de despesas:',
                        {
                            periodo_start: command.periodo_start,
                            periodo_end: command.periodo_end
                        }
                    );

                    return '⚠️ As datas do período informado são inválidas.';
                }

                query = query
                    .gte(
                        'data',
                        range.startIso
                    )
                    .lte(
                        'data',
                        range.endIso
                    );
            }

            query = query.order(
                'data',
                { ascending: false }
            );

            const {
                data,
                error
            } = await query;

            if (error) {

                console.error(
                    'Erro ao listar despesas:',
                    error
                );

                return "❌ Erro ao consultar despesas.";
            }

            if (!data || data.length === 0) {

                return [
                    resumo
                        ? "📊 Nenhuma despesa encontrada para gerar o resumo."
                        : "📋 Nenhuma despesa encontrada.",
                    "",
                    command.periodo_texto
                        ? `📅 Período: ${command.periodo_texto}`
                        : ""
                ]
                    .filter(Boolean)
                    .join('\n');
            }

            if (resumo) {

                const totais = {
                    conducao: 0,
                    materiais: 0,
                    alimentacao: 0,
                    outras: 0
                };

                data.forEach((d) => {

                    const valor =
                        Number(d.valor || 0);

                    if (
                        Object.prototype.hasOwnProperty.call(
                            totais,
                            d.tipo
                        )
                    ) {

                        totais[d.tipo] += valor;
                    }
                });

                const totalGeral =
                    data.reduce(
                        (sum, d) =>
                            sum + Number(d.valor || 0),
                        0
                    );

                let titulo =
                    "📊 Despesas";

                if (command.periodo_texto) {

                    titulo +=
                        ` — ${formatPeriodoTitulo(
                            command.periodo_texto
                        )}`;
                }

                const linhas = [];

                const tipoSelecionado =
                    filtros.por_tipo === true &&
                    command.tipo &&
                    command.tipo !== 'todos';

                if (tipoSelecionado) {

                    linhas.push(
                        `${emojiTipo(command.tipo)} ${nomeTipo(command.tipo)}:       ${formatCurrency(totais[command.tipo])}`
                    );

                } else {

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
                        `📦 Outras:         ${formatCurrency(totais.outras)}`
                    );
                }

                return [
                    titulo,
                    "",
                    linhas.join('\n'),
                    "────────────────────────",
                    `💰 Total: ${formatCurrency(totalGeral)}`
                ].join('\n');
            }

            const linhas = data.map((d) => {

                return [
                    `🆔 ${d.despesa_numero}`,
                    `📅 ${formatDateBR(d.data)}`,
                    `📂 ${nomeTipo(d.tipo)}`,
                    `📘 ${d.descricao}`,
                    `💰 ${formatCurrency(d.valor)}`
                ].join('\n');

            });

            const total =
                data.reduce(
                    (sum, d) =>
                        sum + Number(d.valor || 0),
                    0
                );

            const cabecalho = [
                "📋 *Despesas encontradas*",
                command.periodo_texto
                    ? `📅 ${command.periodo_texto}`
                    : null,
                ""
            ]
                .filter(Boolean)
                .join('\n');

            return [
                cabecalho,
                linhas.join('\n\n'),
                "",
                "────────────────────",
                `📊 Quantidade: ${data.length}`,
                `💰 Total: ${formatCurrency(total)}`
            ].join('\n');
        }


        // ORÇAMENTO

        case 'orcamento': {

            const filtros =
                command.filtros || {};

            let query = supabase
                .from('orcamentos')
                .select('*')
                .eq('user_telefone', userPhone);

            if (filtros.por_id === true) {

                if (!command.id) {

                    return '⚠️ O filtro por ID foi identificado, mas nenhum ID foi informado.';
                }

                query = query.eq(
                    'orcamento_numero',
                    command.id
                );
            }

            if (filtros.por_nome_cliente === true) {

                if (!command.nome_cliente) {

                    return '⚠️ O filtro por cliente foi identificado, mas nenhum nome foi informado.';
                }

                const nome =
                    String(command.nome_cliente)
                        .trim();

                query = query.ilike(
                    'nome_cliente',
                    `%${nome}%`
                );
            }

            if (filtros.por_telefone_cliente === true) {

                if (!command.telefone_cliente) {

                    return '⚠️ O filtro por telefone foi identificado, mas nenhum telefone foi informado.';
                }

                const telefone =
                    formatPhoneNumber(
                        command.telefone_cliente
                    );

                query = query.eq(
                    'telefone_cliente',
                    telefone
                );
            }

            if (filtros.por_etapa === true) {

                const etapa =
                    String(command.etapa || '')
                        .trim()
                        .toLowerCase();

                const etapasValidas = [
                    'negociacao',
                    'andamento',
                    'aprovado',
                    'perdido',
                    'finalizado'
                ];

                if (!etapasValidas.includes(etapa)) {

                    return `⚠️ Etapa inválida: ${command.etapa}`;
                }

                query = query.eq(
                    'etapa',
                    etapa
                );
            }

            if (filtros.por_periodo === true) {

                if (
                    !command.periodo_start ||
                    !command.periodo_end
                ) {

                    return '⚠️ O filtro por período foi identificado, mas as datas não foram informadas.';
                }

                const range =
                    getDateRange(
                        command.periodo_start,
                        command.periodo_end
                    );

                if (!range.valid) {

                    console.error(
                        '❌ Datas inválidas no filtro de orçamento:',
                        {
                            periodo_start: command.periodo_start,
                            periodo_end: command.periodo_end
                        }
                    );

                    return '⚠️ As datas do período informado são inválidas.';
                }

                const etapaFinalizado =
                    filtros.por_etapa === true &&
                    String(command.etapa || '')
                        .trim()
                        .toLowerCase() === 'finalizado';

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
            }

            query = query.order(
                'criado_em',
                { ascending: false }
            );

            const {
                data: orcamentos,
                error
            } = await query;

            if (error) {

                console.error(
                    "Erro ao listar orcamentos:",
                    error
                );

                return "⚠️ Não foi possível listar os orçamentos.";
            }

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

                return "📄 Nenhum orçamento encontrado.";
            }

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

                const o =
                    orcamentos[i];

                await sendWhatsAppRaw({
                    messaging_product: "whatsapp",
                    to: userPhone,
                    type: "text",
                    text: {
                        body: formatOrcamento(o)
                    },
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