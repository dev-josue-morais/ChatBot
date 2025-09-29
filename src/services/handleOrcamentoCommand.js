const supabase = require('./supabase');

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value || 0);
}

function aplicarDesconto(total, desconto) {
  if (!desconto) return { totalFinal: total, descricao: formatCurrency(total) };

  // Caso percentual (termina com %)
  if (typeof desconto === "string" && desconto.trim().endsWith("%")) {
    const perc = parseFloat(desconto.replace("%", "").trim());
    if (isNaN(perc)) return { totalFinal: total, descricao: formatCurrency(total) };

    const valorComDesconto = total - (total * (perc / 100));
    return {
      totalFinal: valorComDesconto,
      descricao: `~${formatCurrency(total)}~ ${formatCurrency(valorComDesconto)} (-${perc}%)`
    };
  }

  // Caso valor absoluto
  const valor = parseFloat(desconto);
  if (isNaN(valor) || valor <= 0) return { totalFinal: total, descricao: formatCurrency(total) };

  const valorComDesconto = total - valor;
  return {
    totalFinal: valorComDesconto,
    descricao: `~${formatCurrency(total)}~ ${formatCurrency(valorComDesconto)} (-${formatCurrency(valor)})`
  };
}

function formatOrcamento(o) {
  const totalMateriais = (o.materiais || []).reduce((sum, m) => {
    return sum + (m.qtd || 0) * (m.valor || 0);
  }, 0);

  const totalServicos = (o.servicos || []).reduce((sum, s) => {
    return sum + (s.valor || 0);
  }, 0);

  const descontoMateriais = aplicarDesconto(totalMateriais, o.desconto_materiais);
  const descontoServicos = aplicarDesconto(totalServicos, o.desconto_servicos);

  const totalOriginal = totalMateriais + totalServicos;
  const totalFinal = descontoMateriais.totalFinal + descontoServicos.totalFinal;

  return `
📝 Orçamento ${o.orcamento_numero}
👤 Cliente: ${o.nome_cliente}
📞 Telefone: ${o.telefone_cliente}
📌 Observação: ${o.descricao_atividades || '-'}

📦 Materiais:
${(o.materiais && o.materiais.length > 0)
      ? o.materiais.map(m => {
          const total = (m.qtd || 0) * (m.valor || 0);
          return `   - ${m.nome} (Qtd: ${m.qtd} ${m.unidade || ''}, Unit: ${formatCurrency(m.valor)}, Total: ${formatCurrency(total)})`;
        }).join("\n")
      : "   Nenhum"}

💰 Total Materiais: ${descontoMateriais.descricao}

🔧 Serviços:
${(o.servicos && o.servicos.length > 0)
      ? o.servicos.map(s => `   - ${s.nome} (Valor: ${formatCurrency(s.valor)})`).join("\n")
      : "   Nenhum"}

💰 Total Serviços: ${descontoServicos.descricao}

🧾 Total Geral: ${totalFinal !== totalOriginal 
      ? `~${formatCurrency(totalOriginal)}~ ${formatCurrency(totalFinal)}` 
      : formatCurrency(totalFinal)}
`.trim();
}

async function handleOrcamentoCommand(command, userPhone) {
    try {
        switch (command.action) {
            case 'create': {  
    if (!command.nome_cliente) {  
        return "⚠️ O campo *nome do cliente* é obrigatório.";  
    }  
    if (!command.telefone_cliente) {  
        return "⚠️ O campo *telefone do cliente* é obrigatório.";  
    }  
  
    const { data, error } = await supabase.from('orcamentos').insert([{  
        nome_cliente: command.nome_cliente,  
        telefone_cliente: command.telefone_cliente,  
        descricao_atividades: command.descricao_atividades || '',  
        materiais: command.materiais || [],  
        servicos: command.servicos || [],  
        desconto_materiais: command.desconto_materiais || 0,  
        desconto_servicos: command.desconto_servicos || 0  
    }]).select();  
  
    if (error) {  
        console.error("Erro ao criar orçamento:", error);  
        return `⚠️ Não consegui criar o orçamento para "${command.nome_cliente}".`;  
    }  
  
    return `✅ Orçamento criado com sucesso:\n\n${formatOrcamento(data[0])}`;  
}
           case 'delete': {
    if (!command.id) return '⚠️ É necessário informar o ID do orçamento para deletar.';

    const { data, error } = await supabase
        .from('orcamentos')
        .delete()
        .eq('orcamento_numero', command.id)
        .select();

    if (error) {
        console.error("Erro ao deletar orçamento:", error);
        return `⚠️ Não consegui deletar o orçamento ${command.id}.`;
    }

    if (!data || data.length === 0) {
        return `⚠️ Orçamento ${command.id} não encontrado.`;
    }

    return `🗑 Orçamento ${command.id} deletado com sucesso.`;
}
          case 'edit': {
    if (!command.id) return '⚠️ É necessário informar o ID do orçamento para editar.';

    // Buscar orçamento atual
    const { data: currentData, error: fetchError } = await supabase
        .from('orcamentos')
        .select('materiais, servicos, nome_cliente, telefone_cliente, descricao_atividades, desconto_materiais, desconto_servicos')
        .eq('orcamento_numero', command.id)
        .single();

    if (fetchError) {
        console.error("Erro ao buscar orçamento:", fetchError);
        return `⚠️ Não consegui buscar o orçamento ${command.id}.`;
    }

    let materiais = [...(currentData.materiais || [])];
    let servicos = [...(currentData.servicos || [])];

    // --- Materiais ---
    if (command.materiais) {
        materiais = command.materiais.map(m => ({
            nome: m.nome.trim(),
            qtd: m.qtd,
            valor: m.valor,
            unidade: m.unidade?.trim()
        }));
    }

    if (command.add_materiais) {
        for (const newItem of command.add_materiais) {
            const nomeNormalized = newItem.nome.trim().toLowerCase();
            const existing = materiais.find(m => m.nome.trim().toLowerCase() === nomeNormalized);
            if (existing) {
                if (newItem.qtd != null) existing.qtd = newItem.qtd;
                if (newItem.valor != null) existing.valor = newItem.valor;
                if (newItem.unidade != null) existing.unidade = newItem.unidade.trim();
            } else {
                materiais.push({
                    ...newItem,
                    nome: newItem.nome.trim(),
                    unidade: newItem.unidade?.trim()
                });
            }
        }
    }

    if (command.edit_materiais) {
        for (const edit of command.edit_materiais) {
            const nomeNormalized = edit.nome.trim().toLowerCase();
            const item = materiais.find(m => m.nome.trim().toLowerCase() === nomeNormalized);
            if (item) {
                if (edit.qtd != null) item.qtd = edit.qtd;
                if (edit.valor != null) item.valor = edit.valor;
                if (edit.unidade != null) item.unidade = edit.unidade.trim();
            }
        }
    }

    if (command.remove_materiais) {
        materiais = materiais.filter(
            m => !command.remove_materiais.some(r => r.nome.trim().toLowerCase() === m.nome.trim().toLowerCase())
        );
    }

    // --- Serviços ---
    if (command.servicos) {
        servicos = command.servicos.map(s => ({
            nome: s.nome.trim(),
            valor: s.valor
        }));
    }

    if (command.add_servicos) {
        for (const newItem of command.add_servicos) {
            const nomeNormalized = newItem.nome.trim().toLowerCase();
            const existing = servicos.find(s => s.nome.trim().toLowerCase() === nomeNormalized);
            if (existing) {
                if (newItem.valor != null) existing.valor = newItem.valor;
            } else {
                servicos.push({
                    ...newItem,
                    nome: newItem.nome.trim()
                });
            }
        }
    }

    if (command.edit_servicos) {
        for (const edit of command.edit_servicos) {
            const nomeNormalized = edit.nome.trim().toLowerCase();
            const item = servicos.find(s => s.nome.trim().toLowerCase() === nomeNormalized);
            if (item && edit.valor != null) item.valor = edit.valor;
        }
    }

    if (command.remove_servicos) {
        servicos = servicos.filter(
            s => !command.remove_servicos.some(r => r.nome.trim().toLowerCase() === s.nome.trim().toLowerCase())
        );
    }

    // --- Monta objeto de updates ---
    const updates = {
        ...(command.nome_cliente && { nome_cliente: command.nome_cliente }),
        ...(command.telefone_cliente && { telefone_cliente: command.telefone_cliente }),
        ...(command.descricao_atividades && { descricao_atividades: command.descricao_atividades }),
        materiais,
        servicos,
        ...(command.desconto_materiais !== undefined && { desconto_materiais: command.desconto_materiais }),
        ...(command.desconto_servicos !== undefined && { desconto_servicos: command.desconto_servicos }),
    };

    // Atualiza no banco
    const { data, error } = await supabase
        .from('orcamentos')
        .update(updates)
        .eq('orcamento_numero', command.id)
        .select();

    if (error) {
        console.error("Erro ao editar orçamento:", error);
        return `⚠️ Não consegui editar o orçamento ${command.id}.`;
    }

    return `✏️ Orçamento atualizado com sucesso:\n\n${formatOrcamento(data[0])}`;
}
            case 'list': {
                let query = supabase.from('orcamentos').select('*');

                if (command.telefone_cliente) {
                    query = query.eq('telefone_cliente', command.telefone_cliente);
                }
                if (command.nome_cliente) {
                    query = query.ilike('nome_cliente', `%${command.nome_cliente}%`);
                }
                if (command.id) {
                    query = query.eq('orcamento_numero', command.id);
                }

                const { data: orcamentos, error } = await query;

                if (error) {
                    console.error("Erro ao listar orçamentos:", error);
                    return "⚠️ Não foi possível listar os orçamentos.";
                }

                if (!orcamentos || orcamentos.length === 0) return "📄 Nenhum orçamento encontrado.";

                return orcamentos.map(formatOrcamento).join("\n\n---\n\n");
            }

            case 'gerar_pdf': {
  if (!command.id) return '⚠️ É necessário informar o ID do orçamento.';

  const { data: orcamentos, error } = await supabase
    .from('orcamentos')
    .select('*')
    .eq('orcamento_numero', command.id)
    .limit(1);

  if (error) {
    console.error("Erro ao buscar orçamento:", error);
    return `⚠️ Não consegui gerar o PDF do orçamento ${command.id}.`;
  }

  if (!orcamentos || orcamentos.length === 0) {
    return `⚠️ Orçamento ${command.id} não encontrado.`;
  }

  const o = orcamentos[0];

  // Gerar HTML (baseado no que você já tem no React Native, adaptando para Node)
  const htmlContent = `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { text-align: center; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #000; padding: 6px; text-align: left; }
          th { background: #eee; }
        </style>
      </head>
      <body>
        <h1>Orçamento ${o.orcamento_numero}</h1>
        <p><b>Cliente:</b> ${o.nome_cliente}</p>
        <p><b>Telefone:</b> ${o.telefone_cliente}</p>
        <p><b>Observações:</b> ${o.descricao_atividades || '-'}</p>

        <h2>Materiais</h2>
        <table>
          <tr><th>Nome</th><th>Qtd</th><th>Unidade</th><th>Valor</th><th>Total</th></tr>
          ${(o.materiais || []).map(m => `
            <tr>
              <td>${m.nome}</td>
              <td>${m.qtd}</td>
              <td>${m.unidade || ''}</td>
              <td>R$ ${m.valor.toFixed(2)}</td>
              <td>R$ ${(m.qtd * m.valor).toFixed(2)}</td>
            </tr>
          `).join("")}
        </table>

        <h2>Serviços</h2>
        <table>
          <tr><th>Descrição</th><th>Valor</th></tr>
          ${(o.servicos || []).map(s => `
            <tr>
              <td>${s.nome}</td>
              <td>R$ ${s.valor.toFixed(2)}</td>
            </tr>
          `).join("")}
        </table>

        <h2>Total</h2>
        <p><b>Total Geral:</b> R$ ${((
          (o.materiais || []).reduce((t, m) => t + m.qtd * m.valor, 0) +
          (o.servicos || []).reduce((t, s) => t + s.valor, 0)
        )).toFixed(2)}</p>
      </body>
    </html>
  `;

  // Agora gerar o PDF
  const { jsPDF } = require("jspdf");
  const doc = new jsPDF();
  const { default: html2canvas } = await import("html2canvas"); // se rodar em browser

  // 👉 Se rodar só em Node (sem browser), use puppeteer ou pdfmake
  const fs = require("fs");
  const pdfPath = `/tmp/orcamento_${o.orcamento_numero}.pdf`;

  const puppeteer = require("puppeteer");
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setContent(htmlContent);
  await page.pdf({ path: pdfPath, format: "A4" });
  await browser.close();

  return `📄 PDF do orçamento ${command.id} gerado com sucesso! Arquivo salvo em: ${pdfPath}`;
}}

module.exports = handleOrcamentoCommand;