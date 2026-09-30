/**
 * controllers/session.controller.js
 * HTTP handlers for session persistence and dashboard endpoints.
 *
 * Endpoints:
 *   GET  /api/sessions          — list user's saved sessions (with filters)
 *   GET  /api/sessions/:id      — get full session detail
 *   DELETE /api/sessions/:id    — delete a session
 *   GET  /api/dashboard         — aggregated performance dashboard data
 */

'use strict';

const sessionService = require('../services/session.service');
const logger = require('../utils/logger');

/**
 * GET /api/sessions
 * Query params: scenarioId, outcome, mode, sort, search, page, limit, minScore, maxScore
 */
async function listSessions(req, res, next) {
  try {
    const userId = getUserId(req);
    const filters = {
      scenarioId: req.query.scenarioId,
      outcome:    req.query.outcome,
      mode:       req.query.mode,
      sort:       req.query.sort,
      search:     req.query.search,
      page:       req.query.page,
      limit:      req.query.limit,
      minScore:   req.query.minScore,
      maxScore:   req.query.maxScore,
    };

    const result = await sessionService.getSessions(userId, filters);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/sessions/:id
 */
async function getSession(req, res, next) {
  try {
    const userId = getUserId(req);
    const session = await sessionService.getSessionById(req.params.id, userId);

    if (!session) {
      const err = new Error(`Session not found: ${req.params.id}`);
      err.statusCode = 404;
      return next(err);
    }

    res.json(session);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/sessions/:id
 */
async function deleteSession(req, res, next) {
  try {
    const userId = getUserId(req);
    const deleted = await sessionService.deleteSession(req.params.id, userId);

    if (!deleted) {
      const err = new Error(`Session not found or not owned by you: ${req.params.id}`);
      err.statusCode = 404;
      return next(err);
    }

    res.json({ message: 'Session deleted successfully.', sessionId: req.params.id });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/dashboard
 */
async function getDashboard(req, res, next) {
  try {
    const userId = getUserId(req);
    const data = await sessionService.getDashboardData(userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

/**
 * Extract user ID from request.
 * If JWT auth is active, req.user.id is set by protect middleware.
 * For mock/demo mode, falls back to a query param or 'anonymous'.
 */
function getUserId(req) {
  // From JWT middleware
  if (req.user && req.user.id) return req.user.id;

  // From Authorization header (mock token)
  const authHeader = req.headers.authorization || '';
  if (authHeader === 'Bearer mock-token-fallback') {
    // Try to get identity from query param or use stored email
    return req.query.userId || 'demo-user';
  }

  // From query string fallback (for demo mode)
  return req.query.userId || 'anonymous';
}

module.exports = {
  listSessions,
  getSession,
  deleteSession,
  getDashboard,
};
