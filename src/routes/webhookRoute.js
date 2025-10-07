const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const { getNowBRT } = require('../utils/utils');
const { processCommand } = require('../services/processCommand');
const { sendWhatsAppRaw, extractTextFromMsg, forwardMediaIfAny } = require('../services/whatsappService');
const supabase = require('../services/supabase');
const { WEBHOOK_VERIFY_TOKEN, DESTINO_FIXO, WHATSAPP_TOKEN } = require('../utils/config');
const AdmZip = require("adm-zip");
const sharp = require("sharp");
const createCheckoutPreference = require('../utils/mercadopago');

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

async function processLogoZip(senderNumber, mediaId) {
  try {
    // 1️⃣ Pega a URL da mídia do WhatsApp
    const mediaInfoResp = await fetch(`https://graph.facebook.com/v16.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` }
    });
    const mediaInfo = await mediaInfoResp.json();
    const mediaUrl = mediaInfo.url;
    if (!mediaUrl) throw new Error("Não consegui obter a URL do ZIP.");

    // 2️⃣ Baixa o conteúdo do ZIP
    const mediaResp = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` }
    });
    const buffer = Buffer.from(await mediaResp.arrayBuffer());

    // 3️⃣ Lê o ZIP
    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries();

    if (!zipEntries.length) throw new Error("ZIP vazio.");

    // 4️⃣ Procura pelo arquivo PNG (logo)
    const logoEntry = zipEntries.find(e => e.entryName.toLowerCase().endsWith(".png"));
    if (!logoEntry) throw new Error("Nenhum PNG encontrado no ZIP.");

    const logoBuffer = logoEntry.getData(); // Buffer do PNG

    // 🔹 Redimensiona a logo para 350x350
    const resizedLogo = await sharp(logoBuffer)
      .resize(350, 350, { fit: 'cover' })
      .png()
      .toBuffer();

    // 5️⃣ Salva no Supabase
    const fileName = `${senderNumber}_logo_${Date.now()}.png`;
    const { error: uploadError } = await supabase.storage
      .from("user_files")
      .upload(fileName, resizedLogo, {
        contentType: "image/png",
        upsert: true
      });

    if (uploadError) throw uploadError;

    // 6️⃣ Gera URL pública
    const { data: urlData } = supabase.storage.from("user_files").getPublicUrl(fileName);
    const publicUrl = urlData.publicUrl;

    // 7️⃣ Atualiza usuário
    await supabase.from("users").update({ logo_url: publicUrl }).eq("telefone", senderNumber);

    // 8️⃣ Confirma envio
    await sendWhatsAppRaw({
      messaging_product: "whatsapp",
      to: senderNumber,
      type: "text",
      text: { body: `✅ Logo atualizada com sucesso!` }
    });

  } catch (err) {
    console.error("Erro ao processar ZIP da logo:", err);
    await sendWhatsAppRaw({
      messaging_product: "whatsapp",
      to: senderNumber,
      type: "text",
      text: { body: "⚠️ Ocorreu um erro ao processar seu arquivo ZIP. Tente novamente." }
    });
  }
}

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

const processedIds = new Set();

    for (let msg of messages) {
      const contact = value.contacts?.[0];
      if (!contact) continue;
 if (processedIds.has(msg.id)) continue;
  processedIds.add(msg.id);
const senderName = contact.profile?.name || 'Usuário';
      const senderNumber = contact.wa_id;
      if (!senderNumber) continue;

const botNumber = value?.metadata?.phone_number_id?.replace(/\D/g, ''); // número do bot

// Ignora mensagens enviadas pelo próprio bot
if (senderNumber === botNumber) continue;

// Ignora mensagens muito antigas (mais de 60s)
const msgTimestamp = Number(msg.timestamp) * 1000;
if (Date.now() - msgTimestamp > 120000) continue;

      const myText = extractTextFromMsg(msg)?.trim();
      await supabase.rpc('cleanup_old_sessions');

      // --- Se for mensagem de imagem (upload de logo/pix)
      const { data: session } = await supabase
        .from('user_sessions')
        .select('*')
        .eq('telefone', senderNumber)
        .maybeSingle();
      // --- Upload de logo via ZIP ---
      if (msg.type === "document" && session?.answers?.type === "logo_img" && msg.document.mime_type === "application/zip") {
        try {
          const mediaId = msg.document.id;
          if (!mediaId) throw new Error("ID do documento não encontrado.");

          // Chama a função que processa o ZIP e envia a confirmação
          await processLogoZip(senderNumber, mediaId);

          // Limpa sessão
          await supabase.from("user_sessions").delete().eq("telefone", senderNumber);

        } catch (err) {
          console.error("Erro ao processar ZIP:", err);
          await sendWhatsAppRaw({
            messaging_product: "whatsapp",
            to: senderNumber,
            type: "text",
            text: { body: "⚠️ Falha ao processar o ZIP. Tente novamente." }
          });
        }
        continue;
      }

      // --- Upload de imagem do Pix ---
      if (msg.type === "image" && session?.answers?.type === "pix_img") {
        try {
          const mediaId = msg.image?.id;
          if (!mediaId) {
            await sendWhatsAppRaw({
              messaging_product: "whatsapp",
              to: senderNumber,
              type: "text",
              text: { body: "⚠️ Não consegui obter a imagem. Tente novamente." }
            });
            continue;
          }

          // 1️⃣ Pega a URL da mídia do WhatsApp
          const mediaInfoResp = await fetch(`https://graph.facebook.com/v16.0/${mediaId}`, {
            headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
          });
          const mediaInfo = await mediaInfoResp.json();
          const mediaUrl = mediaInfo.url;

          if (!mediaUrl) {
            await sendWhatsAppRaw({
              messaging_product: "whatsapp",
              to: senderNumber,
              type: "text",
              text: { body: "⚠️ Não consegui obter a URL da imagem. Tente novamente." }
            });
            continue;
          }

          // 2️⃣ Baixa o conteúdo da imagem
          const mediaResp = await fetch(mediaUrl, {
            headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
          });
          const arrayBuffer = await mediaResp.arrayBuffer();
          const originalBuffer = Buffer.from(arrayBuffer);

          // 🔹 Redimensiona a imagem para 350x350 quadrados
          const resizedBuffer = await sharp(originalBuffer)
            .resize(350, 350, { fit: 'cover' })
            .jpeg({ quality: 90 }) // ajusta a qualidade se quiser
            .toBuffer();

          // 3️⃣ Envia para o Supabase Storage
          const fileName = `${senderNumber}_pix_img_${Date.now()}.jpeg`;
          const { error: uploadError } = await supabase.storage
            .from("user_files")
            .upload(fileName, resizedBuffer, {
              contentType: "image/jpeg",
              upsert: true,
            });

          if (uploadError) throw uploadError;

          // 4️⃣ Gera URL pública corretamente
          const { data: urlData, error: urlError } = await supabase.storage
            .from("user_files")
            .getPublicUrl(fileName);

          if (urlError || !urlData?.publicUrl) {
            console.error("Erro ao gerar URL pública:", urlError);
            continue;
          }

          const publicUrl = urlData.publicUrl;

          // 5️⃣ Atualiza campo pix_img_url no usuário
          await supabase.from("users").update({ pix_img_url: publicUrl }).eq("telefone", senderNumber);

          // 6️⃣ Limpa sessão
          await supabase.from("user_sessions").delete().eq("telefone", senderNumber);

          // 7️⃣ Confirma envio
          await sendWhatsAppRaw({
            messaging_product: "whatsapp",
            to: senderNumber,
            type: "text",
            text: { body: "✅ Imagem do Pix atualizada com sucesso!" },
          });

        } catch (err) {
          console.error("Erro ao processar imagem do Pix:", err);
          await sendWhatsAppRaw({
            messaging_product: "whatsapp",
            to: senderNumber,
            type: "text",
            text: { body: "⚠️ Ocorreu um erro ao processar a imagem do Pix. Tente novamente." }
          });
        }
        continue;
      }
      // --- Cancelar cadastro ---
      if (session && /^cancelar$/i.test(myText)) {
        await supabase.from('user_sessions').delete().eq('telefone', senderNumber);
        await sendWhatsAppRaw({
          messaging_product: "whatsapp",
          to: senderNumber,
          type: "text",
          text: { body: "❌ Cadastro cancelado.\npara recomeçar digite Criar usuário" }
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
              text: { body: "✅ Usuário criado com sucesso!\nPremium válido por 10 dias.\nDigite ⚙️ para ver as opções disponíveis." }
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
          text: { body: "📸 Agora Envie um arquivo zip com a imagem quadrada da LOGO em formato PNG." }
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
          text: { body: "💳 Agora Envie a imagem quadrada do QR Code Pix em formato JPEG." }
        });
        await supabase.from('user_sessions').upsert({
          telefone: senderNumber,
          step: -2,
          answers: { type: "pix_img" }
        });
        continue;
      }

      // --- Comando de ajuda: "opcoes" ou "opções" ---
      if (/^op(c|ç)(ões|oes)$/i.test(myText)) {
        const helpMessage = `
📋 Digite um dos comandos disponíveis:

- premium - mostra seu tempo premium 💎
- renovar - renovar tempo premium 💎
- criar orçamento - dicas de padrões para criar um orçamento 🧾
- criar atendimento - dicas de padrões para criar um atendimento 📅
- enviar logo - enviar sua logo 🖼️ para integrar no PDF
- enviar pix - enviar seu Pix QrCode 💳 para integrar no PDF
`.trim();
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

4️⃣ **listar agenda**
Lista meus atendimentos do dia <data>
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

        let myText;
        if (msg.type === "interactive" && msg.interactive.button_reply) {
          myText = msg.interactive.button_reply.title.toLowerCase();
        } else {
          myText = extractTextFromMsg(msg)?.trim();
        }
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
          text: { body: "⚠️ Seu premium expirou.\ndigite Renovar." }
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

            text: { body: "⚠️ Seu premium expirou.\ndigite Renovar." }
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
        await sendWhatsAppRaw({
          messaging_product: "whatsapp",
          to: senderNumber,
          type: "text",
          text: { body: "Comando de renovação automática nao foi integrado ainda\nPor favor envie um pix de R$15,00 para 64992869608\nE o comprovante para o numero (064) 99286-9608" }
        });
        continue;
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

// Ignora mensagens sem conteúdo relevante ou com menos de 2 palavras
if (
  (!myText && !msg.type?.match(/text|interactive|image|document|audio|video|sticker/)) ||
  (myText && myText.split(/\s+/).length < 3)
) {
  continue;
}

      // --- Processa comandos normais ---
      const responseText = await processCommand(myText, senderNumber);
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
