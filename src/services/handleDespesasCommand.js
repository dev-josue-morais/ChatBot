// handleDespesasCommand.js
const supabase = require('./supabase');
const { DateTime } = require('luxon');

// ======================================================
// 🧾 Função principal
// ======================================================
async function handleDespesasCommand(command, userPhone) {
  try {
    const { action } = command || {};

    switch (action) {

      // ======================================================
      // ➕ CREATE
      // ======================================================
      case 'create': {
        const { tipo, valor, descricao } = command;

        if (!descricao)
          return "⚠️ A descrição é obrigatória (ex: gasolina, mecânico, óleo).";

        if (!tipo || !['conducao', 'materiais', 'outras'].includes(tipo))
          return "⚠️ O tipo deve ser: condução, materiais ou outras.";

        const { error } = await supabase
          .from('despesas')
          .insert([
            {
              tipo,
              valor: Number(valor) || 0,
              descricao,
              user_phone: userPhone,
              data: DateTime.now().setZone('America/Sao_Paulo').toISO(),
            },
          ]);

        if (error) {
          console.error('Erro ao criar despesa:', error);
          return "❌ Erro ao registrar a despesa.";
        }

        return `✅ Despesa registrada com sucesso!\n📘 ${descricao} — R$ ${valor}`;
      }

      // ======================================================
      // ✏️ EDIT
      // ======================================================
      case 'edit': {
        const { id, tipo, valor, descricao } = command;

        if (!id) return "⚠️ É necessário informar o ID da despesa para editar.";

        const { data: current, error: fetchError } = await supabase
          .from('despesas')
          .select('*')
          .eq('despesa_numero', id)
          .single();

        if (fetchError || !current)
          return `⚠️ Não encontrei a despesa ID ${id}.`;

        const updated = {
          tipo: tipo || current.tipo,
          valor: (valor !== undefined && valor !== null) ? Number(valor) : current.valor,
          descricao: descricao || current.descricao,
        };

        const { error } = await supabase
          .from('despesas')
          .update(updated)
          .eq('despesa_numero', id);

        if (error) {
          console.error('Erro ao atualizar despesa:', error);
          return "❌ Falha ao atualizar a despesa.";
        }

        return `✅ Despesa atualizada!\n📘 ${updated.descricao} — R$ ${updated.valor}`;
      }

      // ======================================================
      // 📋 LIST
      // ======================================================
      case 'list': {
        const { tipo, start_date, end_date } = command;

        const filtros = { user_phone: userPhone };
        if (tipo && tipo !== 'todos') filtros.tipo = tipo;

        // se não tiver datas, pega o mês atual (GMT-3)
        const start =
          start_date ||
          DateTime.now().setZone('America/Sao_Paulo').startOf('month').toISO();
        const end =
          end_date ||
          DateTime.now().setZone('America/Sao_Paulo').endOf('month').toISO();

        const query = supabase
          .from('despesas')
          .select('*')
          .gte('data', start)
          .lte('data', end)
          .match(filtros)
          .order('data', { ascending: false });

        const { data, error } = await query;

        if (error) {
          console.error('Erro ao listar despesas:', error);
          return "❌ Erro ao listar despesas.";
        }

        if (!data || !data.length) return "⚠️ Nenhuma despesa encontrada neste período.";

        const resumo = data
          .map(
            (d) =>
              `#${d.despesa_numero} — ${d.descricao} (${d.tipo}) - R$ ${d.valor}`
          )
          .join('\n');

        return `📊 *Despesas encontradas:*\n${resumo}`;
      }

      // ======================================================
      // 🗑️ DELETE
      // ======================================================
      case 'delete': {
        const { id } = command;
        if (!id) return "⚠️ É necessário informar o ID da despesa para excluir.";

        const { error } = await supabase
          .from('despesas')
          .delete()
          .eq('despesa_numero', id);

        if (error) {
          console.error('Erro ao deletar despesa:', error);
          return "❌ Falha ao excluir despesa.";
        }

        return `🗑️ Despesa ${id} excluída com sucesso.`;
      }

      // ======================================================
      // 📄 PDF
      // ======================================================
      case 'pdf': {
        const { tipo, start_date, end_date } = command;

        // Placeholder: aqui você deve chamar a função que gera o PDF.
        // Exemplo (pseudo):
        // const pdfUrl = await gerarPDFDespesas({ tipo, start_date, end_date, userPhone });
        // return `🧾 PDF gerado: ${pdfUrl}`;

        return `🧾 Gerando PDF de despesas *${tipo}* de ${start_date} até ${end_date}...`;
      }

      // ======================================================
      // ❓ DEFAULT
      // ======================================================
      default:
        return "⚠️ Ação de despesa não reconhecida.";
    }
  } catch (err) {
    console.error("Erro em handleDespesasCommand:", err);
    return "❌ Erro interno ao processar despesas.";
  }
}

module.exports = handleDespesasCommand ;