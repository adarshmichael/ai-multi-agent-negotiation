/**
 * routes/session.routes.js
 * Session persistence and dashboard REST routes.
 *
 * Mounted at /api in server.js alongside the negotiation routes.
 */

'use strict';

const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/session.controller');

// Session CRUD
router.get('/sessions',            controller.listSessions);
router.get('/sessions/:id',        controller.getSession);
router.delete('/sessions/:id',     controller.deleteSession);

// Dashboard
router.get('/dashboard',           controller.getDashboard);

module.exports = router;
