// src/routes/index.js
const express = require('express');
const router = express.Router();

const renewTokenRoute = require('./renewTokenRoute');
const webhookRoute = require('./webhookRoute');
const alertaRoute = require('./alertaRoute');
const keepAliveRoute = require('./keepAliveRoute');

router.use('/renew-token', renewTokenRoute);
router.use('/webhook', webhookRoute);
router.use('/cron/alerta', alertaRoute);
router.use('/keep-alive', keepAliveRoute);

module.exports = router;
