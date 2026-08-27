/**
 * controllers/negotiation.controller.js
 * HTTP handlers for all negotiation-related endpoints.
 */

const negotiationService = require('../services/negotiation.service');
const engine = require('../engine/NegotiationEngine');
const { STATUS, RESULT, serializeNegotiation } = require('../models/negotiation.model');
const logger = require('../utils/logger');

/**
 * GET /api/scenarios
 * Return all available scenarios (for frontend to populate scenario grid).
 */
function getScenarios(req, res, next) {
  try {
    const scenarios = negotiationService.getAllScenarios();
    res.json(scenarios);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/negotiations
 * Create a new negotiation session.
 * Body: { scenario_id, agents: [{id, personality}], maximum_rounds?, mode? }
 */
function createNegotiation(req, res, next) {
  try {
    const { scenario_id, agents, maximum_rounds, mode } = req.body;

    if (!scenario_id) {
      const err = new Error('scenario_id is required');
      err.statusCode = 400;
      return next(err);
    }

    const scenario = negotiationService.getScenarioById(scenario_id);
    if (!scenario) {
      const err = new Error(`Scenario not found: ${scenario_id}`);
      err.statusCode = 404;
      return next(err);
    }

    const session = negotiationService.createSession({
      scenario_id,
      agents,
      maximum_rounds,
      mode,
    });

    logger.negotiation(`Created: ${session.id}`);
    res.status(201).json(session);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/negotiations/:id/start
 * Start (trigger) the negotiation engine for a session.
 * The engine runs asynchronously and pushes updates via WebSocket.
 */
function startNegotiation(req, res, next) {
  try {
    const { id } = req.params;
    const session = negotiationService.getSession(id);

    if (!session) {
      const err = new Error(`Negotiation not found: ${id}`);
      err.statusCode = 404;
      return next(err);
    }

    if (session.status !== STATUS.CREATED && session.status !== STATUS.STARTING) {
      const err = new Error(`Negotiation ${id} is already ${session.status}`);
      err.statusCode = 409;
      return next(err);
    }

    negotiationService.updateSession(id, { status: STATUS.STARTING });

    // Run the negotiation engine asynchronously (fire-and-forget from HTTP perspective)
    engine.run(session).catch(err => {
      logger.error('Engine', `Unhandled engine error for ${id}: ${err.message}`);
      negotiationService.updateSession(id, {
        status: STATUS.FAILED,
        result: RESULT.ERROR,
        resultReason: 'Internal engine error',
      });
      engine.broadcast(id, 'negotiation_failed', { reason: 'Internal engine error. Please try again.' });
    });

    res.json({ negotiationId: id, status: 'starting', message: 'Negotiation engine started.' });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/negotiations/:id
 * Get current state of a negotiation.
 */
function getNegotiation(req, res, next) {
  try {
    const { id } = req.params;
    const session = negotiationService.getSerializedSession(id);

    if (!session) {
      const err = new Error(`Negotiation not found: ${id}`);
      err.statusCode = 404;
      return next(err);
    }

    res.json(session);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/negotiations/:id/messages
 * Get all messages for a negotiation.
 */
function getMessages(req, res, next) {
  try {
    const { id } = req.params;
    const session = negotiationService.getSession(id);

    if (!session) {
      const err = new Error(`Negotiation not found: ${id}`);
      err.statusCode = 404;
      return next(err);
    }

    res.json({
      negotiationId: id,
      messages: session.messages,
      count: session.messages.length,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/negotiations/:id/stop
 * Stop an active negotiation.
 */
function stopNegotiation(req, res, next) {
  try {
    const { id } = req.params;
    const session = negotiationService.getSession(id);

    if (!session) {
      const err = new Error(`Negotiation not found: ${id}`);
      err.statusCode = 404;
      return next(err);
    }

    negotiationService.updateSession(id, {
      status: STATUS.STOPPED,
      result: RESULT.STOPPED,
      resultReason: 'Negotiation stopped by user.',
      completedAt: new Date().toISOString(),
    });

    engine.broadcast(id, 'negotiation_completed', {
      result: RESULT.STOPPED,
      reason: 'Negotiation stopped by user.',
      rounds: session.currentRound,
    });

    res.json({ negotiationId: id, status: STATUS.STOPPED });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/negotiations/:id/outcome
 * Get the final outcome/result of a completed negotiation.
 * Used by the frontend to fetch the summary after completion.
 */
function getOutcome(req, res, next) {
  try {
    const { id } = req.params;
    const session = negotiationService.getSession(id);

    if (!session) {
      const err = new Error(`Negotiation not found: ${id}`);
      err.statusCode = 404;
      return next(err);
    }

    const isCompleted = [STATUS.COMPLETED, STATUS.FAILED, STATUS.STOPPED].includes(session.status);

    const outcome = {
      negotiationId: id,
      status: session.status,
      result: session.result,
      reason: session.resultReason,
      finalOffer: session.agreement?.offer || null,
      rounds: session.currentRound,
      maxRounds: session.maxRounds,
      scenario: session.scenario,
      agents: session.agents.map(a => ({
        id: a.id,
        name: a.name,
        role: a.role,
        personality: a.personality,
        decision: isCompleted && session.result === RESULT.AGREEMENT ? 'accepted' : 'rejected',
        initialOffer: session.initialOffers[a.id] || null,
        finalOffer: session.offers[a.id] || null,
      })),
      messages: session.messages,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      // Summary for display
      summary: isCompleted
        ? buildOutcomeSummary(session)
        : 'Negotiation is still in progress.',
    };

    res.json(outcome);
  } catch (err) {
    next(err);
  }
}

function buildOutcomeSummary(session) {
  switch (session.result) {
    case RESULT.AGREEMENT:
      return `Agreement reached after ${session.currentRound} rounds at ${
        session.agreement?.offer
          ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(session.agreement.offer)
          : 'agreed terms'
      }.`;
    case RESULT.REJECTION:
      return `Negotiation failed: ${session.resultReason}`;
    case RESULT.MAX_ROUNDS:
      return `Maximum rounds (${session.maxRounds}) reached without agreement.`;
    case RESULT.STOPPED:
      return 'Negotiation was stopped by the user.';
    default:
      return 'Negotiation ended.';
  }
}

module.exports = {
  getScenarios,
  createNegotiation,
  startNegotiation,
  getNegotiation,
  getMessages,
  stopNegotiation,
  getOutcome,
};
