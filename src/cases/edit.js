const supabase = require('../services/supabase');
const { DateTime } = require('luxon');

const { formatLocal } = require('../utils/utils');
const {
    TIPOS_DESPESA,
    formatDateBR,
    nomeTipo,
    normalizeMoney
} = require('../utils/handlersFunctions');

const formatCurrency = require('../utils/formatCurrency');
const formatOrcamento = require('../utils/formatOrcamento');

const TIMEZONE = 'America/Sao_Paulo';


// ======================================================
// PROMPTS DE EDIT
// ======================================================

function nowWithWeekday() {
    const now = DateTime.now().setZone(TIMEZONE);
    const weekday = now.setLocale('pt').toFormat('cccc');

    return `Hoje é ${weekday}, ${now.toFormat('yyyy-MM-dd HH:mm:ss')}`;
}


async function getEditPrompt(modulo, userMessage, id, userPhone) {

    let prompt = '';

    switch (`${modulo}_edit`) {

        // ==================================================
        // ORÇAMENTO
        // ==================================================

        case 'orcamento_edit': {

            if (!id) {
                return {
                    error: "⚠️ É necessário informar o ID do orçamento para editar."
                };
            }

            const {
                data: currentData,
                error: fetchError
            } = await supabase
                .from('orcamentos')
                .select('*')
                .eq('orcamento_numero', id)
                .eq('user_telefone', userPhone)
                .single();

            if (fetchError || !currentData) {
                return {
                    error: `⚠️ Não encontrei o orçamento ID ${id}.`
                };
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


        // ==================================================
        // AGENDA
        // ==================================================

        case 'agenda_edit': {

            if (!id) {
                return {
                    error: "⚠️ É necessário informar o ID do evento para editar."
                };
            }

            const {
                data: currentData,
                error: fetchError
            } = await supabase
                .from('events')
                .select('*')
                .eq('event_numero', id)
                .eq('user_telefone', userPhone)
                .single();

            if (fetchError || !currentData) {
                return {
                    error: `⚠️ Não encontrei o evento ID ${id}.`
                };
            }

            const dateBRT = DateTime
                .fromISO(currentData.date, { zone: 'utc' })
                .setZone(TIMEZONE)
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


        // ==================================================
        // DESPESAS
        // ==================================================

        case 'despesas_edit': {

            if (!id) {
                return {
                    error: "⚠️ Informe o ID da despesa."
                };
            }

            const {
                data: currentData,
                error: fetchError
            } = await supabase
                .from('despesas')
                .select('*')
                .eq('despesa_numero', String(id))
                .eq('user_phone', userPhone)
                .single();

            if (fetchError || !currentData) {
                return {
                    error: `⚠️ Despesa ID ${id} não encontrada.`
                };
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


        default:
            return {
                error: `❌ Módulo "${modulo}" não possui edição configurada.`
            };
    }

    return {
        prompt
    };
}


// ======================================================
// EXECUÇÃO DOS EDITS
// ======================================================

async function executeEdit(command, userPhone) {

    if (!command || !command.action) {
        return "⚠️ Comando de edição inválido.";
    }

    switch (command.modulo) {

        // ==================================================
        // AGENDA
        // ==================================================

        case 'agenda': {

            if (!command.id) {
                return '⚠️ É necessário informar o ID do evento para editar.';
            }

            let date = null;

            if (command.datetime) {
                date = DateTime
                    .fromISO(command.datetime, {
                        zone: TIMEZONE
                    })
                    .toUTC()
                    .toISO();
            }

            const updates = {
                title: command.title,
                ...(date && { date }),
                reminder_minutes: command.reminder_minutes ?? 30,
                notified: typeof command.notified === 'boolean'
                    ? command.notified
                    : false
            };

            if (
                Object.prototype.hasOwnProperty.call(
                    command,
                    'telefone'
                )
            ) {
                updates.telefone = command.telefone;
            }

            const {
                data,
                error
            } = await supabase
                .from('events')
                .update(updates)
                .eq('event_numero', command.id)
                .eq('user_telefone', userPhone)
                .select(
                    'event_numero, title, date, telefone'
                );

            if (error) {
                console.error(
                    '❌ Erro ao atualizar evento:',
                    error
                );

                console.error(
                    '📦 Updates enviados:',
                    JSON.stringify(
                        updates,
                        null,
                        2
                    )
                );

                return '⚠️ Erro ao atualizar evento.';
            }

            if (!data?.length) {
                return `⚠️ Nenhum evento encontrado com o ID "${command.id}".`;
            }

            const {
                deleteOldEvents
            } = require('../utils/handlersFunctions');

            await deleteOldEvents(userPhone);

            const telefone = data[0].telefone
                ? `\ntelefone ${data[0].telefone}`
                : '';

            return `✅ Evento atualizado: ${data[0].title}
ID ${data[0].event_numero}
dia ${formatLocal(data[0].date)}${telefone}`;
        }


        // ==================================================
        // DESPESAS
        // ==================================================

        case 'despesas': {

            const id =
                command.id ||
                command.despesa_numero;

            if (!id) {
                return "⚠️ É necessário informar o ID da despesa para editar.";
            }

            const {
                data: current,
                error: fetchError
            } = await supabase
                .from('despesas')
                .select('*')
                .eq('despesa_numero', String(id))
                .eq('user_phone', userPhone)
                .single();

            if (fetchError || !current) {
                return `⚠️ Não encontrei a despesa ID ${id}.`;
            }

            const updated = {};

            if (
                command.tipo !== undefined &&
                command.tipo !== null &&
                command.tipo !== ''
            ) {
                if (!TIPOS_DESPESA.includes(command.tipo)) {
                    return "⚠️ Tipo de despesa inválido.";
                }

                updated.tipo = command.tipo;
            }

            if (
                command.valor !== undefined &&
                command.valor !== null
            ) {
                const valorNumerico = Number(command.valor);

                if (
                    !Number.isFinite(valorNumerico) ||
                    valorNumerico < 0
                ) {
                    return "⚠️ Informe um valor válido.";
                }

                updated.valor = valorNumerico;
            }

            if (
                command.descricao !== undefined &&
                command.descricao !== null &&
                String(command.descricao).trim() !== ''
            ) {
                updated.descricao =
                    String(command.descricao).trim();
            }

            if (Object.keys(updated).length === 0) {
                return "⚠️ Nenhuma alteração foi identificada.";
            }

            const {
                data,
                error
            } = await supabase
                .from('despesas')
                .update(updated)
                .eq('despesa_numero', String(id))
                .eq('user_phone', userPhone)
                .select('*')
                .single();

            if (error) {
                console.error(
                    'Erro ao atualizar despesa:',
                    error
                );

                return "❌ Falha ao atualizar a despesa.";
            }

            return [
                "✅ Despesa atualizada!",
                "",
                `🆔 ${data.despesa_numero}`,
                `📅 ${formatDateBR(data.data)}`,
                `📂 ${nomeTipo(data.tipo)}`,
                `📘 ${data.descricao}`,
                `💰 ${formatCurrency(data.valor)}`
            ].join('\n');
        }


        // ==================================================
        // ORÇAMENTO
        // ==================================================

        case 'orcamento': {

            if (!command.id) {
                return "⚠️ É necessário informar o ID do orçamento para editar.";
            }

            const {
                data: current,
                error: fetchError
            } = await supabase
                .from('orcamentos')
                .select('*')
                .eq('orcamento_numero', command.id)
                .eq('user_telefone', userPhone)
                .single();

            if (fetchError || !current) {
                return `⚠️ Não encontrei o orçamento ID ${command.id}.`;
            }

            const updates = {
                nome_cliente: command.nome_cliente,
                telefone_cliente: command.telefone_cliente,
                etapa: command.etapa,
                observacoes: Array.isArray(command.observacoes)
                    ? command.observacoes
                    : [],
                descricoes: Array.isArray(command.descricoes)
                    ? command.descricoes
                        .map(d =>
                            String(d)
                                .replace(/\n/g, '')
                                .trim()
                        )
                        .filter(Boolean)
                    : [],
                materiais: Array.isArray(command.materiais)
                    ? command.materiais.map(m => ({
                        ...m,
                        qtd: normalizeMoney(m.qtd),
                        valor: normalizeMoney(m.valor),
                        unidade: m.und
                    }))
                    : [],
                servicos: Array.isArray(command.servicos)
                    ? command.servicos.map(s => ({
                        ...s,
                        quantidade: normalizeMoney(s.qtd),
                        valor: normalizeMoney(s.valor)
                    }))
                    : [],
                desconto_materiais:
                    normalizeMoney(
                        command.desconto_materiais
                    ),
                desconto_servicos:
                    normalizeMoney(
                        command.desconto_servicos
                    )
            };

            const {
                data,
                error
            } = await supabase
                .from('orcamentos')
                .update(updates)
                .eq('orcamento_numero', command.id)
                .eq('user_telefone', userPhone)
                .select('*')
                .single();

            if (error) {
                console.error(
                    'Erro ao atualizar orçamento:',
                    error
                );

                return "⚠️ Não consegui atualizar o orçamento.";
            }

            return formatOrcamento(data);
        }


        default:
            return "⚠️ Módulo não suportado para edição.";
    }
}


module.exports = {
    getEditPrompt,
    executeEdit
};