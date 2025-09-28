if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}
const express = require('express');
const { scheduleDailySummary } = require('./services/cronService');

const app = express();
app.use(express.json());

const routes = require('./src/routes');

app.use(routes);

// Middleware global de erro
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err.stack || err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// --- CRON JOB RESUMO DIÁRIO 7h ---
scheduleDailySummary();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));