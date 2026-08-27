/**
 * server.js
 * NegoSim Backend — Express + WebSocket server.
 *
 * HTTP endpoints: /api/health, /api/scenarios, /api/negotiations/*
 * WebSocket:      ws://localhost:8001  (same port, upgraded connection)
 */

const { validateConfig, config } = require('./config/env');

// Validate env before doing anything else
validateConfig();

const express = require('express');
const http = require('http');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const url = require('url');

const healthRoutes = require('./routes/health.routes');
const negotiationRoutes = require('./routes/negotiation.routes');
const errorHandler = require('./middleware/errorHandler');
const engine = require('./engine/NegotiationEngine');
const negotiationService = require('./services/negotiation.service');
const logger = require('./utils/logger');

// ======== Express Setup ========
const app = express();

app.use(cors({
  origin: '*', // Allow all origins for local development (Live Server, etc.)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ======== Routes ========
app.use('/api/health', healthRoutes);
app.use('/api', negotiationRoutes);

// 404 handler for unrecognized routes
app.use((req, res) => {
  res.status(404).json({ error: { message: `Route not found: ${req.method} ${req.path}`, code: 'NOT_FOUND' } });
});

// Global error handler (must be last)
app.use(errorHandler);

// ======== HTTP Server ========
const server = http.createServer(app);

// ======== WebSocket Server ========
const wss = new WebSocketServer({ noServer: true });

// Handle WebSocket upgrade requests
server.on('upgrade', (request, socket, head) => {
  const { query } = url.parse(request.url, true);
  const negotiationId = query.negotiationId;

  if (!negotiationId) {
    logger.warn('WebSocket', 'Rejected connection: missing negotiationId query param');
    socket.destroy();
    return;
  }

  const session = negotiationService.getSession(negotiationId);
  if (!session) {
    logger.warn('WebSocket', `Rejected connection: negotiation ${negotiationId} not found`);
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request, negotiationId);
  });
});

wss.on('connection', (ws, request, negotiationId) => {
  logger.info('WebSocket', `Client connected to negotiation: ${negotiationId}`);

  // Register this client with the engine
  engine.registerClient(negotiationId, ws);

  // Send current session state immediately on connect (for reconnections)
  const session = negotiationService.getSession(negotiationId);
  if (session) {
    try {
      ws.send(JSON.stringify({
        event: 'connection_established',
        data: {
          negotiationId,
          status: session.status,
          currentRound: session.currentRound,
          messages: session.messages,
          offers: session.offers,
        },
      }));
    } catch (err) {
      logger.warn('WebSocket', `Failed to send initial state: ${err.message}`);
    }
  }

  // Handle client messages (for future human-in-the-loop)
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      logger.info('WebSocket', `Received from client: ${JSON.stringify(msg).slice(0, 100)}`);
      // Future: handle human turn submissions here
    } catch (err) {
      logger.warn('WebSocket', `Invalid message from client: ${err.message}`);
    }
  });

  ws.on('close', () => {
    logger.info('WebSocket', `Client disconnected from: ${negotiationId}`);
    engine.unregisterClient(negotiationId, ws);
  });

  ws.on('error', (err) => {
    logger.error('WebSocket', `Error on ${negotiationId}: ${err.message}`);
    engine.unregisterClient(negotiationId, ws);
  });
});

// ======== Start Server ========
server.listen(config.port, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   NegoSim Backend — Ready                ║');
  console.log(`║   HTTP:  http://localhost:${config.port}/api     ║`);
  console.log(`║   WS:    ws://localhost:${config.port}           ║`);
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
  logger.info('Server', `Listening on port ${config.port}`);
  logger.info('Server', `Gemini API: ${config.geminiApiKey ? 'CONFIGURED ✓' : 'NOT CONFIGURED ✗'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Server', 'SIGTERM received — shutting down gracefully');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  logger.info('Server', 'SIGINT received — shutting down gracefully');
  server.close(() => process.exit(0));
});
