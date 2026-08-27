/**
 * routes/health.routes.js
 * Health check endpoint.
 */

const express = require('express');
const router = express.Router();
const { config } = require('../config/env');

router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'NegoSim Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    port: config.port,
    geminiConfigured: !!config.geminiApiKey,
  });
});

module.exports = router;
