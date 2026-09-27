// handleDespesasCommand.js
const supabase = require('./supabase');
const { DateTime } = require('luxon');

// ======================================================
// CONFIGURAÇÕES
// ======================================================

const TIMEZONE = 'America/Sao_Paulo';

const TIPOS_DESPESA = [
  'conducao',
  'materiais',
  'alimentacao',
  'outras'
];

// ======================================================
// FUNÇÕES AUXILIARES
// ======================================================
function emojiTipo(tipo) {

  const emojis = {
    conducao: '🚗',
    materiais: '🔨',
    alimentacao: '🍽️',
    outras: '📦'
  };

  return emojis[tipo] || '📂';
}


function formatPeriodoTitulo(periodo) {

  if (!periodo) {
    return '';
  }

  const textos = {
    'este mês': 'Setembro/2026',
    'mês passado': 'Mês passado',
    'esta semana': 'Esta semana',
    'semana passada': 'Semana passada',
    'hoje': 'Hoje',
    'ontem': 'Ontem',
    'últimos 30 dias': 'Últimos 30 dias',
    'últimos 6 meses': 'Últimos 6 meses',
    'todo o período': 'Todo o período'
  };

  return textos[periodo] || periodo;
}
function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function formatDateBR(date) {
  if (!date) return '';

  return DateTime
    .fromISO(date, { zone: TIMEZONE })
    .setZone(TIMEZONE)
    .toFormat('dd/MM/yyyy HH:mm');
}

function nomeTipo(tipo) {
  const nomes = {
    conducao: 'Condução',
    materiais: 'Materiais',
    alimentacao: 'Alimentação',
    outras: 'Outras'
  };

  return nomes[tipo] || tipo;
}

// ======================================================
// 🧾 FUNÇÃO PRINCIPAL
// ======================================================

async function handleDespesasCommand(command, userPhone) {

  try {

    const { action } = command || {};

    // Segurança básica
    if (!userPhone) {
      console.error('handleDespesasCommand: userPhone não informado.');
      return "❌ Não foi possível identificar o usuário.";
    }

    switch (action) {

      // ======================================================
      // ➕ CREATE
      // ======================================================

      case 'create': {

        const {
          tipo,
          valor,
          descricao
        } = command;

        // ------------------------------
        // Validações
        // ------------------------------

        if (!descricao || !String(descricao).trim()) {
          return "⚠️ A descrição é obrigatória.";
        }

        if (!tipo || !TIPOS_DESPESA.includes(tipo)) {
          return "⚠️ Tipo de despesa inválido.";
        }

        const valorNumerico = Number(valor);

        if (!Number.isFinite(valorNumerico) || valorNumerico < 0) {
          return "⚠️ Informe um valor válido para a despesa.";
        }

        // ------------------------------
        // INSERT
        // ------------------------------
        //
        // NÃO enviamos:
        // - despesa_numero
        // - data
        //
        // O Supabase/trigger gera esses campos.

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

        // ------------------------------
        // RESPOSTA
        // ------------------------------

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


      // ======================================================
      // ✏️ EDIT
      // ======================================================

      case 'edit': {

        const id =
          command.id ||
          command.despesa_numero;

        if (!id) {
          return "⚠️ É necessário informar o ID da despesa para editar.";
        }

        // ------------------------------
        // Busca somente do usuário
        // ------------------------------

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

        // ------------------------------
        // Monta atualização
        // ------------------------------

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

        // ------------------------------
        // Nada para alterar
        // ------------------------------

        if (Object.keys(updated).length === 0) {
          return "⚠️ Nenhuma alteração foi identificada.";
        }

        // ------------------------------
        // UPDATE
        // ------------------------------

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


            // ======================================================
      // 📋 LIST / 📊 RESUMO
      // ======================================================

      case 'list': {

        const filtros =
          command.filtros || {};

        const resumo =
          command.resumo === true;

        // ------------------------------
        // Query inicial
        // ------------------------------

        let query = supabase
          .from('despesas')
          .select('*')
          .eq('user_phone', userPhone);

        // ------------------------------
        // FILTRO POR TIPO
        // ------------------------------

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

        // ------------------------------
        // FILTRO POR DESCRIÇÃO
        // ------------------------------

        if (
          filtros.por_descricao === true &&
          command.descricao
        ) {

          query = query.ilike(
            'descricao',
            `%${command.descricao}%`
          );
        }

        // ------------------------------
        // FILTRO POR PERÍODO
        // ------------------------------

        if (
          filtros.por_periodo === true
        ) {

          if (command.periodo_start) {

            query = query.gte(
              'data',
              command.periodo_start
            );
          }

          if (command.periodo_end) {

            query = query.lte(
              'data',
              command.periodo_end
            );
          }
        }

        // ------------------------------
        // ORDENAR
        // ------------------------------

        query = query.order(
          'data',
          { ascending: false }
        );

        // ------------------------------
        // EXECUTAR
        // ------------------------------

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

        // ==================================================
        // NENHUM RESULTADO
        // ==================================================

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

        // ==================================================
        // 📊 RESUMO
        // ==================================================

        if (resumo) {

          // ----------------------------------------------
          // Soma por categoria
          // ----------------------------------------------

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

          // ----------------------------------------------
          // Total geral
          // ----------------------------------------------

          const totalGeral = data.reduce(
            (sum, d) =>
              sum + Number(d.valor || 0),
            0
          );

          // ----------------------------------------------
          // Título
          // ----------------------------------------------

          let titulo =
            "📊 Despesas";

          if (command.periodo_texto) {

            titulo +=
              ` — ${formatPeriodoTitulo(
                command.periodo_texto
              )}`;
          }

          // ----------------------------------------------
          // Linhas
          // ----------------------------------------------

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

          // ----------------------------------------------
          // Retorno
          // ----------------------------------------------

          return [
            titulo,
            "",
            linhas.join('\n'),
            "────────────────────────",
            `💰 Total: ${formatCurrency(totalGeral)}`
          ].join('\n');
        }

        // ==================================================
        // 📋 LISTAGEM NORMAL
        // ==================================================

        const linhas = data.map((d) => {

          return [
            `🆔 ${d.despesa_numero}`,
            `📅 ${formatDateBR(d.data)}`,
            `📂 ${nomeTipo(d.tipo)}`,
            `📘 ${d.descricao}`,
            `💰 ${formatCurrency(d.valor)}`
          ].join('\n');

        });

        // ==================================================
        // TOTAL
        // ==================================================

        const total = data.reduce(
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

      // ======================================================
      // 🗑️ DELETE
      // ======================================================

      case 'delete': {

        const id = command.id;

        if (!id) {
          return "⚠️ É necessário informar o ID da despesa para excluir.";
        }

        // ------------------------------
        // Primeiro verifica se pertence
        // ao usuário
        // ------------------------------

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

        // ------------------------------
        // DELETE
        // ------------------------------

        const {
          error: deleteError
        } = await supabase
          .from('despesas')
          .delete()
          .eq('despesa_numero', String(id))
          .eq('user_phone', userPhone);

        if (deleteError) {

          console.error(
            'Erro ao deletar despesa:',
            deleteError
          );

          return "❌ Falha ao excluir despesa.";
        }

        return [
          "🗑️ Despesa excluída com sucesso!",
          "",
          `🆔 ${current.despesa_numero}`,
          `📘 ${current.descricao}`,
          `💰 ${formatCurrency(current.valor)}`
        ].join('\n');
      }


      // ======================================================
      // 📄 PDF
      // ======================================================

      case 'pdf': {

        const {
          tipo,
          start_date,
          end_date
        } = command;

        // Futuramente ligaremos ao gerador de PDF.

        return [
          "🧾 Gerando PDF de despesas...",
          `📂 Tipo: ${tipo || 'todos'}`,
          `📅 Início: ${start_date || '-'}`,
          `📅 Fim: ${end_date || '-'}`
        ].join('\n');
      }


      // ======================================================
      // ❓ DEFAULT
      // ======================================================

      default:

        return "⚠️ Ação de despesa não reconhecida.";
    }

  } catch (err) {

    console.error(
      "Erro em handleDespesasCommand:",
      err
    );

    return "❌ Erro interno ao processar despesas.";
  }
}

module.exports = handleDespesasCommand;