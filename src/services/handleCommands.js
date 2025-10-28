const supabase = require("./supabase");
const { sendWhatsAppRaw } = require("./whatsappService");
const { startUserRegistration } = require("./userRegistration");
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

  // --- Adição de dias premium (número fixo) ---
  if (senderNumber === DESTINO_FIXO) {
    const addMatch = myText.match(/^add (\d+)\s+(\d+)$/i);
    if (addMatch) {
      const diasAdicionar = parseInt(addMatch[1], 10);
      const telefoneAlvo = addMatch[2];

      const { data: targetUser } = await supabase
        .from('users')
        .select('*')
        .eq('telefone', telefoneAlvo)
        .maybeSingle();

      if (!targetUser) {
        await sendWhatsAppRaw({
          messaging_product: "whatsapp",
          to: DESTINO_FIXO,
          type: "text",
          text: { body: `⚠️ Usuário com telefone ${telefoneAlvo} não encontrado.` }
        });
      } else {
        const agora = new Date();
        const premiumAtual = targetUser.premium ? new Date(targetUser.premium) : agora;
        const novoPremium = new Date(Math.max(premiumAtual, agora));
        novoPremium.setDate(novoPremium.getDate() + diasAdicionar);

        const { error: updateError } = await supabase
          .from('users')
          .update({ premium: novoPremium.toISOString() })
          .eq('telefone', telefoneAlvo);

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
📋 Digite um dos comandos disponíveis:

- premium - mostra seu tempo premium 💎
- renovar - renovar tempo premium 💎
- criar orçamento - dicas de padrões para criar um orçamento 🧾
- criar atendimento - dicas de padrões para criar um atendimento 📅
- enviar logo - enviar sua logo 🖼️ para integrar no PDF
- enviar pix - enviar seu Pix QrCode 💳 para integrar no PDF
- enviar assinatura - enviar sua assinatura 🖋️ para integrar no PDF
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
criar orçamento para <nome> com número <telefone>
Serviços:
quantidade serviço valor
Materiais:
quantidade material unidade valor
Descontos:
desconto serviço: 4%
desconto material: R$5
Observações:
observação 1
observação 2

2️⃣ **Editar orçamento**
editar orçamento <ID>
alterar ou adicionar serviços, materiais, descontos ou observações

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
