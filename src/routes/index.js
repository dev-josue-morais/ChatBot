const express = require('express');
const router = express.Router();

const renewTokenRoute = require('./renewTokenRoute');
const webhookRoute = require('./webhookRoute');
const alertaRoute = require('./alertaRoute');

router.use('/renew-token', renewTokenRoute);
router.use('/webhook', webhookRoute);
router.use('/cron/alerta', alertaRoute);

module.exports = router;
