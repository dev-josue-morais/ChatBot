const openai = require('../services/openai');
const supabase = require('../services/supabase');
const { DateTime } = require('luxon');

const {
    getNowBRT,
    formatLocal,
    formatDateBR,
    formatCurrency,
    formatPhoneNumber
} = require('../utils/utils');

const formatOrcamento = require('../utils/formatOrcamento');

const {
    normalizeMoney,
    deleteOldEvents,
    TIPOS_DESPESA,
    nomeTipo
} = require('../utils/handlersFunctions');

// ======================================================
// DATA / HORA
// ======================================================

function nowWithWeekday() {
    const now = getNowBRT();
    const weekday = now.setLocale('pt').toFormat('cccc');

    return `Hoje é ${weekday}, ${now.toFormat("yyyy-MM-dd HH:mm:ss")}`;
}


// ======================================================
// GPT — CREATE
// ======================================================

function getCreatePrompt(modulo, userMessage) {

    switch (modulo) {

        case 'orcamento':

            return `
Você é um assistente comercial. O usuário está criando um novo orçamento.

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


        case 'agenda':

            return `
Você é um assistente que cria compromissos de agenda.
O usuário está no fuso GMT-3 (Brasil).
${nowWithWeekday()}

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


        case 'despesas':

            return `
Você é um assistente financeiro que registra uma nova despesa.
O usuário está no fuso GMT-3 (Brasil).
${nowWithWeekday()}

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

Texto: """${userMessage}"""
`;


        default:
            return null;
    }
}


// ======================================================
// SUPABASE — CREATE
// ======================================================

async function executeCreate(command, userPhone) {

    if (!userPhone) {
        console.error('executeCreate: userPhone não informado.');
        return "❌ Não foi possível identificar o usuário.";
    }

    switch (command.modulo) {

        // ==================================================
        // ORÇAMENTO
        // ==================================================

        case 'orcamento': {

            if (!command.nome_cliente) {
                return "⚠️ O campo *nome do cliente* é obrigatório.";
            }

            if (!command.telefone_cliente) {
                return "⚠️ O campo *telefone do cliente* é obrigatório.";
            }

            const materiais = Array.isArray(command.materiais)
                ? command.materiais.map(m => ({
                    ...m,
                    qtd: normalizeMoney(m.qtd),
                    valor: normalizeMoney(m.valor),
                    unidade: m.und
                }))
                : [];

            const servicos = Array.isArray(command.servicos)
                ? command.servicos.map(s => ({
                    ...s,
                    quantidade: normalizeMoney(s.qtd),
                    valor: normalizeMoney(s.valor)
                }))
                : [];

            const observacoes = Array.isArray(command.observacoes)
                ? command.observacoes.filter(Boolean)
                : [];

            const descricoes = Array.isArray(command.descricoes)
                ? command.descricoes
                    .map(d => String(d).replace(/\n/g, '').trim())
                    .filter(Boolean)
                : [];

            const telefone_cliente =
    formatPhoneNumber(command.telefone_cliente);

const { data, error } = await supabase
    .from('orcamentos')
    .insert([{
        nome_cliente: command.nome_cliente,
        telefone_cliente,
        etapa: command.etapa || "negociacao",
        observacoes,
        descricoes,
        materiais,
        servicos,
        desconto_materiais: normalizeMoney(
            command.desconto_materiais
        ),
        desconto_servicos: normalizeMoney(
            command.desconto_servicos
        ),
        user_telefone: userPhone
    }])
    .select();

            if (error) {
                console.error("Erro ao criar orçamento:", error);

                return `⚠️ Não consegui criar o orçamento para "${command.nome_cliente}".`;
            }

            return formatOrcamento(data[0]);
        }


        // ==================================================
        // AGENDA
        // ==================================================

        case 'agenda': {

            let date = null;

            if (command.datetime) {
                date = DateTime
                    .fromISO(
                        command.datetime,
                        { zone: 'America/Sao_Paulo' }
                    )
                    .toUTC()
                    .toISO();
            }

            const telefone =
                formatPhoneNumber(command.telefone ?? null);

            const { data, error } = await supabase
                .from('events')
                .insert([{
                    title: command.title,
                    date,
                    reminder_minutes:
                        command.reminder_minutes || 30,
                    user_telefone: userPhone,
                    telefone
                }])
                .select(
                    'event_numero, title, date, telefone'
                );

            if (error) {
                console.error(
                    '❌ Erro ao criar evento:',
                    error
                );

                console.error(
                    '📦 Payload enviado ao Supabase:',
                    JSON.stringify(command, null, 2)
                );

                return '⚠️ Erro ao criar evento.';
            }

            await deleteOldEvents(userPhone);

            const telefonetext = data[0].telefone
                ? `\ntelefone ${data[0].telefone}`
                : '';

            return `✅ Evento criado: ${data[0].title}
ID ${data[0].event_numero}
dia ${formatLocal(data[0].date)}${telefonetext}`;
        }


        // ==================================================
        // DESPESAS
        // ==================================================

        case 'despesas': {

            const {
                tipo,
                valor,
                descricao
            } = command;

            if (!descricao || !String(descricao).trim()) {
                return "⚠️ A descrição é obrigatória.";
            }

            if (!tipo || !TIPOS_DESPESA.includes(tipo)) {
                return "⚠️ Tipo de despesa inválido.";
            }

            const valorNumerico = Number(valor);

            if (
                !Number.isFinite(valorNumerico) ||
                valorNumerico < 0
            ) {
                return "⚠️ Informe um valor válido para a despesa.";
            }

            const { data, error } = await supabase
                .from('despesas')
                .insert({
                    tipo,
                    valor: valorNumerico,
                    descricao: String(descricao).trim(),
                    user_phone: userPhone
                })
                .select('*')
                .single();

            if (error) {
                console.error(
                    'Erro ao criar despesa:',
                    error
                );

                return "❌ Erro ao registrar a despesa.";
            }

            return [
                "✅ Despesa registrada com sucesso!",
                "",
                `🆔 ${data.despesa_numero}`,
                `📅 ${formatDateBR(data.data)}`,
                `📂 ${nomeTipo(data.tipo)}`,
                `📘 ${data.descricao}`,
                `💰 ${formatCurrency(data.valor)}`
            ].join('\n');
        }


        default:
            return "⚠️ Módulo não suportado para criação.";
    }
}


module.exports = {
    getCreatePrompt,
    executeCreate
};