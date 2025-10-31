const express = require('express');
const router = express.Router();

const renewTokenRoute = require('./renewTokenRoute');
const webhookRoute = require('./webhookRoute');
const mpRouter = require('./mpWebhook');

router.post('/mp-webhook', mpRouter);
router.use('/renew-token', renewTokenRoute);
router.use('/webhook', webhookRoute);

module.exports = router;
