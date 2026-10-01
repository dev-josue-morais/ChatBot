const supabase = require('../services/supabase');
const { DateTime } = require('luxon');
const formatOrcamento = require('../utils/formatOrcamento');
const formatCurrency = require('../utils/formatCurrency');

const {
    TIPOS_DESPESA,
    formatDateBR,
    nomeTipo,
    normalizeMoney,
    deleteOldEvents
} = require('../utils/processFunctions');

const { formatLocal } = require('../utils/utils');


// ============================================================
// BUSCA DADOS ATUAIS + MONTA PROMPT DE EDIÇÃO
// ============================================================

async function getEditPrompt(
    modulo,
    userMessage,
    id,
    userPhone
) {

    switch (modulo) {

        // ======================================================
        // ORÇAMENTO
        // ======================================================

        case 'orcamento': {

            if (!id) {
                return {
                    error: '⚠️ É necessário informar o ID do orçamento para editar.'
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

            const prompt = `
Você é um assistente comercial especializado em EDITAR orçamentos existentes.

O orçamento atual foi localizado no banco de dados.
Sua função é identificar EXATAMENTE o que o usuário deseja alterar.

Não recrie o orçamento inteiro.

Retorne SOMENTE as alterações necessárias em JSON válido.

FORMATO:

{
  "alteracoes": {
    "nome_cliente": "string",
    "telefone_cliente": "string",
    "etapa": "negociacao" | "finalizado" | "andamento" | "perdido" | "aprovado",
    "descricoes": ["texto"],
    "observacoes": ["texto"],
    "desconto_materiais": número | "10%" | null,
    "desconto_servicos": número | "10%" | null,

    "materiais": [
      {
        "acao": "alterar" | "adicionar" | "remover",
        "nome_atual": "nome do item existente",
        "item": {
          "nome": "nome completo",
          "qtd": número,
          "und": "m",
          "valor": número,
          "observacao": "string" | null
        },
        "alteracoes": {
          "nome": "novo nome",
          "qtd": número,
          "und": "m",
          "valor": número,
          "observacao": "string" | null
        }
      }
    ],

    "servicos": [
      {
        "acao": "alterar" | "adicionar" | "remover",
        "titulo_atual": "título do serviço existente",
        "item": {
          "titulo": "título completo",
          "qtd": número,
          "valor": número,
          "observacao": "string" | null
        },
        "alteracoes": {
          "titulo": "novo título",
          "qtd": número,
          "valor": número,
          "observacao": "string" | null
        }
      }
    ]
  }
}

ORÇAMENTO ATUAL:

${JSON.stringify(currentData, null, 2)}

INSTRUÇÃO DO USUÁRIO:

"${userMessage}"

REGRAS GERAIS:

- Retorne somente o que precisa ser alterado.
- Não repita campos que permanecerão iguais.
- Nunca altere informações que o usuário não solicitou.
- Não invente informações.
- Se o usuário alterar somente um campo, retorne somente esse campo.
- Não altere o número do orçamento.
- Não crie propriedades fora da estrutura definida.
- Ao editar um item, preserve todos os outros campos desse item.
- A observação de um material ou serviço pertence AO ITEM, e não ao campo geral "observacoes" do orçamento.

CAMPOS SIMPLES:

- "nome_cliente": somente se o nome do cliente mudar.
- "telefone_cliente": somente se o telefone mudar.
- "etapa": somente se a etapa mudar.
- "descricoes": somente se o usuário solicitar alteração nas descrições.
- "observacoes": somente se o usuário solicitar alteração nas observações gerais do orçamento.
- "desconto_materiais": somente se o desconto dos materiais mudar.
- "desconto_servicos": somente se o desconto dos serviços mudar.

DESCONTOS:

- Alterar desconto NÃO altera os valores dos materiais ou serviços.
- "10%" significa desconto percentual.
- Valor monetário deve ser número.
- Não faça cálculos.

============================================================
MATERIAIS
============================================================

Cada material possui:

- nome
- qtd
- unidade
- valor
- observacao

A "observacao" é uma informação específica daquele material.

Exemplo do item atual:

{
  "nome": "Cabo 10mm",
  "qtd": 100,
  "unidade": "m",
  "valor": 8.5,
  "observacao": "Cor preta"
}

ALTERAR MATERIAL:

Para alterar somente a quantidade:

{
  "acao": "alterar",
  "nome_atual": "Cabo 10mm",
  "alteracoes": {
    "qtd": 250
  }
}

Para alterar somente a observação:

{
  "acao": "alterar",
  "nome_atual": "Cabo 10mm",
  "alteracoes": {
    "observacao": "Instalar no trecho subterrâneo"
  }
}

Para substituir a observação existente:

{
  "acao": "alterar",
  "nome_atual": "Cabo 10mm",
  "alteracoes": {
    "observacao": "Nova observação do cabo"
  }
}

Para remover a observação:

{
  "acao": "alterar",
  "nome_atual": "Cabo 10mm",
  "alteracoes": {
    "observacao": null
  }
}

IMPORTANTE:

- Se o usuário disser "coloca uma observação no cabo 10mm", altere a "observacao" desse material.
- Se o usuário disser "troca a observação do cabo 10mm", altere somente a "observacao".
- Se o usuário disser "remove a observação do cabo 10mm", use "observacao": null.
- Não coloque observações específicas de materiais dentro do array geral "observacoes".
- Se o usuário alterar somente a observação, NÃO altere nome, quantidade, unidade ou valor.

ADICIONAR MATERIAL:

{
  "acao": "adicionar",
  "item": {
    "nome": "fio 2,5mm azul",
    "qtd": 30,
    "und": "m",
    "valor": 2.5,
    "observacao": "Usar no circuito de iluminação"
  }
}

Se o usuário não informar observação:

{
  "acao": "adicionar",
  "item": {
    "nome": "fio 2,5mm azul",
    "qtd": 30,
    "und": "m",
    "valor": 2.5
  }
}

REGRAS DOS MATERIAIS:

- Use o nome completo do item.
- Separe itens diferentes.
- "qtd" é quantidade.
- "und" pode ser "und", "m", "cm", "kit", "caixa" etc.
- Valores monetários são números.
- Se adicionar um item sem valor informado, use 0.
- Se adicionar um item sem observação, não invente uma.
- Nunca altere outro material sem solicitação.
- Para localizar um material existente, use "nome_atual".
- Se houver mais de um item com nome muito semelhante, use o item claramente correspondente à solicitação do usuário.

REMOVER MATERIAL:

{
  "acao": "remover",
  "nome_atual": "fio 2,5mm azul"
}

============================================================
SERVIÇOS
============================================================

Cada serviço possui:

- titulo
- quantidade
- valor
- observacao

A "observacao" é uma informação específica daquele serviço.

ALTERAR SERVIÇO:

Para alterar somente a quantidade:

{
  "acao": "alterar",
  "titulo_atual": "Instalação de tomada",
  "alteracoes": {
    "qtd": 15
  }
}

Para alterar somente a observação:

{
  "acao": "alterar",
  "titulo_atual": "Instalação de tomada",
  "alteracoes": {
    "observacao": "Instalar com caixa 4x2"
  }
}

Para remover a observação:

{
  "acao": "alterar",
  "titulo_atual": "Instalação de tomada",
  "alteracoes": {
    "observacao": null
  }
}

IMPORTANTE:

- Se o usuário disser "coloca uma observação nesse serviço", altere a "observacao" do serviço correspondente.
- Se disser "troca a observação", substitua a observação existente.
- Se disser "remove a observação", use "observacao": null.
- Se alterar somente a observação, não altere título, quantidade ou valor.
- Não confunda observação do serviço com observações gerais do orçamento.

ADICIONAR SERVIÇO:

{
  "acao": "adicionar",
  "item": {
    "titulo": "Instalação de tomada",
    "qtd": 10,
    "valor": 25,
    "observacao": "Inclui instalação da caixa 4x2"
  }
}

Se o usuário não informar observação:

{
  "acao": "adicionar",
  "item": {
    "titulo": "Instalação de tomada",
    "qtd": 10,
    "valor": 25
  }
}

REGRAS DOS SERVIÇOS:

- Não altere serviços que não foram mencionados.
- Valores monetários são números.
- Se adicionar serviço sem valor informado, use 0.
- Se adicionar serviço sem observação, não invente uma.
- Use "titulo_atual" para localizar o serviço existente.

REMOVER SERVIÇO:

{
  "acao": "remover",
  "titulo_atual": "Instalação de tomada"
}

============================================================
DESCRIÇÕES E OBSERVAÇÕES GERAIS
============================================================

O orçamento possui dois conceitos diferentes:

1. "observacoes" = observações gerais do orçamento.
2. "observacao" dentro de materiais/servicos = observação específica daquele item.

Nunca confunda os dois.

Se o usuário pedir para substituir completamente as descrições ou observações gerais, retorne o novo array.

Se pedir para adicionar uma descrição ou observação geral, indique a alteração de forma que o sistema possa preservar as existentes.

Se pedir para remover uma descrição ou observação geral específica, indique somente a remoção solicitada.

IMPORTANTE:

Não retorne o orçamento completo.

Retorne somente:

{
  "alteracoes": { ... }
}

Se nenhuma alteração puder ser identificada, retorne:

{
  "alteracoes": {}
}
`;

            return {
                prompt,
                currentData
            };
        }


        // ======================================================
        // AGENDA
        // ======================================================

        case 'agenda': {

            if (!id) {
                return {
                    error: '⚠️ É necessário informar o ID do evento para editar.'
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
                .fromISO(
                    currentData.date,
                    {
                        zone: 'utc'
                    }
                )
                .setZone('America/Sao_Paulo')
                .toISO();

            const now = DateTime
                .now()
                .setZone('America/Sao_Paulo');

            const weekday = now
                .setLocale('pt')
                .toFormat('cccc');

            const nowWithWeekday =
                `Hoje é ${weekday}, ${now.toFormat('yyyy-MM-dd HH:mm:ss')}`;

            const prompt = `
Você é um assistente especializado em EDITAR eventos de uma agenda.

${nowWithWeekday}

O evento atual foi localizado no banco de dados.

Sua função é identificar SOMENTE as alterações solicitadas pelo usuário.

Não recrie o evento inteiro.

Retorne SOMENTE JSON válido neste formato:

{
  "alteracoes": {
    "title": "string",
    "datetime": "ISO 8601 com offset -03:00",
    "reminder_minutes": número,
    "telefone": "string"
  }
}

EVENTO ATUAL:

${JSON.stringify({
    ...currentData,
    date: dateBRT
}, null, 2)}

MENSAGEM DO USUÁRIO:

"${userMessage}"

REGRAS:

- Altere somente o que o usuário solicitar.
- Não repita campos que permanecerão iguais.
- Não invente informações.
- Não altere o ID do evento.
- Se o usuário não mencionar telefone, não retorne "telefone".
- Se informar novo telefone, retorne "telefone".
- Se não mencionar lembrete, não retorne "reminder_minutes".
- Se não mencionar título, não retorne "title".
- Se não mencionar data ou horário, não retorne "datetime".

DATAS E HORÁRIOS:

- Use America/Sao_Paulo.
- O resultado de "datetime" deve conter o offset "-03:00".
- "amanhã" significa o próximo dia em relação à data atual.
- "daqui X minutos" deve usar a hora atual como base.
- "daqui X horas" deve usar a hora atual como base.
- "mais tarde" deve ser interpretado somente quando houver informação suficiente.
- Para horário exato, como "às 14h" ou "7:40", altere somente o horário e preserve a data atual do evento.
- Para "muda para segunda", altere a data preservando o horário atual do evento.
- Para "muda para segunda às 15h", altere data e horário.
- Se o usuário pedir somente alteração de data, preserve o horário atual.
- Se pedir somente alteração de horário, preserve a data atual.

LEMBRETE:

- Só altere "reminder_minutes" se o usuário solicitar.
- Não invente um novo lembrete.

IMPORTANTE:

Não retorne o evento completo.

Retorne somente:

{
  "alteracoes": { ... }
}

Se nenhuma alteração puder ser identificada:

{
  "alteracoes": {}
}
`;

            return {
                prompt,
                currentData
            };
        }


        // ======================================================
        // DESPESAS
        // ======================================================

        case 'despesas': {

            if (!id) {
                return {
                    error: '⚠️ Informe o ID da despesa.'
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

            const prompt = `
Você é um assistente financeiro especializado em EDITAR despesas existentes.

A despesa atual foi localizada no banco de dados.

Sua função é identificar SOMENTE as alterações solicitadas.

Não recrie a despesa inteira.

Retorne SOMENTE JSON válido:

{
  "alteracoes": {
    "tipo": "conducao" | "materiais" | "alimentacao" | "ferramentas" | "outras",
    "valor": número,
    "descricao": "string"
  }
}

DESPESA ATUAL:

${JSON.stringify(currentData, null, 2)}

INSTRUÇÃO DO USUÁRIO:

"${userMessage}"

REGRAS:

- Altere somente o que o usuário solicitar.
- Não repita campos que permanecerão iguais.
- Não altere "despesa_numero".
- Não crie novas propriedades.
- Valores monetários devem ser números.
- Valor não pode ser negativo.
- Se a descrição mudar e ficar evidente que a categoria também mudou, altere "tipo".
- Não altere o tipo apenas porque a descrição mudou, caso não exista evidência suficiente.
- "ferramentas" deve ser usado para ferramentas e equipamentos de trabalho.

EXEMPLOS:

"altera para gasolina"
→ descricao = "gasolina"
→ tipo = "conducao"

"altera para marmita"
→ descricao = "marmita"
→ tipo = "alimentacao"

"altera para tomada"
→ descricao = "tomada"
→ tipo = "materiais"

"altera para furadeira"
→ descricao = "furadeira"
→ tipo = "ferramentas"

"altera para parafusadeira"
→ descricao = "parafusadeira"
→ tipo = "ferramentas"

"altera para alicate"
→ descricao = "alicate"
→ tipo = "ferramentas"

"altera para multímetro"
→ descricao = "multímetro"
→ tipo = "ferramentas"

"altera para trena"
→ descricao = "trena"
→ tipo = "ferramentas"

TIPOS PERMITIDOS:

- conducao
- materiais
- alimentacao
- ferramentas
- outras

IMPORTANTE:

Não retorne a despesa completa.

Retorne somente:

{
  "alteracoes": { ... }
}

Se nenhuma alteração puder ser identificada:

{
  "alteracoes": {}
}
`;

            return {
                prompt,
                currentData
            };
        }


        default:

            return {
                error: `⚠️ Módulo de edição não suportado: ${modulo}`
            };
    }
}


// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

function normalizeText(value) {

    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}


// ============================================================
// LOCALIZA MATERIAL
// ============================================================

function findMaterialIndex(
    materiais,
    nome
) {

    if (!Array.isArray(materiais)) {
        return -1;
    }

    const target =
        normalizeText(nome);

    if (!target) {
        return -1;
    }

    return materiais.findIndex(
        material =>
            normalizeText(material.nome) === target
    );
}


// ============================================================
// LOCALIZA SERVIÇO
// ============================================================

function findServicoIndex(
    servicos,
    titulo
) {

    if (!Array.isArray(servicos)) {
        return -1;
    }

    const target =
        normalizeText(titulo);

    if (!target) {
        return -1;
    }

    return servicos.findIndex(
        servico =>
            normalizeText(servico.titulo) === target
    );
}


// ============================================================
// ALTERA MATERIAIS
// ============================================================

function applyMaterialChanges(
    materiais,
    alteracoes
) {

    const result =
        Array.isArray(materiais)
            ? materiais.map(item => ({ ...item }))
            : [];

    if (!Array.isArray(alteracoes)) {
        return result;
    }

    for (const change of alteracoes) {

        if (!change || !change.acao) {
            continue;
        }

        // ----------------------------------------------------
        // ADICIONAR
        // ----------------------------------------------------

        if (change.acao === 'adicionar') {

            const item = change.item;

            if (!item || !item.nome) {
                continue;
            }

            const novoMaterial = {
                nome: String(item.nome).trim(),
                qtd: normalizeMoney(item.qtd),
                unidade: item.und || item.unidade || 'und',
                valor: normalizeMoney(item.valor)
            };

            // Só cria a propriedade quando realmente houver
            // observação informada.
            if (
                item.observacao !== undefined &&
                item.observacao !== null &&
                String(item.observacao).trim() !== ''
            ) {
                novoMaterial.observacao =
                    String(item.observacao).trim();
            }

            result.push(novoMaterial);

            continue;
        }

        // ----------------------------------------------------
        // LOCALIZAR ITEM EXISTENTE
        // ----------------------------------------------------

        const index =
            findMaterialIndex(
                result,
                change.nome_atual
            );

        if (index === -1) {
            continue;
        }

        // ----------------------------------------------------
        // ALTERAR
        // ----------------------------------------------------

        if (change.acao === 'alterar') {

            const changes =
                change.alteracoes || {};

            const material =
                result[index];

            if (
                changes.nome !== undefined &&
                changes.nome !== null
            ) {
                material.nome =
                    String(changes.nome).trim();
            }

            if (
                changes.qtd !== undefined &&
                changes.qtd !== null
            ) {
                material.qtd =
                    normalizeMoney(changes.qtd);
            }

            if (
                changes.und !== undefined ||
                changes.unidade !== undefined
            ) {
                material.unidade =
                    changes.und ||
                    changes.unidade;
            }

            if (
                changes.valor !== undefined &&
                changes.valor !== null
            ) {
                material.valor =
                    normalizeMoney(changes.valor);
            }

            // ------------------------------------------------
            // OBSERVAÇÃO DO MATERIAL
            // ------------------------------------------------

            if (
                Object.prototype.hasOwnProperty.call(
                    changes,
                    'observacao'
                )
            ) {

                if (
                    changes.observacao === null ||
                    String(changes.observacao).trim() === ''
                ) {

                    delete material.observacao;

                } else {

                    material.observacao =
                        String(
                            changes.observacao
                        ).trim();
                }
            }

            continue;
        }

        // ----------------------------------------------------
        // REMOVER
        // ----------------------------------------------------

        if (change.acao === 'remover') {
            result.splice(index, 1);
        }
    }

    return result;
}


// ============================================================
// ALTERA SERVIÇOS
// ============================================================

function applyServicoChanges(
    servicos,
    alteracoes
) {

    const result =
        Array.isArray(servicos)
            ? servicos.map(item => ({ ...item }))
            : [];

    if (!Array.isArray(alteracoes)) {
        return result;
    }

    for (const change of alteracoes) {

        if (!change || !change.acao) {
            continue;
        }

        // ----------------------------------------------------
        // ADICIONAR
        // ----------------------------------------------------

        if (change.acao === 'adicionar') {

            const item = change.item;

            if (!item || !item.titulo) {
                continue;
            }

            const novoServico = {
                titulo: String(item.titulo).trim(),
                quantidade: normalizeMoney(item.qtd),
                valor: normalizeMoney(item.valor)
            };

            // Só cria a propriedade quando realmente houver
            // observação informada.
            if (
                item.observacao !== undefined &&
                item.observacao !== null &&
                String(item.observacao).trim() !== ''
            ) {
                novoServico.observacao =
                    String(item.observacao).trim();
            }

            result.push(novoServico);

            continue;
        }

        // ----------------------------------------------------
        // LOCALIZAR ITEM EXISTENTE
        // ----------------------------------------------------

        const index =
            findServicoIndex(
                result,
                change.titulo_atual
            );

        if (index === -1) {
            continue;
        }

        // ----------------------------------------------------
        // ALTERAR
        // ----------------------------------------------------

        if (change.acao === 'alterar') {

            const changes =
                change.alteracoes || {};

            const servico =
                result[index];

            if (
                changes.titulo !== undefined &&
                changes.titulo !== null
            ) {
                servico.titulo =
                    String(changes.titulo).trim();
            }

            if (
                changes.qtd !== undefined &&
                changes.qtd !== null
            ) {
                servico.quantidade =
                    normalizeMoney(changes.qtd);
            }

            if (
                changes.valor !== undefined &&
                changes.valor !== null
            ) {
                servico.valor =
                    normalizeMoney(changes.valor);
            }

            // ------------------------------------------------
            // OBSERVAÇÃO DO SERVIÇO
            // ------------------------------------------------

            if (
                Object.prototype.hasOwnProperty.call(
                    changes,
                    'observacao'
                )
            ) {

                if (
                    changes.observacao === null ||
                    String(changes.observacao).trim() === ''
                ) {

                    delete servico.observacao;

                } else {

                    servico.observacao =
                        String(
                            changes.observacao
                        ).trim();
                }
            }

            continue;
        }

        // ----------------------------------------------------
        // REMOVER
        // ----------------------------------------------------

        if (change.acao === 'remover') {
            result.splice(index, 1);
        }
    }

    return result;
}


// ============================================================
// EXECUTE EDIT
// ============================================================

async function executeEdit(
    command,
    userPhone
) {

    const {
        modulo
    } = command || {};

    /*
     * currentData será colocado pelo processCommand depois
     * que o getEditPrompt fizer a consulta.
     *
     * Assim evitamos uma segunda consulta ao Supabase.
     */

    const currentData =
        command?._currentData;


    switch (modulo) {

        // ======================================================
        // AGENDA
        // ======================================================

        case 'agenda': {

            if (!command.event_numero) {
                return '⚠️ É necessário informar o ID do evento para editar.';
            }

            if (!currentData) {
                return '⚠️ Não foi possível recuperar os dados atuais do evento.';
            }

            const alteracoes =
                command.alteracoes || {};

            const updates = {};


            // --------------------------------------------------
            // TÍTULO
            // --------------------------------------------------

            if (
                alteracoes.title !== undefined &&
                alteracoes.title !== null &&
                String(alteracoes.title).trim() !== ''
            ) {

                updates.title =
                    String(alteracoes.title).trim();
            }


            // --------------------------------------------------
            // DATA/HORA
            // --------------------------------------------------

            if (
                alteracoes.datetime !== undefined &&
                alteracoes.datetime !== null
            ) {

                const date =
                    DateTime
                        .fromISO(
                            alteracoes.datetime,
                            {
                                zone: 'America/Sao_Paulo'
                            }
                        );

                if (!date.isValid) {
                    return '⚠️ A data e horário informados são inválidos.';
                }

                updates.date =
                    date
                        .toUTC()
                        .toISO();
            }


            // --------------------------------------------------
            // LEMBRETE
            // --------------------------------------------------

            if (
                alteracoes.reminder_minutes !== undefined &&
                alteracoes.reminder_minutes !== null
            ) {

                const reminder =
                    Number(
                        alteracoes.reminder_minutes
                    );

                if (
                    !Number.isFinite(reminder) ||
                    reminder < 0
                ) {
                    return '⚠️ O lembrete informado é inválido.';
                }

                updates.reminder_minutes =
                    reminder;
            }


            // --------------------------------------------------
            // TELEFONE
            // --------------------------------------------------

            if (
                Object.prototype.hasOwnProperty.call(
                    alteracoes,
                    'telefone'
                )
            ) {

                updates.telefone =
                    alteracoes.telefone;
            }


            if (Object.keys(updates).length === 0) {
                return '⚠️ Nenhuma alteração foi identificada.';
            }


            // --------------------------------------------------
            // NOTIFICADO
            // --------------------------------------------------

            updates.notified = false;


            const {
                data,
                error
            } = await supabase
                .from('events')
                .update(updates)
                .eq(
                    'event_numero',
                    command.event_numero
                )
                .eq(
                    'user_telefone',
                    userPhone
                )
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

                return `⚠️ Nenhum evento encontrado com o ID "${command.event_numero}".`;
            }


            await deleteOldEvents(
                supabase,
                userPhone
            );


            const telefone =
                data[0].telefone
                    ? `\ntelefone ${data[0].telefone}`
                    : '';


            return `✅ Evento atualizado: ${data[0].title}
ID ${data[0].event_numero}
dia ${formatLocal(data[0].date)}${telefone}`;
        }


        // ======================================================
        // DESPESAS
        // ======================================================

        case 'despesas': {

            const id =
                command.id ||
                command.despesa_numero;

            if (!id) {
                return '⚠️ É necessário informar o ID da despesa para editar.';
            }

            if (!currentData) {
                return '⚠️ Não foi possível recuperar os dados atuais da despesa.';
            }

            const alteracoes =
                command.alteracoes || {};

            const updated = {};


            // --------------------------------------------------
            // TIPO
            // --------------------------------------------------

            if (
                alteracoes.tipo !== undefined &&
                alteracoes.tipo !== null &&
                alteracoes.tipo !== ''
            ) {

                if (
                    !TIPOS_DESPESA.includes(
                        alteracoes.tipo
                    )
                ) {
                    return '⚠️ Tipo de despesa inválido.';
                }

                updated.tipo =
                    alteracoes.tipo;
            }


            // --------------------------------------------------
            // VALOR
            // --------------------------------------------------

            if (
                alteracoes.valor !== undefined &&
                alteracoes.valor !== null
            ) {

                const valorNumerico =
                    Number(
                        alteracoes.valor
                    );

                if (
                    !Number.isFinite(valorNumerico) ||
                    valorNumerico < 0
                ) {
                    return '⚠️ Informe um valor válido.';
                }

                updated.valor =
                    valorNumerico;
            }


            // --------------------------------------------------
            // DESCRIÇÃO
            // --------------------------------------------------

            if (
                alteracoes.descricao !== undefined &&
                alteracoes.descricao !== null &&
                String(
                    alteracoes.descricao
                ).trim() !== ''
            ) {

                updated.descricao =
                    String(
                        alteracoes.descricao
                    ).trim();
            }


            if (Object.keys(updated).length === 0) {

                return '⚠️ Nenhuma alteração foi identificada.';
            }


            const {
                data,
                error
            } = await supabase
                .from('despesas')
                .update(updated)
                .eq(
                    'despesa_numero',
                    String(id)
                )
                .eq(
                    'user_phone',
                    userPhone
                )
                .select('*')
                .single();


            if (error) {

                console.error(
                    'Erro ao atualizar despesa:',
                    error
                );

                return '❌ Falha ao atualizar a despesa.';
            }


            return [
                '✅ Despesa atualizada!',
                '',
                `🆔 ${data.despesa_numero}`,
                `📅 ${formatDateBR(data.data)}`,
                `📂 ${nomeTipo(data.tipo)}`,
                `📘 ${data.descricao}`,
                `💰 ${formatCurrency(data.valor)}`
            ].join('\n');
        }


        // ======================================================
        // ORÇAMENTO
        // ======================================================

        case 'orcamento': {

            const id =
                command.orcamento_numero ||
                command.id;

            if (!id) {

                return '⚠️ É necessário informar o ID do orçamento para editar.';
            }

            if (!currentData) {

                return '⚠️ Não foi possível recuperar os dados atuais do orçamento.';
            }

            const alteracoes =
                command.alteracoes || {};


            if (
                Object.keys(alteracoes).length === 0
            ) {

                return '⚠️ Nenhuma alteração foi identificada.';
            }


            const updates = {};


            // --------------------------------------------------
            // CAMPOS SIMPLES
            // --------------------------------------------------

            if (
                alteracoes.nome_cliente !== undefined
            ) {

                updates.nome_cliente =
                    alteracoes.nome_cliente;
            }


            if (
                alteracoes.telefone_cliente !== undefined
            ) {

                updates.telefone_cliente =
                    alteracoes.telefone_cliente;
            }


            if (
                alteracoes.etapa !== undefined
            ) {

                const etapasValidas = [
                    'negociacao',
                    'finalizado',
                    'andamento',
                    'perdido',
                    'aprovado'
                ];

                if (
                    !etapasValidas.includes(
                        alteracoes.etapa
                    )
                ) {

                    return '⚠️ Etapa de orçamento inválida.';
                }

                updates.etapa =
                    alteracoes.etapa;
            }


            // --------------------------------------------------
            // DESCRIÇÕES
            // --------------------------------------------------

            if (
                alteracoes.descricoes !== undefined
            ) {

                if (
                    !Array.isArray(
                        alteracoes.descricoes
                    )
                ) {

                    return '⚠️ As descrições devem ser uma lista.';
                }

                updates.descricoes =
                    alteracoes.descricoes
                        .map(
                            item =>
                                String(item)
                                    .replace(/\n/g, '')
                                    .trim()
                        )
                        .filter(Boolean);
            }


            // --------------------------------------------------
            // OBSERVAÇÕES
            // --------------------------------------------------

            if (
                alteracoes.observacoes !== undefined
            ) {

                if (
                    !Array.isArray(
                        alteracoes.observacoes
                    )
                ) {

                    return '⚠️ As observações devem ser uma lista.';
                }

                updates.observacoes =
                    alteracoes.observacoes
                        .map(
                            item =>
                                String(item)
                                    .trim()
                        )
                        .filter(Boolean);
            }


            // --------------------------------------------------
            // DESCONTO MATERIAIS
            // --------------------------------------------------

            if (
                alteracoes.desconto_materiais !== undefined
            ) {

                updates.desconto_materiais =
                    normalizeMoney(
                        alteracoes.desconto_materiais
                    );
            }


            // --------------------------------------------------
            // DESCONTO SERVIÇOS
            // --------------------------------------------------

            if (
                alteracoes.desconto_servicos !== undefined
            ) {

                updates.desconto_servicos =
                    normalizeMoney(
                        alteracoes.desconto_servicos
                    );
            }


            // --------------------------------------------------
            // MATERIAIS
            // --------------------------------------------------

            if (
                alteracoes.materiais !== undefined
            ) {

                if (
                    !Array.isArray(
                        alteracoes.materiais
                    )
                ) {

                    return '⚠️ A lista de alterações de materiais é inválida.';
                }

                updates.materiais =
                    applyMaterialChanges(
                        currentData.materiais,
                        alteracoes.materiais
                    );
            }


            // --------------------------------------------------
            // SERVIÇOS
            // --------------------------------------------------

            if (
                alteracoes.servicos !== undefined
            ) {

                if (
                    !Array.isArray(
                        alteracoes.servicos
                    )
                ) {

                    return '⚠️ A lista de alterações de serviços é inválida.';
                }

                updates.servicos =
                    applyServicoChanges(
                        currentData.servicos,
                        alteracoes.servicos
                    );
            }


            if (Object.keys(updates).length === 0) {

                return '⚠️ Nenhuma alteração válida foi identificada.';
            }


            // --------------------------------------------------
            // ATUALIZA SUPABASE
            // --------------------------------------------------

            const {
                data,
                error
            } = await supabase
                .from('orcamentos')
                .update(updates)
                .eq(
                    'orcamento_numero',
                    id
                )
                .eq(
                    'user_telefone',
                    userPhone
                )
                .select()
                .single();


            if (error) {

                console.error(
                    '❌ Erro ao editar orçamento:',
                    error
                );

                console.error(
                    '📦 Updates:',
                    JSON.stringify(
                        updates,
                        null,
                        2
                    )
                );

                return `⚠️ Não consegui editar o orçamento ${id}.`;
            }


            if (!data) {

                return `⚠️ Nenhum orçamento encontrado com o número ${id}.`;
            }


            return formatOrcamento(
                data
            );
        }


        default:

            return `⚠️ Módulo de edição não suportado: ${modulo}`;
    }
}


module.exports = {
    getEditPrompt,
    executeEdit
};