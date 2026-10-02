/**
 * controllers/coaching.controller.js
 * HTTP handlers for AI Coach endpoints.
 *
 * Endpoints:
 *   POST /api/sessions/:id/coaching     — generate coaching report
 *   GET  /api/sessions/:id/coaching     — get existing coaching report
 *   POST /api/negotiations/:id/hint     — get hint (rate-limited, max 3 per negotiation)
 *   GET  /api/coaching                  — list all coaching reports for user
 */

'use strict';

const CoachingReport = require('../models/coachingReport.model');
const { generateCoaching, generateHint } = require('../services/coaching.service');
const { getSessionById } = require('../services/session.service');
const negotiationService = require('../services/negotiation.service');
const logger = require('../utils/logger');

// In-memory hint rate limiter: { [negotiationId]: count }
const hintUsage = new Map();
const HINT_MAX = 3;

function getUserId(req) {
  if (req.user && req.user.id) return req.user.id;
  const authHeader = req.headers.authorization || '';
  if (authHeader === 'Bearer mock-token-fallback') return req.query.userId || 'demo-user';
  return req.query.userId || 'anonymous';
}

/**
 * POST /api/sessions/:id/coaching
 * Generate and persist a coaching report for a completed session.
 */
async function generateCoachingReport(req, res, next) {
  try {
    const userId = getUserId(req);
    const sessionId = req.params.id;

    // Check if already exists
    const existing = await CoachingReport.findOne({ sessionId, userId }).lean();
    if (existing) {
      return res.json({ coaching: existing });
    }

    const session = await getSessionById(sessionId, userId);
    if (!session) {
      const err = new Error(`Session not found: ${sessionId}`);
      err.statusCode = 404;
      return next(err);
    }

    logger.info('CoachController', `Generating coaching for session ${sessionId}`);
    const coachData = await generateCoaching(session);

    const doc = await CoachingReport.create({
      userId,
      sessionId,
      overallScore: coachData.overallScore,
      strengths: coachData.strengths,
      mistakes: coachData.mistakes,
      missedOpportunities: coachData.missedOpportunities,
      actionableTips: coachData.actionableTips,
      rawLlmOutput: '',
      generationStatus: coachData.generationStatus || 'success',
    });

    res.status(201).json({ coaching: doc });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/sessions/:id/coaching
 * Fetch existing coaching report.
 */
async function getCoachingReport(req, res, next) {
  try {
    const userId = getUserId(req);
    const sessionId = req.params.id;

    const doc = await CoachingReport.findOne({ sessionId, userId }).lean();
    if (!doc) {
      return res.status(404).json({ coaching: null, message: 'No coaching report found. Generate one first.' });
    }

    res.json({ coaching: doc });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/coaching
 * List all coaching reports for the authenticated user (score trend).
 */
async function listCoachingReports(req, res, next) {
  try {
    const userId = getUserId(req);
    const docs = await CoachingReport.find({ userId })
      .sort({ createdAt: -1 })
      .select('sessionId overallScore generationStatus createdAt')
      .lean();
    res.json({ reports: docs, total: docs.length });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/negotiations/:id/hint
 * Returns a single coaching hint. Rate-limited to HINT_MAX per negotiation.
 */
async function getHint(req, res, next) {
  try {
    const negotiationId = req.params.id;

    const used = hintUsage.get(negotiationId) || 0;
    if (used >= HINT_MAX) {
      return res.status(429).json({
        error: { message: `Hint limit reached (max ${HINT_MAX} per session).`, code: 'HINT_LIMIT' },
        remaining: 0,
      });
    }

    const session = negotiationService.getSession(negotiationId);
    if (!session) {
      const err = new Error(`Negotiation not found: ${negotiationId}`);
      err.statusCode = 404;
      return next(err);
    }

    const hint = await generateHint(session);
    hintUsage.set(negotiationId, used + 1);

    res.json({ hint, used: used + 1, remaining: HINT_MAX - (used + 1), max: HINT_MAX });
  } catch (err) {
    next(err);
  }
}

module.exports = { generateCoachingReport, getCoachingReport, listCoachingReports, getHint };
