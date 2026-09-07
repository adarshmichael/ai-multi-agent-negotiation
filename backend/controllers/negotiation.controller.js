/**
 * controllers/negotiation.controller.js
 * HTTP handlers for all negotiation-related endpoints.
 */

const negotiationService = require('../services/negotiation.service');
const engine = require('../engine/NegotiationEngine');
const { STATUS, RESULT, serializeNegotiation } = require('../models/negotiation.model');
const logger = require('../utils/logger');

/** GET /api/scenarios */
function getScenarios(req, res, next) {
  try {
    res.json(negotiationService.getAllScenarios());
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/negotiations
 * Body: { scenario_id, agents, maximum_rounds?, mode? }
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

    if (!agents || !Array.isArray(agents) || agents.length === 0) {
      const err = new Error('agents array is required and must be non-empty');
      err.statusCode = 400;
      return next(err);
    }

    if (maximum_rounds !== undefined) {
      const rounds = Number(maximum_rounds);
      if (isNaN(rounds) || rounds < 1 || rounds > 50) {
        const err = new Error('maximum_rounds must be between 1 and 50');
        err.statusCode = 400;
        return next(err);
      }
    }

    const session = negotiationService.createSession({ scenario_id, agents, maximum_rounds, mode });
    logger.negotiation(`Created: ${session.id}`);
    res.status(201).json(session);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/negotiations/:id/start
 * Starts the autonomous negotiation engine.
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

    // Run autonomously — fire and forget from HTTP perspective
    engine.run(session).catch(err => {
      logger.error('Engine', `Unhandled engine error for ${id}: ${err.message}`);
      negotiationService.updateSession(id, {
        status: STATUS.FAILED,
        result: RESULT.ERROR,
        resultReason: 'Internal engine error',
      });
      engine.broadcast(id, 'negotiation_failed', { reason: 'Internal engine error. Please try again.' });
    });

    res.json({ negotiationId: id, status: 'starting', message: 'Autonomous negotiation started.' });
  } catch (err) {
    next(err);
  }
}

/** POST /api/negotiations/:id/pause */
function pauseNegotiation(req, res, next) {
  try {
    const { id } = req.params;
    const session = negotiationService.getSession(id);

    if (!session) {
      const err = new Error(`Negotiation not found: ${id}`);
      err.statusCode = 404;
      return next(err);
    }

    engine.pauseNegotiation(session);
    res.json({ negotiationId: id, status: 'paused' });
  } catch (err) {
    next(err);
  }
}

/** POST /api/negotiations/:id/resume */
function resumeNegotiation(req, res, next) {
  try {
    const { id } = req.params;
    const session = negotiationService.getSession(id);

    if (!session) {
      const err = new Error(`Negotiation not found: ${id}`);
      err.statusCode = 404;
      return next(err);
    }

    engine.resumeNegotiation(session);
    res.json({ negotiationId: id, status: 'in_progress' });
  } catch (err) {
    next(err);
  }
}

/** GET /api/negotiations/:id */
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

/** GET /api/negotiations/:id/messages */
function getMessages(req, res, next) {
  try {
    const { id } = req.params;
    const session = negotiationService.getSession(id);

    if (!session) {
      const err = new Error(`Negotiation not found: ${id}`);
      err.statusCode = 404;
      return next(err);
    }

    res.json({ negotiationId: id, messages: session.messages, count: session.messages.length });
  } catch (err) {
    next(err);
  }
}

/** POST /api/negotiations/:id/stop */
function stopNegotiation(req, res, next) {
  try {
    const { id } = req.params;
    const session = negotiationService.getSession(id);

    if (!session) {
      const err = new Error(`Negotiation not found: ${id}`);
      err.statusCode = 404;
      return next(err);
    }

    // Mark as stopped — the running loop will detect this and exit
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
      finalOffer: null,
    });

    res.json({ negotiationId: id, status: STATUS.STOPPED });
  } catch (err) {
    next(err);
  }
}

/** POST /api/negotiations/:id/reset */
function resetNegotiation(req, res, next) {
  try {
    const { id } = req.params;
    const session = negotiationService.getSession(id);

    if (!session) {
      const err = new Error(`Negotiation not found: ${id}`);
      err.statusCode = 404;
      return next(err);
    }

    // Stop the loop first
    session._paused  = true;
    session._running = false;

    // Reset all state
    negotiationService.updateSession(id, {
      status:            STATUS.CREATED,
      currentRound:      0,
      currentAgentTurn:  null,
      currentAgentIndex: 0,
      messages:          [],
      negotiationHistory:[],
      offers:            {},
      initialOffers:     {},
      concessionHistory: {},
      agreement:         null,
      result:            null,
      resultReason:      null,
      completedAt:       null,
    });

    // Clear stored agent instances so they're re-initialized fresh
    session._agents  = null;
    session._paused  = false;
    session._running = false;

    engine.broadcast(id, 'negotiation_reset', { negotiationId: id });
    res.json({ negotiationId: id, status: 'reset', message: 'Negotiation reset successfully.' });
  } catch (err) {
    next(err);
  }
}

/** GET /api/negotiations/:id/outcome */
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
    const agents = session._agents || session.agents || [];

    res.json({
      negotiationId: id,
      status:        session.status,
      result:        session.result,
      reason:        session.resultReason,
      finalOffer:    session.agreement?.offer || null,
      rounds:        session.currentRound,
      maxRounds:     session.maxRounds,
      scenario:      session.scenario,
      agents:        agents.map(a => ({
        id:          a.id,
        name:        a.name,
        role:        a.role,
        personality: a.personality,
        decision:    isCompleted && session.result === RESULT.AGREEMENT ? 'accepted' : 'rejected',
        initialOffer: session.initialOffers[a.id] || null,
        finalOffer:   session.offers[a.id] || null,
      })),
      messages:    session.messages,
      startedAt:   session.startedAt,
      completedAt: session.completedAt,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getScenarios,
  createNegotiation,
  startNegotiation,
  pauseNegotiation,
  resumeNegotiation,
  getNegotiation,
  getMessages,
  stopNegotiation,
  resetNegotiation,
  getOutcome,
};
