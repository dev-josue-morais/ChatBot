const supabase = require("./supabase");
const { sendWhatsAppRaw } = require("./whatsappService");
const { startUserRegistration, startUserEdit } = require("./userRegistration");
const { DESTINO_FIXO } = require('../utils/config');

/**
 * Trata comando de criação de usuário
 */
const handleUserRegistrationCommand = async (myText, senderNumber, userData) => {
  const criarUsuarioMatch = myText.match(/^criar usu[aá]rio(?: (.+))?$/i);
  if (criarUsuarioMatch) {
    if (userData) {
      await sendWhatsAppRaw({
        messaging_product: "whatsapp",
        to: senderNumber,
        type: "text",
        text: { body: `✅ Você já está cadastrado, ${userData.user_name}.` }
      });
      return true;
    }

    await startUserRegistration(senderNumber);
    return true;
  }

  return false;
};

/**
 * Trata comandos enviados por usuários já cadastrados.
 * Inclui upload, ajuda, orçamentos, atendimentos, premium e renovação.
 */
const handleCommands = async (myText, senderNumber, userData, now) => {

function normalizarTelefone(numero) {
  if (!numero) return null;

  // Remove tudo que não for número
  let digits = numero.replace(/\D/g, '');

  // Remove zeros à esquerda por segurança
  digits = digits.replace(/^0+/, '');

  // Se já vier com +55 ou 55 no início, mantém só os 13 primeiros dígitos
  if (digits.startsWith('55')) {
    digits = digits.substring(0, 13);
    return digits;
  }

  // Se tiver 11 dígitos (ex: 64 992869608) → adiciona DDI
  if (digits.length === 11) {
    return '55' + digits;
  }

  // Se tiver 10 dígitos (sem o 9 extra, ex: 64 92869608)
  if (digits.length === 10) {
    // adiciona o 9 se o número começar com 6, 7, 8 ou 9 (caso típico de celular)
    const ddd = digits.substring(0, 2);
    const corpo = digits.substring(2);
    const precisaNove = /^[6-9]/.test(corpo[0]);
    return '55' + ddd + (precisaNove ? '9' + corpo : corpo);
  }

  // Se tiver 9 dígitos, assume que faltou DDD e não trata
  if (digits.length === 9) {
    return null; // número incompleto
  }

  return null; // formato inválido
}

// --- Adição de dias premium (número fixo) ---
if (senderNumber === DESTINO_FIXO) {
  const addMatch = myText.match(/^add\s+(\d+)\s+(\S+)$/i);
  if (addMatch) {
    const diasAdicionar = parseInt(addMatch[1], 10);
    const telefoneAlvo = addMatch[2];
    const telefoneNormalizado = Number(normalizarTelefone(telefoneAlvo));

    if (!telefoneNormalizado) {
      await sendWhatsAppRaw({
        messaging_product: "whatsapp",
        to: DESTINO_FIXO,
        type: "text",
        text: { body: `⚠️ Número inválido: ${telefoneAlvo}` }
      });
      return true;
    }

    const { data: targetUser } = await supabase
      .from('users')
      .select('*')
      .eq('telefone', telefoneNormalizado)
      .maybeSingle();

    if (!targetUser) {
      await sendWhatsAppRaw({
        messaging_product: "whatsapp",
        to: DESTINO_FIXO,
        type: "text",
        text: { body: `⚠️ Usuário com telefone ${telefoneNormalizado} não encontrado.` }
      });
    } else {
      const agora = new Date();
      const premiumAtual = targetUser.premium ? new Date(targetUser.premium) : agora;
      const novoPremium = new Date(Math.max(premiumAtual, agora));
      novoPremium.setDate(novoPremium.getDate() + diasAdicionar);

      const { error: updateError } = await supabase
        .from('users')
        .update({ premium: novoPremium.toISOString() })
        .eq('telefone', telefoneNormalizado);

      if (updateError) {
        console.error("Erro ao atualizar premium:", updateError);
      } else {
        await sendWhatsAppRaw({
          messaging_product: "whatsapp",
          to: DESTINO_FIXO,
          type: "text",
          text: {
            body: `✅ Premium de ${targetUser.user_name} atualizado até ${novoPremium.toLocaleDateString('pt-BR')} ${novoPremium.toLocaleTimeString('pt-BR')}.`
          }
        });
      }
    }
    return true; // indica que o comando foi tratado
  }
}
  
  // --- Comandos para upload ---
  if (/^enviar logo$/i.test(myText) && userData) {
    await sendWhatsAppRaw({
      messaging_product: "whatsapp",
      to: senderNumber,
      type: "text",
      text: {
        body: "📸 Agora envie um arquivo ZIP com a imagem quadrada da LOGO em formato PNG.",
      },
    });

    await supabase.from("user_sessions").upsert({
      telefone: senderNumber,
      step: -1,
      answers: { type: "logo_img" },
    });
    return true;
  }

  if (/^enviar pix$/i.test(myText) && userData) {
    await sendWhatsAppRaw({
      messaging_product: "whatsapp",
      to: senderNumber,
      type: "text",
      text: {
        body: "💳 Agora envie a imagem quadrada do QR Code Pix em formato JPEG.",
      },
    });

    await supabase.from("user_sessions").upsert({
      telefone: senderNumber,
      step: -2,
      answers: { type: "pix_img" },
    });
    return true;
  }

if (/^enviar assinatura$/i.test(myText) && userData) {
    await sendWhatsAppRaw({
      messaging_product: "whatsapp",
      to: senderNumber,
      type: "text",
      text: {
        body: "🖋️ Agora envie a imagem da sua ASSINATURA em papel branco (formato PNG dentro de um arquivo.zip).",
      },
    });

    await supabase.from("user_sessions").upsert({
      telefone: senderNumber,
      step: -3,
      answers: { type: "assinatura_img" },
    });

    return true;
  }

// --- Comando de ajuda ---
if (/^op(c|ç)(ões|oes)$/i.test(myText)) {
  const helpMessage = `
📋 *Comandos disponíveis:*

👤 **Usuário**
- criar usuário — iniciar cadastro passo a passo
- editar usuário — atualizar seus dados cadastrados

💎 **Premium**
- premium — mostra o tempo restante do premium
- renovar — renovar tempo premium

🧾 **Orçamentos**
- criar orçamento — dicas para criar orçamentos
- listar orçamentos <telefone> ou <nome> ou <todos> — listar orçamentos existentes
- criar pdf do orçamento <ID> — gerar PDF com opções

📅 **Atendimentos**
- criar atendimento — dicas para agendar atendimentos
- listar agenda <dia que deseja pode ser hoje ou amanha> — listar seus atendimentos do dia

🖼️ **Personalização**
- enviar logo — enviar sua logo para PDF
- enviar pix — enviar seu Pix QR Code
- enviar assinatura — enviar sua assinatura
`.trim();

  await sendWhatsAppRaw({
    messaging_product: "whatsapp",
    to: senderNumber,
    type: "text",
    text: { body: helpMessage },
  });
  return true;
}

  // --- Comando: criar orçamento ---
  if (/^criar or[cç]amento/i.test(myText)) {
    const helpMessage = `
1️⃣ **Criar orçamento**
> criar orçamento para <nome> com número <telefone>

Serviços:
- <quantidade> <serviço> <valor>
  
Materiais:
- <quantidade> <material> <unidade> <valor>

Descontos:
- desconto serviço: 10%
- desconto material: R$5

Observações:
- texto 1
- texto 2

descrição de atividades:
- texto 1
- texto 2

2️⃣ **Editar orçamento**
editar orçamento <ID>
alterar ou adicionar serviços, materiais, descontos ou observações, descrição de atividades.

3️⃣ **Listar orçamentos**
listar orçamentos para <telefone> | <nome> | <ID>

4️⃣ **Gerar PDF do orçamento**
criar pdf do orçamento <ID> tipo "Orçamento" | "Ordem de Serviço" | "Relatório Técnico" | "Nota de Serviço" | "Pedido de Materiais" | "Proposta Comercial"
Opções:
ocultar valor dos serviços
ocultar materiais
remover garantia
mostrar assinatura do cliente
mostrar assinatura da empresa

5️⃣ **Deletar orçamento**
deletar orçamento <ID>
`;
    await sendWhatsAppRaw({
      messaging_product: "whatsapp",
      to: senderNumber,
      type: "text",
      text: { body: helpMessage },
    });
    return true;
  }

  // --- Comando: criar atendimento ---
  if (/^criar atendiment[oó]/i.test(myText)) {
    const helpMessage = `
📋 **Criar agenda/atendimento**

1️⃣ **Criar agenda/atendimento**
criar atendimento para <nome> em <data> às <hora>

2️⃣ **Editar agenda**
editar agenda <ID>

3️⃣ **Deletar agenda**
deletar agenda <ID>

4️⃣ **Listar agenda**
lista meus atendimentos do dia <data>
`;
    await sendWhatsAppRaw({
      messaging_product: "whatsapp",
      to: senderNumber,
      type: "text",
      text: { body: helpMessage },
    });
    return true;
  }

  // --- Comando: premium ---
  if (/^premium$/i.test(myText) && userData) {
    const nowDate = new Date();
    const premiumDate = userData.premium ? new Date(userData.premium) : null;

    if (!premiumDate || premiumDate <= nowDate) {
      await sendWhatsAppRaw({
        messaging_product: "whatsapp",
        to: senderNumber,
        type: "text",
        text: { body: "⚠️ Seu premium expirou.\nDigite *Renovar*." },
      });
    } else {
      const diffMs = premiumDate - nowDate;
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

      await sendWhatsAppRaw({
        messaging_product: "whatsapp",
        to: senderNumber,
        type: "text",
        text: {
          body: `⏳ Seu premium está ativo até ${premiumDate.toLocaleDateString(
            "pt-BR"
          )} ${premiumDate.toLocaleTimeString("pt-BR")}.\nTempo restante: ${diffDays} dias, ${diffHours} horas e ${diffMinutes} minutos.`,
        },
      });
    }
    return true;
  }

  if (/^editar usu[aá]rio$/i.test(myText) && userData) {
    await startUserEdit(senderNumber, userData);
  return true;
  }

  // --- Comando: renovar ---
  if (/^renovar$/i.test(myText) && userData) {
    await sendWhatsAppRaw({
      messaging_product: "whatsapp",
      to: senderNumber,
      type: "text",
      text: {
        body:
          "⚙️ O comando de renovação automática ainda não foi integrado.\n\n💳 Envie um PIX de R$15,00 para *64992869608*\nE envie o comprovante para o número (064) 99286-9608.",
      },
    });
    return true;
  }

  // --- Comando "renovar" ---
  // if (/^renovar$/i.test(myText) && userData) {
  //   const checkoutUrl = await createCheckoutPreference(0.10, `Renovação Premium - ${senderNumber}`);

  //   if (!checkoutUrl) {
  //     await sendWhatsAppRaw({
  //       messaging_product: "whatsapp",
  //       to: senderNumber,
  //       type: "text",
  //       text: {
  //         body: "⚠️ Não foi possível gerar o link de pagamento no momento. Tente novamente em instantes."
  //       }
  //     });
  //     continue;
  //   }

  //   await sendWhatsAppRaw({
  //     messaging_product: "whatsapp",
  //     to: senderNumber,
  //     type: "text",
  //     text: {
  //       body: `
  //       💎 *Renovação Premium (R$15,00)*
  //       Clique no link abaixo para efetuar o pagamento de forma segura pelo *Mercado Pago* 👇
  //       🔗 ${checkoutUrl}
  //       Após o pagamento, o sistema confirmará automaticamente. ✅
  //        `
  //     }
  //   });
  // }

  // Nenhum comando correspondente
  return false;
};

module.exports = { handleCommands, handleUserRegistrationCommand };
