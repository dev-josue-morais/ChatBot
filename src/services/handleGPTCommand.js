const { getNowBRT } = require('../utils/utils');
const openai = require('./openai');
const supabase = require("./supabase");
const { DateTime } = require('luxon');

async function handleGPTCommand(userMessage, modulo, action, id, userPhone) {
    const userMessage = (rawMessage || "").trim();
    let prompt = '';

    function nowWithWeekday() {
        const now = getNowBRT();
        const weekday = now.setLocale('pt').toFormat('cccc');
        return `Hoje é ${weekday}, ${now.toFormat("yyyy-MM-dd HH:mm:ss")}`;
    }

    switch (`${modulo}_${action}`) {

        case 'orcamento_create': {
            prompt = `
Você é um assistente comercial. O usuário está criando um novo orçamento.
Retorne somente JSON válido, sem texto adicional.

{
  "modulo": "orcamento",
  "action": "create",
  "nome_cliente": "string",
  "descricoes": ["texto1", "texto2"] | [],
  "telefone_cliente": "string",
  "etapa": "negociacao" | "finalizado" | "andamento" | "perdido" | "aprovado",
  "observacoes": ["Garantia 90 dias", "Pagamento via Pix"] | [],
  "materiais": [{ "nome": "fio 2,5mm azul", "qtd": 30, "und": "m", "valor": 2.5 }] | [],
  "servicos": [{ "titulo": "Instalação de tomada", "qtd": 10, "valor": 25.0 }] | [],
  "desconto_materiais": number | "10%" | null,
  "desconto_servicos": number | "10%" | null
}

Regras:
- Etapa padrão: "negociacao".
- Não inclua expressões matemáticas, apenas números.
- "und" pode ser "und", "m", "cm", "kit", "caixa", etc.
- Se o valor não for informado, use 0.
- Utilize os nomes completos dos itens fornecidos no texto.
- Separe itens diferentes. Ex.: 25m de fio 4mm azul e verde → 25m fio 4mm azul e 25m fio 4mm verde.
- Valores monetários devem ser números com ponto decimal.
- Ao adicionar desconto, altere somente "desconto_materiais" e/ou "desconto_servicos". Não altere os valores dos materiais ou serviços.

Texto: """${userMessage}"""
`;
            break;
        }

        case 'orcamento_edit': {
            if (!id) {
                return { error: "⚠️ É necessário informar o ID do orçamento para editar." };
            }

            const { data: currentData, error: fetchError } = await supabase
                .from('orcamentos')
                .select('*')
                .eq('orcamento_numero', id)
                .single();

            if (fetchError || !currentData) {
                return { error: `⚠️ Não encontrei o orçamento ID ${id}.` };
            }

            prompt = `
Você é um assistente comercial que edita um orçamento existente.
Retorne somente JSON válido, sem texto adicional.

{
  "modulo": "orcamento",
  "action": "edit",
  "orcamento_numero": número,
  "nome_cliente": "string",
  "descricoes": ["texto1", "texto2"] | [],
  "telefone_cliente": "string",
  "etapa": "negociacao" | "finalizado" | "andamento" | "perdido" | "aprovado",
  "observacoes": ["Garantia 90 dias", "Pagamento via Pix"] | [],
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
- Mantenha toda a estrutura original e altere somente o que o usuário pedir.
- Campos vazios podem ser null.
- Ao adicionar desconto, altere somente "desconto_materiais" e/ou "desconto_servicos". Não altere os valores dos materiais ou serviços.
- Utilize os nomes completos dos itens fornecidos no texto.
- "und" pode ser "und", "m", "cm", "kit", "caixa", etc.
- Se o valor não for informado, use 0.
- Não crie novas propriedades.
- Separe itens diferentes. Ex.: 25m de fio 4mm azul e verde → 25m fio 4mm azul e 25m fio 4mm verde.
- Valores monetários devem ser números com ponto decimal.

Retorne o orçamento completo atualizado.
`;
            break;
        }

        case 'orcamento_list': {
            prompt = `
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
    "por_periodo": false
  },
  "mostrar_filtros": false,
  "id": null,
  "nome_cliente": null,
  "telefone_cliente": null,
  "etapa": "negociacao",
  "periodo_start": null,
  "periodo_end": null,
  "periodo_texto": null
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
Ex.: "Lista o orçamento 1060926001" → por_id=true, id="1060926001".
Caso contrário: por_id=false, id=null.

FILTRO POR CLIENTE:
Se informar o nome do cliente, use por_nome_cliente=true e coloque somente o nome em "nome_cliente".
Caso contrário: por_nome_cliente=false, nome_cliente=null.

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
Se o usuário informar um período, use por_periodo=true e preencha:
periodo_start, periodo_end e periodo_texto.

Exemplos: "este mês", "últimos 30 dias", "últimos 6 meses", "este ano", "em 2025", "de março até junho".

TODO O PERÍODO:
"todo o período", "período completo", "período inteiro", "desde o começo", "desde sempre" ou "todos os orçamentos" →
por_periodo=false,
periodo_start=null,
periodo_end=null,
periodo_texto="todo o período".

Isso não altera "resumo".

Ex.:
"Lista meus orçamentos aprovados todo o período" →
resumo=false, por_etapa=true, etapa="aprovado", por_periodo=false.

"lista relatório dos meus orçamentos aprovados todo o período" →
resumo=true, por_etapa=true, etapa="aprovado", por_periodo=false.

PERÍODO PADRÃO:
Se nenhum período for informado:
por_periodo=true,
use os últimos 30 dias,
preencha periodo_start, periodo_end e periodo_texto="últimos 30 dias".

MÚLTIPLOS FILTROS:
Podem ser combinados.

"Lista todos os orçamentos de João aprovados dos últimos 6 meses" →
resumo=false,
por_nome_cliente=true,
nome_cliente="João",
por_etapa=true,
etapa="aprovado",
por_periodo=true.

"lista relatório dos orçamentos de João aprovados dos últimos 6 meses" →
resumo=true,
por_nome_cliente=true,
nome_cliente="João",
por_etapa=true,
etapa="aprovado",
por_periodo=true.

MOSTRAR FILTROS:
Use "mostrar_filtros": true somente se o usuário pedir explicitamente para mostrar os filtros utilizados. Caso contrário, false.

REGRAS FINAIS:
- Todas as propriedades devem existir.
- Use null quando não houver valor.
- Flags devem ser true ou false.
- Não invente IDs, nomes, telefones, etapas ou datas.
- LISTA = resumo=false.
- RELATÓRIO/RESUMO = resumo=true.
- Filtros de cliente, etapa e período não transformam uma lista em relatório.

Mensagem:
"""${userMessage}"""
`;
            break;
        }

        case 'agenda_create': {
            prompt = `
Você é um assistente que cria compromissos de agenda.
O usuário está no fuso GMT-3 (Brasil).
${nowWithWeekday()}

Retorne somente JSON válido.

{
  "modulo": "agenda",
  "action": "create",
  "title": "string",
  "datetime": "Data/hora ISO 8601 no GMT-3",
  "reminder_minutes": número,
  "telefone": "string" ou null
}

Regras:
- "title" deve conter o nome do compromisso, pessoa, serviço ou local informado.
- "datetime" deve ser ISO 8601 com fuso GMT-3. Use o contexto de data/hora para interpretar "amanhã", "sexta", etc.
- "reminder_minutes": use o informado pelo usuário; se não informar, use 30.
- "telefone": preencha somente se o usuário informar um telefone relacionado ao evento. Se não informar, use null.
- Não confunda o telefone do usuário com o telefone do contato do evento.
- Não invente ou complete números. Preserve o número informado, com ou sem formatação.
- Não invente informações ausentes da mensagem.

Texto: """${userMessage}"""
`;
            break;
        }

        case 'agenda_edit': {
            if (!id) {
                return { error: "⚠️ É necessário informar o ID do evento para editar." };
            }

            const { data: currentData, error: fetchError } = await supabase
                .from('events')
                .select('*')
                .eq('event_numero', id)
                .eq('user_telefone', userPhone)
                .single();

            if (fetchError || !currentData) {
                return { error: `⚠️ Não encontrei o evento ID ${id}.` };
            }

            const dateBRT = DateTime
                .fromISO(currentData.date, { zone: 'utc' })
                .setZone('America/Sao_Paulo')
                .toISO();

            prompt = `
Você é um assistente que edita eventos de uma agenda.
${nowWithWeekday()}

Retorne somente JSON válido.

{
  "modulo": "agenda",
  "action": "edit",
  "title": "string",
  "datetime": "Data/hora ISO 8601 no GMT-3",
  "reminder_minutes": número,
  "telefone": "string"
}

Regras:
- Mantenha a estrutura original e altere somente o que o usuário solicitar.
- Se o usuário não informar telefone, mantenha o telefone atual.
- Se informar novo telefone, retorne o telefone informado.
- "telefone" deve ser retornado sempre, usando o atual quando não houver alteração.
- Todas as datas devem estar em GMT-3 com offset "-03:00".
- Para "daqui X minutos/horas", "amanhã" e "mais tarde", sempre use a hora atual como base da soma.
- Para horário exato ("às 14h", "7:40"), substitua somente a hora.
- Atualize a data conforme o dia ou semana solicitado.
- "reminder_minutes" permanece o atual se não houver alteração.

Evento atual:
${JSON.stringify({
    ...currentData,
    date: dateBRT
}, null, 2)}

Mensagem:
"${userMessage}"
`;
            break;
        }

        case 'despesas_create': {
            prompt = `
Você é um assistente financeiro que registra uma nova despesa.
O usuário está no fuso GMT-3 (Brasil).
${nowWithWeekday()}

Retorne somente JSON válido.

{
  "modulo": "despesas",
  "action": "create",
  "tipo": "conducao" | "materiais" | "alimentacao" | "outras",
  "valor": número,
  "descricao": "string"
}

Classifique automaticamente:

"conducao":
gasolina, combustível, álcool combustível, diesel, estacionamento, pedágio,
transporte, ônibus, Uber, manutenção relacionada ao veículo e outras despesas
claramente relacionadas à condução.

"materiais":
tomada, interruptor, fio, cabo, disjuntor, eletroduto, eletrocalha, condulete,
lâmpada, fita de LED, material elétrico, ferramentas, materiais utilizados na
obra e qualquer material comprado para serviço.

"alimentacao":
marmita, almoço, jantar, café, lanche, comida, alimentação, bebida sem álcool
e qualquer despesa claramente relacionada à alimentação.

"outras":
despesas que não se enquadrem nas categorias acima.

DESCRIÇÃO:
Registre exatamente o que o usuário informou, sem inventar detalhes.

Exemplos:
"25 reais gasolina" → tipo="conducao", valor=25, descricao="gasolina"
"gastei 30 com marmita" → tipo="alimentacao", valor=30, descricao="marmita"
"adiciona gasto com tomada 15 reais" → tipo="materiais", valor=15, descricao="tomada"

VALOR:
- Retorne somente número, usando ponto como decimal.
- Não inclua "R$".
- Não faça cálculos nem invente valores.
- Se o valor não puder ser identificado, use 0.

Texto:
"""${userMessage}"""
`;
            break;
        }

        case 'despesas_edit': {
            if (!id) {
                return { error: "⚠️ Informe o ID da despesa." };
            }

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
Retorne somente JSON válido, sem explicações ou markdown.

{
  "modulo": "despesas",
  "action": "edit",
  "despesa_numero": "${id}",
  "tipo": "conducao" | "materiais" | "alimentacao" | "outras",
  "valor": número,
  "descricao": "string"
}

Despesa atual:
${JSON.stringify(currentData, null, 2)}

Instruções:
"${userMessage}"

Regras:
- Mantenha os dados atuais e altere somente o que o usuário solicitar.
- Se a descrição mudar e ficar evidente que a categoria também mudou, atualize "tipo".
- "Altera para gasolina" → descricao="gasolina", tipo="conducao"
- "Altera para marmita" → descricao="marmita", tipo="alimentacao"
- "Altera para tomada" → descricao="tomada", tipo="materiais"
- Tipos permitidos: "conducao", "materiais", "alimentacao", "outras".
- Não altere "despesa_numero".
- Não crie novas propriedades.
- Valores monetários devem ser números usando ponto como decimal.

Retorne a despesa completa após a alteração.
`;
            break;
        }

        case 'despesas_list': {
            prompt = `
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
    "por_periodo": false
  },
  "mostrar_filtros": false,
  "tipo": "conducao" | "materiais" | "alimentacao" | "outras" | "todos",
  "descricao": null,
  "periodo_start": null,
  "periodo_end": null,
  "periodo_texto": null
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
"Me mostre o total que gastei com combustível" → true, por_descricao=true, descricao="combustível"

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
Use por_periodo=true quando o usuário informar qualquer período.

Exemplos:
hoje, ontem, essa semana, semana passada, este mês, mês passado,
setembro, em setembro de 2026, últimos 30 dias, últimos 6 meses,
de 1 a 15 de setembro, desde o começo do mês.

Quando houver período, preencha:
periodo_start, periodo_end e periodo_texto.

As datas devem considerar GMT-3 e usar ISO 8601.

SEM PERÍODO:
Se nenhum período for informado:
por_periodo=true,
use os últimos 30 dias,
periodo_start=data/hora de 30 dias atrás,
periodo_end=data/hora atual,
periodo_texto="últimos 30 dias".

TODO O PERÍODO:
"todo o período", "desde o começo", "desde sempre", "sem limite de data"
ou "todas as despesas que tenho" →
por_periodo=false,
periodo_start=null,
periodo_end=null,
periodo_texto="todo o período".

Não crie datas artificiais.

COMBINAÇÃO:
Os filtros podem ser combinados.

"Resumo das minhas despesas de gasolina desse mês" →
resumo=true,
por_tipo=false,
tipo="todos",
por_descricao=true,
descricao="gasolina",
por_periodo=true.

"Resumo das minhas despesas de material da semana" →
resumo=true,
por_tipo=true,
tipo="materiais",
por_descricao=false,
por_periodo=true.

"Resumo das minhas despesas com tomada em setembro" →
resumo=true,
por_tipo=false,
tipo="todos",
por_descricao=true,
descricao="tomada",
por_periodo=true.

MOSTRAR FILTROS:
Use mostrar_filtros=true somente se o usuário pedir:
"mostre os filtros", "quais filtros foram usados",
"me diga os filtros" ou "mostrar filtros".
Caso contrário, false.

REGRAS:
- Todas as propriedades devem existir.
- Flags devem ser true ou false.
- Não invente datas, categorias ou descrições.
- O handle consultará o banco usando somente os filtros marcados como true.
- Quando resumo=true, o handle calcula os valores agrupados por categoria:
  Condução, Materiais, Alimentação, Outras e Total.
- Quando resumo=false, o handle apresenta as despesas individualmente.

Texto:
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