const openai = require('./openai');

async function handleGPTCommand(text) {
  const lower = text.toLowerCase();
  let modulo = null;
  let action = null;
  let prompt = '';

  // 🔹 Identificação do módulo
  if (lower.includes('orcamento')) modulo = 'orcamento';
  else if (lower.includes('agenda')) modulo = 'agenda';

  // 🔹 Identificação da ação
  if (lower.includes('criar') || lower.includes('novo')) action = 'create';
  else if (lower.includes('editar')) action = 'edit';
  else if (lower.includes('listar') || lower.includes('ver')) action = 'list';
  else if (lower.includes('excluir') || lower.includes('deletar')) action = 'delete';
  else if (lower.includes('pdf')) action = 'pdf';

  if (!modulo || !action) {
    return { erro: 'Comando não reconhecido', text };
  }

  // 🔹 Escolher prompt conforme módulo e ação
  switch (`${modulo}_${action}`) {
    case 'orcamento_create':
      prompt = `
Você é um assistente que converte texto em JSON para criar um orçamento.
Extraia nome_cliente, telefone_cliente, materiais (nome, qtd, valor), serviços (nome, valor) e observações (array).
Exemplo:
{
  "modulo": "orcamento",
  "action": "create",
  "nome_cliente": "João",
  "telefone_cliente": "11999999999",
  "materiais": [{ "nome": "fio 2.5mm", "qtd": 10, "valor": 2.5 }],
  "servicos": [{ "nome": "troca de chuveiro", "valor": 80 }],
  "observacoes": ["Garantia 90 dias", "Pagamento via Pix"]
}
Texto: """${text}"""
`;
      break;

    case 'orcamento_edit':
      prompt = `
Você é um assistente que edita um orçamento existente.
Retorne o id (8 dígitos no formato número ou null), materiais e serviços atualizados.
Exemplo:
{
  "modulo": "orcamento",
  "action": "edit",
  "id": "01102501",
  "materiais": [{ "nome": "fio 6mm azul", "qtd": 10, "valor": 5 }],
  "servicos": [{ "nome": "instalação de disjuntor", "valor": 50 }]
}
Texto: """${text}"""
`;
      break;

    case 'orcamento_list':
      prompt = `
Você é um assistente que lista orçamentos.
Responda apenas:
{ "modulo": "orcamento", "action": "list" }
`;
      break;

    case 'orcamento_delete':
      prompt = `
Você é um assistente que exclui orçamentos.
Retorne apenas:
{ "modulo": "orcamento", "action": "delete", "id": "01102501" }
Texto: """${text}"""
`;
      break;

    case 'orcamento_pdf':
      prompt = `
Você é um assistente que gera PDF de um orçamento.
Retorne apenas:
{ "modulo": "orcamento", "action": "pdf", "id": "01102501" }
Texto: """${text}"""
`;
      break;

    case 'agenda_create':
      prompt = `
Você é um assistente que cria compromissos.
Retorne:
{
  "modulo": "agenda",
  "action": "create",
  "cliente": "João",
  "data": "2025-10-06",
  "hora": "15:00",
  "descricao": "Instalação de chuveiro"
}
Texto: """${text}"""
`;
      break;

    case 'agenda_delete':
      prompt = `
Você é um assistente que exclui compromissos.
Retorne:
{ "modulo": "agenda", "action": "delete", "id": "123" }
Texto: """${text}"""
`;
      break;

    case 'agenda_list':
      prompt = `
Você é um assistente que lista compromissos.
Responda apenas:
{ "modulo": "agenda", "action": "list" }
`;
      break;

    default:
      return { erro: 'Prompt não definido', modulo, action };
  }

  // 🔹 Chamar GPT
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: prompt }]
    });

    const content = completion.choices[0].message.content;
    return JSON.parse(content);
  } catch (err) {
    console.error('Erro ao processar GPT:', err);
    return { erro: 'Falha ao chamar GPT', modulo, action };
  }
}

module.exports = { handleGPTCommand };