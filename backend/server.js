/**
 * server.js
 * NegoSim Backend — Express + WebSocket server.
 *
 * HTTP endpoints: /api/health, /api/scenarios, /api/negotiations/*
 * WebSocket:      ws://localhost:8001  (same port, upgraded connection)
 * Updated:        Ready for multi-key LLM reasoning
 */

const { validateConfig, config } = require('./config/env');

// Validate env before doing anything else
validateConfig();

const express     = require('express');
const http        = require('http');
const cors        = require('cors');
const helmet      = require('helmet');
const rateLimit   = require('express-rate-limit');
const mongoose    = require('mongoose');
const { WebSocketServer } = require('ws');
const url         = require('url');

const healthRoutes = require('./routes/health.routes');
const negotiationRoutes = require('./routes/negotiation.routes');
const authRoutes = require('./routes/auth.routes');
const sessionRoutes = require('./routes/session.routes');
const coachingRoutes = require('./routes/coaching.routes');
const customScenarioRoutes = require('./routes/customScenario.routes');
const errorHandler = require('./middleware/errorHandler');
const engine = require('./engine/NegotiationEngine');
const negotiationService = require('./services/negotiation.service');
const logger = require('./utils/logger');

// ======== Express Setup ========
const app = express();

// ── Security headers ──
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false,
}));

// ── Allowed CORS origins ──
const ALLOWED_ORIGINS = [
  'https://adarshmichael.github.io',
  'http://127.0.0.1:5501',
  'http://localhost:5501',
  'http://localhost:3000',
  'http://localhost:8001',
  'http://127.0.0.1:8001',
];
if (config.clientOrigins) {
  config.clientOrigins.split(',').forEach(o => {
    const trimmed = o.trim().replace(/\/$/, ''); // strip trailing slash
    if (trimmed && !ALLOWED_ORIGINS.includes(trimmed)) ALLOWED_ORIGINS.push(trimmed);
  });
}

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (e.g., curl, Postman, mobile apps)
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin.replace(/\/$/, ''))) return cb(null, true);
    cb(new Error(`CORS: Origin not allowed — ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
}));

// ── Rate limiting on auth routes (prevent brute-force) ──
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                   // max 20 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many requests. Please wait a few minutes and try again.', code: 'RATE_LIMITED' } },
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ======== Routes ========
const path = require('path');
app.use('/api/health', healthRoutes);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api', negotiationRoutes);
app.use('/api', sessionRoutes);
app.use('/api', coachingRoutes);
app.use('/api', customScenarioRoutes);

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..')));

// 404 handler for unrecognized API routes
app.use('/api/*', (req, res) => {
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

  // Handle client messages — Practice Mode human turn submissions
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      logger.info('WebSocket', `Received from client: ${JSON.stringify(msg).slice(0, 100)}`);

      // Practice Mode: human participant submits their turn
      if (msg.event === 'human_input' && msg.data) {
        engine.submitHumanTurn(negotiationId, msg.data);
      }
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

// ======== MongoDB Connection ========
mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 2000 })
  .then(() => {
    logger.info('MongoDB', `Connected to ${config.mongoUri.replace(/\/\/.*@/, '//***@')}`);
  })
  .catch((err) => {
    logger.warn('MongoDB', `Connection failed: ${err.message}. Auth features will be unavailable.`);
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
  logger.info('Server', `MongoDB:    ${config.mongoUri ? 'CONFIGURED ✓' : 'NOT CONFIGURED ✗'}`);
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
