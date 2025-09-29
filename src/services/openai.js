const OpenAI = require("openai");
const { OPENAI_API_KEY } = require('../utils/config');

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

module.exports = openai;
