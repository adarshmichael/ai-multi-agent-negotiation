/**
 * routes/negotiation.routes.js
 * All negotiation-related REST routes.
 */

const express = require('express');
const router  = express.Router();
const controller = require('../controllers/negotiation.controller');

// Scenarios
router.get('/scenarios',                     controller.getScenarios);

// Negotiation CRUD + Lifecycle
router.post('/negotiations',                 controller.createNegotiation);
router.get('/negotiations/:id',              controller.getNegotiation);
router.post('/negotiations/:id/start',       controller.startNegotiation);
router.post('/negotiations/:id/pause',       controller.pauseNegotiation);
router.post('/negotiations/:id/resume',      controller.resumeNegotiation);
router.post('/negotiations/:id/stop',        controller.stopNegotiation);
router.post('/negotiations/:id/reset',       controller.resetNegotiation);
router.get('/negotiations/:id/messages',     controller.getMessages);
router.get('/negotiations/:id/outcome',      controller.getOutcome);

module.exports = router;
