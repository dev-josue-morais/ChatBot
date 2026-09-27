const express = require('express');
const router = express.Router();

const webhookRoute = require('./webhookRoute');
const mpRouter = require('./mpWebhook');
const supabaseEventRoute = require('./supabaseEventRoute');
const autoWakeupRoute = require('./autoWakeupRoute');

router.post('/mp-webhook', mpRouter);
router.use('/webhook', webhookRoute);
router.use('/supabase-events', supabaseEventRoute);
router.use('/auto-wakeup', autoWakeupRoute);

module.exports = router;