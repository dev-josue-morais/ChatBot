const express = require('express');
const router = express.Router();

const renewTokenRoute = require('./renewTokenRoute');
const webhookRoute = require('./webhookRoute');
const keepAlive = require('./keepAlive');
const mpRouter = require('./mpWebhook');

router.post('/mp-webhook', mpRouter);
router.use('/renew-token', renewTokenRoute);
router.use('/webhook', webhookRoute);
router.use('/live', keepAlive);

module.exports = router;
