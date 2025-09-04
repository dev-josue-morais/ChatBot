require('dotenv').config();
const OpenAI = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function askGPT(prompt) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    });
    return response.choices[0].message.content;
  } catch (err) {
    console.error("Erro ao chamar GPT:", err.response?.data || err.message);
    return null;
  }
}

// teste inicial
(async () => {
  const result = await askGPT("Olá GPT, está funcionando?");
  console.log("Resposta do GPT:", result);
})();
