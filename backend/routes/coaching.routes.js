/**
 * routes/coaching.routes.js
 * AI Coach and Hint API routes.
 */

'use strict';

const express = require('express');
const router  = express.Router();
const controller = require('../controllers/coaching.controller');

// Session-scoped coaching (post-negotiation)
router.post('/sessions/:id/coaching',  controller.generateCoachingReport);
router.get('/sessions/:id/coaching',   controller.getCoachingReport);

// User-scoped listing (score trend)
router.get('/coaching',                controller.listCoachingReports);

// Live negotiation hints (rate-limited)
router.post('/negotiations/:id/hint',  controller.getHint);

module.exports = router;
