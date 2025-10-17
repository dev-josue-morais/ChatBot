// services/userRegistration.js
const { sendWhatsAppRaw } = require("./whatsappService");
const supabase = require("./supabase");
const { getNowBRT } = require("../utils/utils");

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

/**
 * Inicia o cadastro de um novo usuário
 */
async function startUserRegistration(senderNumber) {
  const now = getNowBRT();

  const saudacao =
    now.hour >= 5 && now.hour < 12
      ? "Bom dia"
      : now.hour < 18
      ? "Boa tarde"
      : "Boa noite";

  await supabase.from("user_sessions").upsert({
    telefone: senderNumber,
    step: 1,
    answers: {}
  });

  await sendWhatsAppRaw({
    messaging_product: "whatsapp",
    to: senderNumber,
    type: "text",
    text: {
      body: `${saudacao}! Para criar seu usuário, responda às perguntas abaixo.\n\n${questions[0].text}`
    }
  });
}

/**
 * Continua o fluxo de cadastro passo a passo
 */
async function continueUserRegistration(session, senderNumber, myText) {
  const currentStep = session.step;
  const currentAnswers = session.answers || {};
  const lastKey = questions[currentStep - 1]?.key;
  if (lastKey) currentAnswers[lastKey] = myText;

  const nextStep = currentStep + 1;

  if (nextStep > questions.length) {
    // ✅ Cadastro completo
    await supabase.from("user_sessions").delete().eq("telefone", senderNumber);
    const userJson = {
      ...currentAnswers,
      telefone: senderNumber,
      premium: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString()
    };

    const { error: insertError } = await supabase.from("users").insert([userJson]);
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
    // ➡️ Próxima pergunta
    await supabase
      .from("user_sessions")
      .update({ step: nextStep, answers: currentAnswers })
      .eq("telefone", senderNumber);

    await sendWhatsAppRaw({
      messaging_product: "whatsapp",
      to: senderNumber,
      type: "text",
      text: { body: questions[nextStep - 1].text }
    });
  }
}

module.exports = {
  questions,
  startUserRegistration,
  continueUserRegistration
};
