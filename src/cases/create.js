const supabase = require('../services/supabase');
const { DateTime } = require('luxon');

const formatCurrency = require('../utils/formatCurrency');
const formatOrcamento = require('../utils/formatOrcamento');

const {
    getNowBRT,
    formatLocal,
    formatarData,
    formatPhoneNumber
} = require('../utils/utils');

const {
    normalizeMoney,
    deleteOldEvents,
    TIPOS_DESPESA,
    nomeTipo
} = require('../utils/processFunctions');


// ======================================================
// DATA / HORA
// ======================================================

function nowWithWeekday() {

    const now = getNowBRT();

    const weekday =
        now
            .setLocale('pt')
            .toFormat('cccc');

    return `Hoje é ${weekday}, ${now.toFormat('yyyy-MM-dd HH:mm:ss')}`;
}


// ======================================================
// GPT — CREATE
// ======================================================

function getCreatePrompt(modulo, userMessage) {

    switch (modulo) {

        // ==================================================
        // ORÇAMENTO
        // ==================================================

        case 'orcamento':

            return `
Você interpreta pedidos para criar um novo orçamento.

Retorne somente JSON válido:

{
  "modulo": "orcamento",
  "action": "create",
  "nome_cliente": "string",
  "descricoes": [],
  "telefone_cliente": "string",
  "etapa": "negociacao" | "finalizado" | "andamento" | "perdido" | "aprovado",
  "observacoes": [],
  "materiais": [
    {
      "nome": "string",
      "qtd": number,
      "und": "string",
      "valor": number,
      "observacao": "string" | null
    }
  ],
  "servicos": [
    {
      "titulo": "string",
      "qtd": number,
      "valor": number,
      "observacao": "string" | null
    }
  ],
  "desconto_materiais": number | "10%" | null,
  "desconto_servicos": number | "10%" | null
}

Regras:

- Etapa padrão: "negociacao".
- Nome e telefone do cliente devem vir somente da mensagem.
- Não invente dados ausentes.
- Materiais e serviços devem ficar separados.
- Cada item diferente deve ser um item separado.
- Preserve o nome completo informado para cada item.
- Se quantidades ou valores não forem informados, use 0.
- "und" pode ser qualquer unidade informada ou adequada ao item, como "und", "m", "cm", "kit", "caixa".
- Valores monetários devem ser números, sem R$.
- Use ponto para casas decimais.
- Não retorne expressões matemáticas.
- Desconto deve ser colocado somente no respectivo campo.
- Não altere o valor individual dos itens para aplicar desconto.
- "descricoes" e "observacoes" devem ser arrays.
- Se não houver descrições, observações, materiais ou serviços, use [].

OBSERVAÇÃO DOS ITENS:

Cada material e cada serviço pode possuir uma observação própria.

A observação do item deve ficar dentro do próprio objeto:

Material:
{
  "nome": "Cabo 10mm",
  "qtd": 50,
  "und": "m",
  "valor": 12.50,
  "observacao": "Cabo flexível azul"
}

Serviço:
{
  "titulo": "Instalação de tomadas",
  "qtd": 10,
  "valor": 35,
  "observacao": "Inclui instalação e testes"
}

Regras para "observacao":

- Use "observacao" somente para informações específicas daquele item.
- Não coloque observação geral do orçamento dentro do item.
- Se o usuário mencionar uma observação claramente relacionada a um material, coloque-a naquele material.
- Se o usuário mencionar uma observação claramente relacionada a um serviço, coloque-a naquele serviço.
- Se o item não tiver observação, use null.
- Não invente observações.
- Preserve o conteúdo informado pelo usuário.
- Não transforme uma observação de um item em uma observação geral.
- Uma observação pode conter informações como marca, cor, modelo, especificação, local de instalação, condição de fornecimento ou qualquer detalhe específico daquele item.

Exemplo:

"50 metros de cabo 10mm, sendo azul, marca X"

→

{
  "nome": "Cabo 10mm",
  "qtd": 50,
  "und": "m",
  "valor": 0,
  "observacao": "Cabo azul, marca X"
}

Outro exemplo:

"Instalação de 10 tomadas, incluindo instalação e testes"

→

{
  "titulo": "Instalação de tomadas",
  "qtd": 10,
  "valor": 0,
  "observacao": "Inclui instalação e testes"
}

IMPORTANTE:

"observacao" do item é diferente de "observacoes" do orçamento.

- "observacoes": informações gerais do orçamento.
- "materiais[].observacao": informação específica do material.
- "servicos[].observacao": informação específica do serviço.


Exemplo com vários materiais:

"25 m de fio 4mm azul e 25 m de fio 4mm verde"

representa dois materiais:

[
  {
    "nome": "fio 4mm azul",
    "qtd": 25,
    "und": "m",
    "valor": 0,
    "observacao": null
  },
  {
    "nome": "fio 4mm verde",
    "qtd": 25,
    "und": "m",
    "valor": 0,
    "observacao": null
  }
]


Exemplo com observações diferentes:

"10 tomadas 20A, branca, e 5 tomadas 10A, preta"

deve separar os itens e preservar as respectivas características
nas observações:

[
  {
    "nome": "tomada 20A",
    "qtd": 10,
    "und": "und",
    "valor": 0,
    "observacao": "branca"
  },
  {
    "nome": "tomada 10A",
    "qtd": 5,
    "und": "und",
    "valor": 0,
    "observacao": "preta"
  }
]

Mensagem:
"""${userMessage}"""
`;


        // ==================================================
        // AGENDA
        // ==================================================

        case 'agenda':

            return `
Você interpreta pedidos para criar um evento na agenda.

Fuso horário: America/Sao_Paulo (GMT-3).
${nowWithWeekday()}

Retorne somente JSON válido:

{
  "modulo": "agenda",
  "action": "create",
  "title": "string",
  "datetime": "ISO 8601 com GMT-3",
  "reminder_minutes": number,
  "telefone": "string" | null
}

Regras:

- "title" deve representar o compromisso, pessoa, serviço ou local informado.
- "datetime" deve ser a data e hora finais do evento em GMT-3.
- Interprete corretamente expressões relativas como hoje, amanhã, depois de amanhã, sexta, próxima segunda, à tarde etc.
- Use o horário atual informado no contexto para interpretar referências relativas.
- Se o usuário informar somente a hora, use a data apropriada indicada pelo contexto ou pela mensagem.
- Se não informar lembrete, use 30 minutos.
- "telefone" só deve ser preenchido se o usuário fornecer o telefone do contato relacionado ao evento.
- Não use o telefone do usuário como telefone do evento.
- Preserve o telefone informado; não invente, complete ou altere dígitos.
- Não invente informações ausentes.

Mensagem:
"""${userMessage}"""
`;


        // ==================================================
        // DESPESAS
        // ==================================================

        case 'despesas':

            return `
Você interpreta pedidos para registrar uma nova despesa.

Retorne somente JSON válido:

{
  "modulo": "despesas",
  "action": "create",
  "tipo": "conducao" | "materiais" | "alimentacao" | "ferramentas" | "outras",
  "valor": number,
  "descricao": "string"
}

Classifique pelo significado da despesa.

conducao:
combustível, gasolina, diesel, etanol, estacionamento, pedágio,
Uber, táxi, transporte, manutenção de veículo e despesas de deslocamento.

materiais:
tomada, interruptor, fio, cabo, disjuntor, eletroduto, eletrocalha,
condulete, lâmpada, fita de LED e materiais utilizados em serviços
ou obras.

ferramentas:
furadeira, parafusadeira, serra, alicate, multímetro, trena,
chave, ferramenta elétrica, ferramenta manual, equipamento de trabalho
e outras ferramentas compradas ou utilizadas no trabalho.

alimentacao:
marmita, almoço, jantar, café, lanche, comida, alimentação e bebidas
sem álcool.

outras:
qualquer despesa que não se enquadre claramente nas categorias acima.

REGRAS DE CLASSIFICAÇÃO:

- Classifique pelo contexto, não apenas por uma palavra isolada.
- "gasolina" → conducao.
- "tomada" → materiais.
- "marmita" → alimentacao.
- "furadeira" → ferramentas.
- "parafusadeira" → ferramentas.
- "alicate" → ferramentas.
- "multímetro" → ferramentas.
- "trena" → ferramentas.
- Não classifique ferramentas como materiais quando o usuário estiver
claramente registrando uma ferramenta como despesa.
- Não invente informações.
- A descrição deve representar o que o usuário informou.
- O valor deve ser somente número, sem R$.
- Use ponto para casas decimais.
- Não faça cálculos.
- Se o valor não puder ser identificado, use 0.

Exemplos:

"25 reais gasolina"
→ tipo="conducao", valor=25, descricao="gasolina"

"gastei 30 com marmita"
→ tipo="alimentacao", valor=30, descricao="marmita"

"adiciona tomada 15 reais"
→ tipo="materiais", valor=15, descricao="tomada"

"comprei uma furadeira por 500 reais"
→ tipo="ferramentas", valor=500, descricao="furadeira"

"gastei 80 em ferramentas"
→ tipo="ferramentas", valor=80, descricao="ferramentas"

Mensagem:
"""${userMessage}"""
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

        console.error(
            'executeCreate: userPhone não informado.'
        );

        return '❌ Não foi possível identificar o usuário.';
    }


    switch (command.modulo) {

        // ==================================================
        // ORÇAMENTO
        // ==================================================

        case 'orcamento': {

            if (!command.nome_cliente) {
                return '⚠️ O campo *nome do cliente* é obrigatório.';
            }

            if (!command.telefone_cliente) {
                return '⚠️ O campo *telefone do cliente* é obrigatório.';
            }


            const materiais =
                Array.isArray(command.materiais)
                    ? command.materiais.map(m => ({

                        nome:
                            m.nome,

                        qtd:
                            normalizeMoney(
                                m.qtd
                            ),

                        unidade:
                            m.und,

                        valor:
                            normalizeMoney(
                                m.valor
                            ),

                        observacao:
                            m.observacao
                                ? String(
                                    m.observacao
                                )
                                    .trim()
                                : null

                    }))
                    : [];


            const servicos =
                Array.isArray(command.servicos)
                    ? command.servicos.map(s => ({

                        titulo:
                            s.titulo,

                        quantidade:
                            normalizeMoney(
                                s.qtd
                            ),

                        valor:
                            normalizeMoney(
                                s.valor
                            ),

                        observacao:
                            s.observacao
                                ? String(
                                    s.observacao
                                )
                                    .trim()
                                : null

                    }))
                    : [];


            const observacoes =
                Array.isArray(command.observacoes)
                    ? command.observacoes
                        .filter(Boolean)
                        .map(obs =>
                            String(obs)
                                .trim()
                        )
                        .filter(Boolean)
                    : [];


            const descricoes =
                Array.isArray(command.descricoes)
                    ? command.descricoes
                        .map(d =>
                            String(d)
                                .replace(/\n/g, '')
                                .trim()
                        )
                        .filter(Boolean)
                    : [];


            const telefone_cliente =
                formatPhoneNumber(
                    command.telefone_cliente
                );


            const {
                data,
                error
            } = await supabase
                .from('orcamentos')
                .insert([{
                    nome_cliente:
                        command.nome_cliente,

                    telefone_cliente,

                    etapa:
                        command.etapa ||
                        'negociacao',

                    observacoes,

                    descricoes,

                    materiais,

                    servicos,

                    desconto_materiais:
                        normalizeMoney(
                            command.desconto_materiais
                        ),

                    desconto_servicos:
                        normalizeMoney(
                            command.desconto_servicos
                        ),

                    user_telefone:
                        userPhone
                }])
                .select();


            if (error) {

                console.error(
                    'Erro ao criar orçamento:',
                    error
                );

                return `⚠️ Não consegui criar o orçamento para "${command.nome_cliente}".`;
            }


            return formatOrcamento(
                data[0]
            );
        }


        // ==================================================
        // AGENDA
        // ==================================================

        case 'agenda': {

            let date = null;


            if (command.datetime) {

                const parsed =
                    DateTime.fromISO(
                        command.datetime,
                        {
                            setZone: true
                        }
                    );


                if (!parsed.isValid) {

                    return '⚠️ A data/hora informada é inválida.';
                }


                date =
                    parsed
                        .setZone(
                            'America/Sao_Paulo'
                        )
                        .toUTC()
                        .toISO();
            }


            const telefone =
                formatPhoneNumber(
                    command.telefone ?? null
                );


            const {
                data,
                error
            } = await supabase
                .from('events')
                .insert([{
                    title:
                        command.title,

                    date,

                    reminder_minutes:
                        command.reminder_minutes ??
                        30,

                    user_telefone:
                        userPhone,

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
                    JSON.stringify(
                        command,
                        null,
                        2
                    )
                );

                return '⚠️ Erro ao criar evento.';
            }


            await deleteOldEvents(
                supabase,
                userPhone
            );


            const telefonetext =
                data[0].telefone
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


            if (
                !descricao ||
                !String(descricao).trim()
            ) {

                return '⚠️ A descrição é obrigatória.';
            }


            /*
             * "ferramentas" foi incluído como novo
             * tipo de despesa.
             *
             * Mantemos TIPOS_DESPESA como fonte principal,
             * mas também aceitamos ferramentas aqui para
             * evitar falha caso este arquivo seja atualizado
             * antes do processFunctions.js.
             */

            const tiposValidos =
                Array.from(
                    new Set([
                        ...TIPOS_DESPESA,
                        'ferramentas'
                    ])
                );


            if (
                !tipo ||
                !tiposValidos.includes(tipo)
            ) {

                return '⚠️ Tipo de despesa inválido.';
            }


            const valorNumerico =
                Number(valor);


            if (
                !Number.isFinite(valorNumerico) ||
                valorNumerico < 0
            ) {

                return '⚠️ Informe um valor válido para a despesa.';
            }


            const {
                data,
                error
            } = await supabase
                .from('despesas')
                .insert({
                    tipo,

                    valor:
                        valorNumerico,

                    descricao:
                        String(descricao)
                            .trim(),

                    user_phone:
                        userPhone
                })
                .select('*')
                .single();


            if (error) {

                console.error(
                    'Erro ao criar despesa:',
                    error
                );

                return '❌ Erro ao registrar a despesa.';
            }


            return [
                '✅ Despesa registrada com sucesso!',
                '',
                `🆔 ${data.despesa_numero}`,
                `📅 ${formatarData(data.data)}`,
                `📂 ${nomeTipo(data.tipo)}`,
                `📘 ${data.descricao}`,
                `💰 ${formatCurrency(data.valor)}`
            ].join('\n');
        }


        default:

            return '⚠️ Módulo não suportado para criação.';
    }
}


module.exports = {
    getCreatePrompt,
    executeCreate
};