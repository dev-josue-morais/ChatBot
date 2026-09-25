  const { getNowBRT } = require('../utils/utils');
  const openai = require('./openai');
  const supabase = require("./supabase");
  const { DateTime } = require('luxon');

  async function handleGPTCommand(rawMessage, modulo, action, id) {
      const userMessage = (rawMessage || "").trim();
      let prompt = '';

      // 🧠 Função NOW com dia da semana
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
  Você é um assistente comercial responsável por interpretar pedidos de criação de orçamentos.

  Responda SEMPRE APENAS com JSON válido.
  Não escreva explicações, comentários, Markdown ou qualquer texto fora do JSON.

  OBJETIVO:
  Interpretar a mensagem do usuário e transformar as informações fornecidas em um orçamento estruturado.

  FORMATO OBRIGATÓRIO:

  {
    "modulo": "orcamento",
    "action": "create",
    "nome_cliente": "string",
    "descricoes": ["texto1", "texto2"] | [],
    "telefone_cliente": "string",
    "etapa": "negociacao" | "finalizado" | "andamento" | "perdido" | "aprovado",
    "observacoes": ["texto1", "texto2"] | [],
    "materiais": [
      {
        "nome": "string",
        "qtd": número,
        "und": "string",
        "valor": número
      }
    ],
    "servicos": [
      {
        "titulo": "string",
        "qtd": número,
        "valor": número
      }
    ],
    "desconto_materiais": número | "10%" | null,
    "desconto_servicos": número | "10%" | null
  }

  REGRAS DE INTERPRETAÇÃO:

  1. CLIENTE
  - Identifique o nome do cliente quando informado.
  - Preserve o nome exatamente como fornecido, apenas removendo excesso de espaços.
  - Se o telefone do cliente for informado, coloque em "telefone_cliente".
  - Não confunda o telefone do cliente com o telefone do usuário do sistema.

  2. ETAPA
  - Use "negociacao" como padrão quando o usuário não informar outra etapa.
  - Use "finalizado" quando o usuário indicar que o orçamento foi concluído/finalizado.
  - Use "andamento" quando indicar que o serviço/orçamento está em execução.
  - Use "aprovado" quando indicar aprovação do orçamento.
  - Use "perdido" quando indicar que o orçamento foi perdido/cancelado pelo cliente.

  3. DESCRIÇÕES
  - "descricoes" contém textos descritivos do orçamento ou do serviço.
  - Preserve as informações importantes fornecidas pelo usuário.
  - Se não houver descrição, use [].

  4. OBSERVAÇÕES
  - Coloque em "observacoes" informações adicionais como garantia, forma de pagamento, condições, prazo, observações da obra etc.
  - Não transforme uma observação em material ou serviço.
  - Se não houver observações, use [].

  5. MATERIAIS
  - Cada material deve ser um item separado.
  - Preserve o nome completo do material.
  - Não simplifique nomes que contenham medida, bitola, cor, modelo ou característica.
  - Se houver variações, separe os itens.

  Exemplo:
  "25 metros de fio 4mm azul e 25 metros de fio 4mm verde"
  ou exemplo:
  "25 metros de cada fio 4mm sendo azul e verde"

  deve resultar em:

  [
    {
      "nome": "fio 4mm azul",
      "qtd": 25,
      "und": "m",
      "valor": 0
    },
    {
      "nome": "fio 4mm verde",
      "qtd": 25,
      "und": "m",
      "valor": 0
    }
  ]

  - "und" pode ser "und", "m", "cm", "kit", "caixa" ou outra unidade explicitamente informada.
  - Se a unidade não estiver clara, preserve a interpretação mais natural do texto.
  - Se a quantidade não for informada, use 1.
  - Se o valor não for informado, use 0.

  6. SERVIÇOS
  - Cada serviço deve ser um item separado.
  - Preserve o nome completo do serviço.
  - Não transforme materiais em serviços.
  - Se a quantidade não for informada, use 1.
  - Se o valor não for informado, use 0.

  7. VALORES
  - Valores monetários devem ser números.
  - Use ponto como separador decimal.
  - Exemplo: R$ 1.250,50 → 1250.50.
  - Nunca retorne expressões matemáticas.
  - Nunca retorne "25 x 10" ou "25*10".
  - Retorne somente o resultado numérico se o texto já fornecer claramente um valor calculado.
  - Não invente valores.

  8. DESCONTOS
  - Se o usuário solicitar desconto nos materiais, altere somente "desconto_materiais".
  - Se solicitar desconto nos serviços, altere somente "desconto_servicos".
  - Nunca altere os valores individuais dos materiais ou serviços para aplicar um desconto.
  - Percentuais podem ser retornados como "10%".
  - Valores numéricos também podem ser usados quando representarem corretamente o desconto solicitado.
  - Se não houver desconto, use null.

  9. NÃO INVENTAR
  - Não invente cliente, telefone, materiais, serviços, quantidades, valores, descontos ou condições que não estejam na mensagem.
  - Quando uma informação estiver ausente, utilize o padrão indicado acima.

  Texto do usuário:
  """${userMessage}"""
  `;
              break;
          }

          // ============================================================
          // ✏️ ORÇAMENTO - EDIT
          // ============================================================
          case 'orcamento_edit': {
              if (!id) return { error: "⚠️ É necessário informar o ID do orçamento para editar." };

              const { data: currentData, error: fetchError } = await supabase
                  .from('orcamentos')
                  .select('*')
                  .eq('orcamento_numero', id)
                  .single();

              if (fetchError || !currentData)
                  return { error: `⚠️ Não encontrei o orçamento ID ${id}.` };

              prompt = `
  Você é um assistente comercial responsável por EDITAR um orçamento existente.

  Responda SEMPRE APENAS com JSON válido.
  Não escreva explicações, comentários, Markdown ou qualquer texto fora do JSON.

  IMPORTANTE:
  O orçamento abaixo já existe.
  Você deve interpretar a solicitação do usuário e atualizar SOMENTE aquilo que ele pediu.

  IDENTIFICADOR DO ORÇAMENTO:
  O identificador recebido pelo sistema é o ID ${id}.
  Esse valor corresponde ao campo "orcamento_numero".
  NÃO altere esse número.

  FORMATO OBRIGATÓRIO:

  {
    "modulo": "orcamento",
    "action": "edit",
    "orcamento_numero": número,
    "nome_cliente": "string",
    "descricoes": ["texto1", "texto2"] | [],
    "telefone_cliente": "string",
    "etapa": "negociacao" | "finalizado" | "andamento" | "perdido" | "aprovado",
    "observacoes": ["texto1", "texto2"] | [],
    "materiais": [
      {
        "nome": "string",
        "qtd": número,
        "und": "string",
        "valor": número
      }
    ],
    "servicos": [
      {
        "titulo": "string",
        "qtd": número,
        "valor": número
      }
    ],
    "desconto_materiais": número | "10%" | null,
    "desconto_servicos": número | "10%" | null
  }

  REGRAS FUNDAMENTAIS DE EDIÇÃO:

  1. PRESERVE O ORÇAMENTO ATUAL
  - O orçamento atual é a fonte principal de dados.
  - Mantenha todos os dados que o usuário não pediu para alterar.
  - Não apague materiais, serviços, observações ou descrições sem que o usuário peça.
  - Não substitua listas inteiras quando a intenção for alterar apenas um item.
  - Não invente novos dados.

  2. IDENTIFICADOR
  - "orcamento_numero" deve permanecer ${id}.
  - Não use outro número como identificador.
  - Não confunda telefone, valor, quantidade, data ou outro número com o número do orçamento.

  3. ALTERAÇÕES PARCIAIS
  Exemplos de interpretação:
  - "altera o valor do fio para 8 reais" → altere somente o valor desse material.
  - "adiciona 10 tomadas" → mantenha os itens existentes e adicione o novo item.
  - "remove o serviço de instalação" → remova somente esse serviço.
  - "troca o nome do cliente" → altere somente o nome.
  - "coloca desconto de 10% nos materiais" → altere somente desconto_materiais.
  - "muda a etapa para aprovado" → altere somente a etapa.

  4. MATERIAIS
  - Preserve os itens existentes.
  - Ao adicionar material, mantenha o nome completo.
  - Ao alterar um material, identifique-o pelo contexto fornecido.
  - Não altere outros materiais sem solicitação.
  - Se houver variações por cor, medida, modelo ou característica, mantenha os itens separados.
  - "und" pode ser "und", "m", "cm", "kit", "caixa" etc.
  - Valores monetários devem ser números usando ponto como decimal.

  5. SERVIÇOS
  - Preserve os serviços existentes.
  - Ao alterar um serviço, altere somente o serviço correspondente.
  - Ao adicionar serviço, mantenha os serviços anteriores.
  - Não transforme serviços em materiais ou materiais em serviços.

  6. DESCONTOS
  - Se o usuário pedir desconto em materiais, altere somente "desconto_materiais".
  - Se pedir desconto em serviços, altere somente "desconto_servicos".
  - Nunca altere os valores individuais dos itens para representar um desconto.
  - Não remova descontos existentes sem solicitação.
  - Percentuais podem ser retornados como "10%".

  7. DESCRIÇÕES E OBSERVAÇÕES
  - Preserve o conteúdo existente.
  - Ao adicionar uma descrição ou observação, mantenha as anteriores.
  - Ao alterar uma descrição específica, altere somente aquela descrição quando for possível identificar claramente qual é.
  - Não transforme observações em serviços ou materiais.

  8. VALORES
  - Use números.
  - Use ponto como separador decimal.
  - Não use expressões matemáticas.
  - Se o usuário não informar um novo valor, mantenha o valor atual.
  - Nunca invente preço.

  9. ETAPA
  Use somente:
  "negociacao", "finalizado", "andamento", "perdido" ou "aprovado".

  10. NÃO CRIE NOVAS COLUNAS
  Retorne somente os campos definidos no formato acima.

  ORÇAMENTO ATUAL:
  ${JSON.stringify(currentData, null, 2)}

  INSTRUÇÕES DO USUÁRIO:
  "${userMessage}"

  Retorne o orçamento completo após aplicar SOMENTE as alterações solicitadas.
  `;
              break;
          }

          // ============================================================
          // 📋 ORÇAMENTO - LIST
          // ============================================================
          case 'orcamento_list': {
              prompt = `
  Você é um assistente responsável por CONSULTAR e LISTAR orçamentos existentes.

  O usuário está no fuso GMT-3 (Brasil).
  ${nowWithWeekday()}

  Responda SOMENTE com JSON válido.
  Não escreva explicações ou texto fora do JSON.

  FORMATO OBRIGATÓRIO:

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

  REGRAS:

  1. IDENTIFICADOR
  - Se o usuário informar um número que claramente seja o número de um orçamento, coloque-o em "id".
  - O número do orçamento normalmente possui formato numérico longo, como 1060626002.
  - "id" representa o "orcamento_numero" nesta consulta.
  - Não confunda o número do orçamento com telefone, valor, quantidade, data ou horário.
  - Se houver um identificador de orçamento, priorize-o para a busca.
  - Se "id" estiver preenchido, não é necessário usar nome ou telefone para identificar o registro.

  2. CLIENTE
  - "nome_cliente" deve ser preenchido somente se o usuário mencionar o nome do cliente.
  - "telefone_cliente" somente se o usuário informar um telefone para filtrar.
  - Não confunda telefone com identificador do orçamento.

  3. ETAPA
  - Se o usuário mencionar uma etapa, use exatamente a etapa correspondente.
  - Se não mencionar etapa, use "negociacao".
  - Use "todos" SOMENTE quando o usuário pedir explicitamente todos os orçamentos, independentemente da etapa.
  - Não escolha "todos" por conta própria.

  4. PERÍODO
  - O período é obrigatório.
  - Se o usuário informar uma data específica, use essa data para início e fim.
  - "hoje" = data atual.
  - "ontem" = dia anterior.
  - "amanhã" = dia seguinte.
  - "esta semana" = intervalo correspondente à semana solicitada.
  - "este mês" = primeiro ao último dia do mês atual.
  - "mês passado" = primeiro ao último dia do mês anterior.
  - "últimos 30 dias" = período de 30 dias terminando na data atual.
  - Se não houver qualquer referência de período, use os últimos 30 dias.

  5. INTERPRETAÇÃO DE DATAS
  - Não confunda número de orçamento com data.
  - Não invente datas.
  - Converta referências relativas considerando a data/hora atual fornecida acima.

  6. PERIODO_TEXTO
  - Deve ser uma descrição humana do período.
  - Exemplos:
    "hoje"
    "ontem"
    "amanhã"
    "últimos 30 dias"
    "de 10 a 20 de março"
    "este mês"
    "mês passado"

  7. NÃO INVENTAR
  - Não invente nome, telefone, etapa ou período solicitado.
  - Quando não houver filtro específico, use null nos campos correspondentes.

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
  Você é um assistente responsável por excluir um orçamento existente.

  Responda SOMENTE com JSON válido.
  Não escreva explicações, comentários ou texto fora do JSON.

  FORMATO OBRIGATÓRIO:

  {
    "modulo": "orcamento",
    "action": "delete",
    "id": número
  }

  REGRAS:

  - "id" deve ser o número do orçamento que o usuário deseja excluir.
  - O "id" corresponde ao campo "orcamento_numero".
  - Um identificador de orçamento pode ter formato como 1060626002.
  - Não confunda o número do orçamento com telefone, valor, quantidade, data ou horário.
  - Não altere o número.
  - Não faça cálculos com o número.
  - Se houver mais de um número na mensagem, use o contexto para identificar qual é o número do orçamento.
  - Não invente um identificador.

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
  Você é um assistente responsável por gerar documentos PDF de orçamentos.

  Responda SOMENTE com JSON válido.
  Não escreva explicações ou texto fora do JSON.

  FORMATO OBRIGATÓRIO:

  {
    "modulo": "orcamento",
    "action": "pdf",
    "id": número,
    "tipo": "Orçamento" | "Ordem de Serviço" | "Relatório Técnico" | "Nota de Serviço" | "Pedido" | "Proposta Comercial" | "Recibo",
    "opcoes": {
      "listaServicos": true,
      "listaMateriais": true,
      "ocultarValorServicos": false,
      "garantia": true,
      "assinaturaCliente": false,
      "assinaturaEmpresa": false
    },
    "valorRecibo": número | null
  }

  REGRAS:

  1. IDENTIFICADOR
  - "id" é o número do orçamento.
  - Esse número corresponde ao campo "orcamento_numero".
  - Exemplo: 1060626002.
  - Não confunda com telefone, valor, quantidade ou data.
  - Não altere nem calcule o número.

  2. TIPO DO DOCUMENTO
  - Se o usuário especificar o tipo, use exatamente o tipo correspondente.
  - Tipos aceitos:
    "Orçamento"
    "Ordem de Serviço"
    "Relatório Técnico"
    "Nota de Serviço"
    "Pedido"
    "Proposta Comercial"
    "Recibo"
  - Se não especificar, use "Orçamento".

  3. SERVIÇOS E MATERIAIS
  - Por padrão:
    "listaServicos": true
    "listaMateriais": true
  - Se o usuário pedir para ocultar os serviços, use "listaServicos": false.
  - Se pedir para ocultar os materiais, use "listaMateriais": false.
  - Não oculte materiais e serviços ao mesmo tempo.
  - Se não houver instrução, mantenha ambos visíveis.

  4. VALORES DOS SERVIÇOS
  - Por padrão "ocultarValorServicos": false.
  - Só altere para true se o usuário pedir explicitamente para ocultar os valores dos serviços.
  - Não confunda "ocultar serviços" com "ocultar valores dos serviços":
    * ocultar serviços → listaServicos: false
    * ocultar valores dos serviços → ocultarValorServicos: true

  5. GARANTIA
  - Por padrão "garantia": true.
  - Só altere para false se o usuário pedir explicitamente para retirar/ocultar a garantia.

  6. ASSINATURAS
  - Não altere as opções de assinatura sem solicitação explícita.
  - "assinaturaCliente" e "assinaturaEmpresa" devem permanecer false por padrão.

  7. RECIBO
  - Se o tipo for "Recibo", informe "valorRecibo".
  - Se o usuário informar o valor, converta para número.
  - Exemplo: R$ 1.500,00 → 1500.
  - Se o tipo for "Recibo" e o valor não for informado, use null.
  - Para outros tipos, "valorRecibo": null.

  8. NÃO INVENTAR
  - Não invente número de orçamento.
  - Não invente valor de recibo.
  - Não altere opções sem instrução explícita.

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
  Você é um assistente inteligente responsável por criar compromissos na agenda.

  O usuário está no fuso GMT-3 (Brasil).
  ${nowWithWeekday()}

  Responda SOMENTE com JSON válido.
  Não escreva explicações ou texto fora do JSON.

  FORMATO OBRIGATÓRIO:

  {
    "modulo": "agenda",
    "action": "create",
    "title": "string",
    "datetime": "Data/hora ISO 8601 no GMT-3",
    "reminder_minutes": número
  }

  REGRAS:

  1. TÍTULO
  - "title" deve representar o nome do atendimento, compromisso, evento, cliente ou local.
  - Preserve as informações importantes fornecidas pelo usuário.
  - Não coloque data, horário ou número de identificação dentro do título quando essas informações tiverem campos próprios.

  2. DATA E HORA
  - O usuário está no horário de Brasília, GMT-3.
  - Converta referências como:
    "hoje"
    "amanhã"
    "sábado"
    "segunda"
    "daqui 2 horas"
    "mais tarde"
    "às 14h"
    para uma data/hora concreta.
  - Sempre produza uma data/hora ISO 8601 com offset GMT-3.
  - Nunca invente uma data quando a mensagem fornecer informação suficiente para determinar a data.

  3. HORÁRIO
  - Se o usuário informar apenas o horário e não informar uma data, use a data adequada considerando ${nowWithWeekday()}.
  - Se disser "amanhã às 10h", use amanhã às 10h.
  - Se disser "sábado às 14h", use o próximo sábado correspondente.
  - Se disser "daqui 2 horas", some 2 horas ao horário atual.
  - Se disser "daqui 30 minutos", some 30 minutos ao horário atual.

  4. LEMBRETE
  - Se o usuário informar um lembrete, use o número de minutos correspondente.
  - Se não informar, use 30.
  - Não invente outro valor.

  5. NÃO CONFUNDIR NÚMEROS
  - Números de telefone, valores, quantidades e identificadores não devem ser usados como horário.
  - Se houver um número longo como 1060626002, ele pode ser um identificador de registro e não uma hora.

  Texto do usuário:
  """${userMessage}"""
  `;
              break;
          }

          // ============================================================
          // 📅 AGENDA - LIST
          // ============================================================
          case 'agenda_list': {
              prompt = `
  Você é um assistente responsável por CONSULTAR e LISTAR eventos da agenda.

  O usuário está no fuso GMT-3 (Brasil).
  ${nowWithWeekday()}

  Responda SOMENTE com JSON válido.
  Não escreva explicações ou texto fora do JSON.

  FORMATO OBRIGATÓRIO:

  {
    "modulo": "agenda",
    "action": "list",
    "title": "string" ou null,
    "id": "number" ou null,
    "start_date": "YYYY-MM-DD",
    "end_date": "YYYY-MM-DD"
  }

  REGRAS:

  1. IDENTIFICADOR DE EVENTO
  - O campo "id" representa o "event_numero".
  - Se o usuário informar um identificador de evento, coloque-o em "id".
  - Identificadores podem ter formato numérico longo, por exemplo: 1060626002.
  - Não confunda identificador com telefone, preço, quantidade, data ou horário.
  - Se houver um ID claramente identificado, ele tem prioridade sobre o título.

  2. PRIORIDADE DO ID
  - Se "id" estiver preenchido, "title" deve ser null.
  - Quando houver um ID, não use o número como título.
  - Não transforme um identificador em texto de título.

  3. TÍTULO
  - Só preencha "title" se o usuário informar um nome, evento, cliente ou local para pesquisar.
  - Números isolados não são títulos.
  - Se não houver título, use null.

  4. DATAS
  - "start_date" e "end_date" são sempre obrigatórios.
  - Se o usuário disser "hoje", ambos devem ser a data de hoje.
  - "amanhã" → ambos devem ser amanhã.
  - "ontem" → ambos devem ser ontem.
  - "sábado", "segunda", "terça" etc. → use o dia correspondente.
  - "esta semana" → use o intervalo correspondente à semana atual.
  - "semana que vem" → use o intervalo correspondente à próxima semana.
  - "de segunda a sexta" → gere o intervalo correspondente.
  - "este mês" → primeiro e último dia do mês atual.
  - Se não houver qualquer referência de data, use a data de hoje para ambos.

  5. NÃO INVENTAR
  - Não invente título, ID ou datas.
  - Use somente informações determinadas pela mensagem e pela data/hora atual fornecida acima.

  Texto do usuário:
  """${userMessage}"""
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
  Você é um assistente inteligente responsável por EDITAR um evento existente da agenda.

  O usuário está no fuso GMT-3 (Brasil).
  ${nowWithWeekday()}

  Responda SOMENTE com JSON válido.
  Não escreva explicações ou texto fora do JSON.

  O evento existente possui o identificador:
  ${id}

  Esse identificador corresponde ao campo "event_numero".
  NÃO altere esse identificador.

  FORMATO OBRIGATÓRIO:

  {
    "modulo": "agenda",
    "action": "edit",
    "title": "string",
    "datetime": "Data/hora ISO 8601 no GMT-3",
    "reminder_minutes": número
  }

  REGRAS:

  1. PRESERVAR O EVENTO
  - Mantenha os dados atuais que o usuário não pediu para alterar.
  - Altere somente o que estiver sendo solicitado.
  - Não invente informações.

  2. TÍTULO
  - Se o usuário não pedir alteração do título, mantenha o título atual.
  - Se pedir alteração, substitua pelo novo título informado.
  - Não coloque o ID no título.

  3. DATA E HORA
  - Todas as datas devem estar em GMT-3 com offset "-03:00".
  - Se o usuário disser "amanhã", use o dia seguinte à data atual.
  - Se disser "depois de amanhã", use dois dias após a data atual.
  - Se disser "sábado", "segunda", etc., determine o dia correto.
  - Se disser "daqui X minutos", some X minutos ao horário atual.
  - Se disser "daqui X horas", some X horas ao horário atual.
  - Se disser "mais tarde", interprete usando o contexto temporal e a hora atual.
  - Se informar somente um horário exato, como "às 14h" ou "às 7:40", altere somente a hora e preserve a data do evento, salvo se o contexto indicar explicitamente outra data.
  - Se informar uma nova data e hora, use ambas.

  4. LEMBRETE
  - Se o usuário pedir alteração do lembrete, atualize "reminder_minutes".
  - Se não pedir, preserve o valor atual.

  5. NÚMEROS
  - Não confunda o ID do evento ${id} com horário, telefone, valor ou quantidade.
  - O ID do evento não deve aparecer em nenhum outro campo.

  EVENTO ATUAL:
  ${JSON.stringify({ ...currentData, date: dateBRT }, null, 2)}

  MENSAGEM DO USUÁRIO:
  "${userMessage}"

  Retorne o evento completo após aplicar SOMENTE as alterações solicitadas.
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