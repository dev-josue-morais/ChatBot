const express = require('express');
const router = express.Router();
const fetch = require('node-fetch'); // necessário para baixar a imagem do WhatsApp
const { getNowBRT } = require('../utils/utils');
const { processCommand } = require('../services/processCommand');
const { sendWhatsAppRaw, extractTextFromMsg, forwardMediaIfAny } = require('../services/whatsappService');
const supabase = require('../services/supabase');
const { WEBHOOK_VERIFY_TOKEN, DESTINO_FIXO } = require('../utils/config');

const questions = [
  { key: "user_name", text: "📛 Qual é o seu nome completo?" },
  { key: "empresa_nome", text: "🏢 Qual é o nome da sua empresa?" },
  { key: "empresa_telefone", text: "📞 Qual é o telefone de contato da empresa?" },
  { key: "tipo_doc", text: "🧾 O documento é CPF ou CNPJ?" },
  { key: "numero_doc", text: "🔢 Informe o número do documento (ex: 000.000.000-00 ou 00.000.000/0000-00)" },
  { key: "cidade", text: "🏙️ Qual é a cidade da empresa?" },
  { key: "estado", text: "🌎 Qual é o estado (UF) da empresa?" },
  { key: "cep", text: "📫 Qual é o CEP da empresa?" },
  { key: "pix_chave", text: "💳 Qual é a sua chave Pix (celular, CNPJ, CPF ou e-mail)?" },
  { key: "pix_nome", text: "👤 Qual é o nome que consta na chave Pix?" },
  { key: "pix_banco", text: "🏦 Qual é o banco ou instituição da chave Pix?" }
];

// ✅ GET webhook (verificação do Meta)
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode && token === WEBHOOK_VERIFY_TOKEN) return res.status(200).send(challenge);
  res.sendStatus(403);
});

// ✅ POST webhook (mensagens)
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
      await supabase.rpc('cleanup_old_sessions');

      // --- Se for mensagem de imagem (upload de logo/pix)
      const { data: session } = await supabase
        .from('user_sessions')
        .select('*')
        .eq('telefone', senderNumber)
        .maybeSingle();

      if (session && msg.type === "image" && session.answers?.type) {
        const imageType = session.answers.type; // "logo_img" ou "pix_img"
        const fileUrl = msg.image?.link;

        if (!fileUrl) {
          await sendWhatsAppRaw({
            messaging_product: "whatsapp",
            to: senderNumber,
            type: "text",
            text: { body: "⚠️ Não consegui obter a imagem. Tente novamente." }
          });
          continue;
        }

        const response = await fetch(fileUrl);
        const buffer = await response.arrayBuffer();
        const fileExt = imageType === "logo_img" ? "png" : "jpeg";
        const fileName = `${senderNumber}_${imageType}_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('user_files')
          .upload(fileName, buffer, {
            contentType: `image/${fileExt}`,
            upsert: true
          });

        if (uploadError) {
          console.error("Erro upload:", uploadError);
          await sendWhatsAppRaw({
            messaging_product: "whatsapp",
            to: senderNumber,
            type: "text",
            text: { body: "⚠️ Falha ao salvar imagem. Tente novamente mais tarde." }
          });
          continue;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('user_files')
          .getPublicUrl(fileName);

        const field = imageType === "logo_img" ? "logo_url" : "pix_img_url";
        await supabase.from('users').update({ [field]: publicUrl }).eq('telefone', senderNumber);
        await supabase.from('user_sessions').delete().eq('telefone', senderNumber);

        await sendWhatsAppRaw({
          messaging_product: "whatsapp",
          to: senderNumber,
          type: "text",
          text: {
            body: `✅ Imagem ${imageType === "logo_img" ? "da LOGO" : "do Pix"} atualizada com sucesso!`
          }
        });
        continue;
      }

      // --- Cancelar cadastro ---
      if (session && /^cancelar$/i.test(myText)) {
        await supabase.from('user_sessions').delete().eq('telefone', senderNumber);
        await sendWhatsAppRaw({
          messaging_product: "whatsapp",
          to: senderNumber,
          type: "text",
          text: { body: "❌ Cadastro cancelado. Envie 'criar usuário' para começar novamente." }
        });
        continue;
      }

      // --- Adição de dias premium (número fixo) ---
      if (senderNumber === DESTINO_FIXO) {
        const addMatch = myText.match(/^add (\d+)\s+(\d+)$/i);
        if (addMatch) {
          const diasAdicionar = parseInt(addMatch[1], 10);
          const telefoneAlvo = addMatch[2];
          const { data: targetUser } = await supabase.from('users').select('*').eq('telefone', telefoneAlvo).maybeSingle();

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
          continue;
        }
      }

      // --- Verifica se o usuário existe ---
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('telefone', senderNumber)
        .maybeSingle();

      const now = getNowBRT();

      // --- Início do cadastro ---
      const criarUsuarioMatch = myText.match(/^criar usu[aá]rio(?: (.+))?$/i);
      if (criarUsuarioMatch) {
        if (userData) {
          await sendWhatsAppRaw({
            messaging_product: "whatsapp",
            to: senderNumber,
            type: "text",
            text: { body: `✅ Você já está cadastrado, ${userData.user_name}.` }
          });
          continue;
        }

        await supabase.from('user_sessions').upsert({
          telefone: senderNumber,
          step: 1,
          answers: {}
        });

        const saudacao =
          now.hour >= 5 && now.hour < 12
            ? "Bom dia"
            : now.hour < 18
              ? "Boa tarde"
              : "Boa noite";

        await sendWhatsAppRaw({
          messaging_product: "whatsapp",
          to: senderNumber,
          type: "text",
          text: {
            body: `${saudacao}! Para criar seu usuário, responda às perguntas abaixo.\n\n${questions[0].text}`
          }
        });
        continue;
      }

      // --- Cadastro passo a passo ---
      if (session && session.step > 0) {
        const currentStep = session.step;
        const currentAnswers = session.answers || {};
        const lastKey = questions[currentStep - 1]?.key;
        if (lastKey) currentAnswers[lastKey] = myText;

        const nextStep = currentStep + 1;
        if (nextStep > questions.length) {
          await supabase.from('user_sessions').delete().eq('telefone', senderNumber);
          const userJson = {
            ...currentAnswers,
            telefone: senderNumber,
            premium: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString()
          };

          const { error: insertError } = await supabase.from('users').insert([userJson]);
          if (insertError) {
            console.error("Erro ao criar usuário:", insertError);
            await sendWhatsAppRaw({
              messaging_product: "whatsapp",
              to: senderNumber,
              type: "text",
              text: { body: "⚠️ Ocorreu um erro ao criar seu usuário. Tente novamente." }
            });
          } else {
            await sendWhatsAppRaw({
              messaging_product: "whatsapp",
              to: senderNumber,
              type: "text",
              text: { body: "✅ Usuário criado com sucesso! Premium válido por 10 dias. digite Opções para informaçoes" }
            });
          }
        } else {
          await supabase
            .from('user_sessions')
            .update({ step: nextStep, answers: currentAnswers })
            .eq('telefone', senderNumber);

          await sendWhatsAppRaw({
            messaging_product: "whatsapp",
            to: senderNumber,
            type: "text",
            text: { body: questions[nextStep - 1].text }
          });
        }
        continue;
      }

      // --- Comandos para upload ---
      if (/^enviar logo$/i.test(myText) && userData) {
        await sendWhatsAppRaw({
          messaging_product: "whatsapp",
          to: senderNumber,
          type: "text",
          text: { body: "📸 Envie agora a imagem da LOGO em formato PNG." }
        });
        await supabase.from('user_sessions').upsert({
          telefone: senderNumber,
          step: -1,
          answers: { type: "logo_img" }
        });
        continue;
      }

      if (/^enviar pix$/i.test(myText) && userData) {
        await sendWhatsAppRaw({
          messaging_product: "whatsapp",
          to: senderNumber,
          type: "text",
          text: { body: "💳 Envie agora a imagem do QR Code Pix em formato JPEG." }
        });
        await supabase.from('user_sessions').upsert({
          telefone: senderNumber,
          step: -2,
          answers: { type: "pix_img" }
        });
        continue;
      }

      // --- Comando de ajuda: "opcoes" ou "opções" ---
      if (/^op(c|ç)oes?$/i.test(myText)) {
        const helpMessage = `
        📋 **Digite um dos comandos disponíveis:**

        - "premium" → mostra seu tempo premium
        - "criar orçamento" → dicas de padrões para criar orçamentos
        - "criar atendimento" → dicas de padrões para criar agenda
        - "enviar logo" → envia sua logo em png para integrar no PDF
        - "enviar pix" → envia uma imagem do seu QR code para integrar no PDF
        `;
        await sendWhatsAppRaw({
          messaging_product: "whatsapp",
          to: senderNumber,
          type: "text",
          text: { body: helpMessage }
        });

        continue;
      }

      // --- Comandos principais ---
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
          text: { body: helpMessage }
        });
        continue;
      }

      if (/^criar atendiment[oó]/i.test(myText)) {
        const helpMessage = `
        📋 **Criar agenda/atendimento**

        1️⃣ **Criar agenda/atendimento**
        criar atendimento para <nome> em <data> às <hora>

        2️⃣ **Editar agenda**
        editar agenda <ID>

        3️⃣ **Deletar agenda**
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

      // --- Usuário sem cadastro ---
      if (!userData) {
        const formattedNumber = senderNumber; // ou formate se quiser
        const saudacao =
          now.hour >= 5 && now.hour < 12
            ? "Bom dia"
            : now.hour < 18
              ? "Boa tarde"
              : "Boa noite";

        // 🔹 Redireciona mensagens de texto
        const text = extractTextFromMsg(msg);
        if (text) {
          const forwardText = `📥 Mensagem de ${senderName} ${formattedNumber}:\n\n${text}`;
          await sendWhatsAppRaw({
            messaging_product: "whatsapp",
            to: DESTINO_FIXO,
            type: "text",
            text: { body: forwardText },
          });
        }

        // 🔹 Redireciona mídia (imagens, docs, áudio)
        await forwardMediaIfAny(msg, value, DESTINO_FIXO);

        // 🔹 Evita enviar aviso repetido para o mesmo usuário
        const { data: alreadySent } = await supabase
          .from('redirects')
          .select('*')
          .eq('phone', senderNumber)
          .maybeSingle();

        if (!alreadySent) {
          await supabase
            .from('redirects')
            .delete()
            .lt('sent_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

          // envia aviso de novo número
          await sendWhatsAppRaw({
            messaging_product: "whatsapp",
            to: senderNumber,
            type: "text",
            text: {
              body: `${saudacao}! Você está tentando falar com Josué Eletricista.\nFavor entrar em contato no novo número (064) 99286-9608.`,
            },
          });

          // registra que o aviso foi enviado
          await supabase.from('redirects').insert([{ phone: senderNumber }]);
        }

        continue;
      }

      // --- Verifica premium ---
      const premiumValido = userData.premium && new Date(userData.premium) > now;
      if (!premiumValido) {
        await sendWhatsAppRaw({
          messaging_product: "whatsapp",
          to: senderNumber,
          type: "text",
          text: { body: "⚠️ Seu premium expirou. Entre em contato para renovar." }
        });
        continue;
      }

      // --- Comando "premium" ---
      if (/^premium$/i.test(myText) && userData) {
        const now = new Date();
        const premiumDate = userData.premium ? new Date(userData.premium) : null;

        if (!premiumDate || premiumDate <= now) {
          await sendWhatsAppRaw({
            messaging_product: "whatsapp",
            to: senderNumber,
            type: "text",
            text: { body: "⚠️ Você não possui premium ativo. Digite renovar." }
          });
        } else {
          const diffMs = premiumDate - now;
          const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

          await sendWhatsAppRaw({
            messaging_product: "whatsapp",
            to: senderNumber,
            type: "text",
            text: {
              body: `⏳ Seu premium está ativo até ${premiumDate.toLocaleDateString('pt-BR')} ${premiumDate.toLocaleTimeString('pt-BR')}.\n` +
                `Tempo restante: ${diffDays} dias, ${diffHours} horas e ${diffMinutes} minutos.`
            }
          });
        }
        continue;
      }
      // --- Comando "renovar" ---
      if (/^renovar$/i.test(myText) && userData) {
        // Aqui você pode futuramente implementar a lógica de adicionar dias de premium
        await sendWhatsAppRaw({
          messaging_product: "whatsapp",
          to: senderNumber,
          type: "text",
          text: { body: "✅ Premium renovado!" }
        });
        continue;
      }
      // --- Processa comandos normais ---
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
