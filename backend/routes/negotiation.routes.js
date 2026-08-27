/**
 * routes/negotiation.routes.js
 * All negotiation-related REST routes.
 */

const express = require('express');
const router = express.Router();
const controller = require('../controllers/negotiation.controller');

// Scenarios (served by backend to match API contract)
router.get('/scenarios', controller.getScenarios);

// Negotiation CRUD
router.post('/negotiations',           controller.createNegotiation);
router.get('/negotiations/:id',        controller.getNegotiation);
router.post('/negotiations/:id/start', controller.startNegotiation);
router.post('/negotiations/:id/stop',  controller.stopNegotiation);
router.get('/negotiations/:id/messages', controller.getMessages);
router.get('/negotiations/:id/outcome',  controller.getOutcome);

module.exports = router;
