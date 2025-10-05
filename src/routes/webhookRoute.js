const express = require('express');
const router = express.Router();
const { getNowBRT } = require('../utils/utils');
const { processCommand } = require('../services/processCommand');
const { sendWhatsAppRaw, extractTextFromMsg, forwardMediaIfAny } = require('../services/whatsappService');
const supabase = require('../services/supabase');
const { WEBHOOK_VERIFY_TOKEN, DESTINO_FIXO } = require('../utils/config');

// GET webhook (verificação do Facebook)
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token === WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// POST webhook (mensagens)
router.post('/', async (req, res, next) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const messages = value?.messages;
    if (!messages) return res.sendStatus(200);

    for (let msg of messages) {
      const contact = value.contacts?.[0];
      if (!contact) continue;

      const senderName = contact.profile?.name || 'Usuário';
      const senderNumber = contact.wa_id;
      if (!senderNumber) continue;

      const myText = extractTextFromMsg(msg)?.trim();
      if (!myText) continue;

      // --- Adicionar dias de premium via mensagem do número fixo ---
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
              await sendWhatsAppRaw({
                messaging_product: "whatsapp",
                to: DESTINO_FIXO,
                type: "text",
                text: { body: "⚠️ Erro ao atualizar premium. Tente novamente." }
              });
            } else {
              await sendWhatsAppRaw({
                messaging_product: "whatsapp",
                to: DESTINO_FIXO,
                type: "text",
                text: { body: `✅ Premium do usuário ${targetUser.user_name} atualizado. Agora válido até ${novoPremium.toLocaleDateString('pt-BR')} ${novoPremium.toLocaleTimeString('pt-BR')}.` }
              });
            }
          }
          continue; // evita processar como comando normal
        }
      }
      // --- Verifica se o usuário está cadastrado ---
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('telefone', senderNumber)
        .maybeSingle();

      const now = getNowBRT();

      // --- Cadastro de usuário via mensagem "criar usuario <nome>" ---
      const criarUsuarioMatch = myText.match(/^criar usuario (.+)$/i);
      if (criarUsuarioMatch) {
        const userName = criarUsuarioMatch[1].trim();

        if (userData) {
          await sendWhatsAppRaw({
            messaging_product: "whatsapp",
            to: senderNumber,
            type: "text",
            text: { body: `Olá ${userName}! Você já está cadastrado no sistema.` }
          });
          continue;
        }

        const premiumUntil = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

        const { error: insertError } = await supabase.from('users').insert([{
          user_name: userName,
          telefone: senderNumber,
          premium: premiumUntil
        }]);

        if (insertError) {
          console.error("Erro ao criar usuário:", insertError);
          await sendWhatsAppRaw({
            messaging_product: "whatsapp",
            to: senderNumber,
            type: "text",
            text: { body: "⚠️ Ocorreu um erro ao tentar criar sua conta. Tente novamente mais tarde." }
          });
        } else {
          await sendWhatsAppRaw({
            messaging_product: "whatsapp",
            to: senderNumber,
            type: "text",
            text: { body: `✅ Usuário "${userName}" criado com sucesso! Premium válido por 10 dias.` }
          });
        }
        continue;
      }

      // --- Usuário não cadastrado ---
      if (!userData) {
        const hour = now.hour;
        let saudacao = "Olá";
        if (hour >= 5 && hour < 12) saudacao = "Bom dia";
        else if (hour >= 12 && hour < 18) saudacao = "Boa tarde";
        else saudacao = "Boa noite";

        await sendWhatsAppRaw({
          messaging_product: "whatsapp",
          to: senderNumber,
          type: "text",
          text: { body: `${saudacao}! Você está tentando falar com Josué Eletricista.\nFavor entrar em contato no novo número (064) 99286-9608.` }
        });
        continue;
      }

      // --- Usuário cadastrado, verifica premium ---
      const premiumValido = userData.premium && new Date(userData.premium) > now;
      if (!premiumValido) {
        await sendWhatsAppRaw({
          messaging_product: "whatsapp",
          to: senderNumber,
          type: "text",
          text: { body: `${saudacao}!\n⚠️ Seu premium expirou. Entre em contato para renovar o acesso.` }
        });
        continue;
      }

      // --- Comando de ajuda: "opcoes" ou "opções" ---
      if (/^op(c|ç)oes?$/i.test(myText)) {
        const helpMessage = `
📋 **Guia rápido de comandos do bot**

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
Opções se nescesario:
ocultar valor dos serviços
ocultar materiais
remover garantia
mostrar assinatura do cliente
mostrar assinatura da empresa

5️⃣ **Deletar orçamento**
deletar orçamento <ID>

6️⃣ **Criar agenda/atendimento**
criar atendimento para <nome> em <data> às <hora>

7️⃣ **Editar agenda**
editar agenda <ID>

8️⃣ **Deletar agenda**
deletar agenda <ID>
        `;

        await sendWhatsAppRaw({
          messaging_product: "whatsapp",
          to: senderNumber,
          type: "text",
          text: { body: helpMessage }
        });
        continue;
      }

      // --- Processa comando normal ---
      const responseText = await processCommand(myText);
      await sendWhatsAppRaw({
        messaging_product: "whatsapp",
        to: senderNumber,
        type: "text",
        text: { body: responseText }
      });
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Erro no webhook:", err);
    next(err);
  }
});

module.exports = router;
