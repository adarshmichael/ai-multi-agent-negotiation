/**
 * controllers/session.controller.js
 * HTTP handlers for session persistence and dashboard endpoints.
 *
 * Endpoints:
 *   GET    /api/sessions              — list user's saved sessions (with filters)
 *   GET    /api/sessions/:id          — get full session detail
 *   DELETE /api/sessions/:id          — delete a session
 *   GET    /api/sessions/:id/export/csv — CSV export
 *   GET    /api/sessions/:id/export/pdf — HTML report for PDF
 *   GET    /api/dashboard             — aggregated performance dashboard data
 *   GET    /api/analytics             — chart-ready analytics data
 */

'use strict';

const sessionService = require('../services/session.service');
const { buildSessionCsv, buildPdfHtml } = require('../services/export.service');
const CoachingReport = require('../models/coachingReport.model');
const Session = require('../models/session.model');
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
 * GET /api/sessions/:id/export/csv
 */
async function exportSessionCsv(req, res, next) {
  try {
    const userId = getUserId(req);
    const session = await sessionService.getSessionById(req.params.id, userId);
    if (!session) {
      const err = new Error(`Session not found: ${req.params.id}`);
      err.statusCode = 404;
      return next(err);
    }

    const csv = buildSessionCsv(session);
    const filename = `negosim-${(session.scenarioName || 'negotiation').replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${req.params.id.slice(0, 8)}.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(csv);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/sessions/:id/export/pdf
 * Returns an HTML document that the client can open in a new window and print-to-PDF.
 */
async function exportSessionPdf(req, res, next) {
  try {
    const userId = getUserId(req);
    const session = await sessionService.getSessionById(req.params.id, userId);
    if (!session) {
      const err = new Error(`Session not found: ${req.params.id}`);
      err.statusCode = 404;
      return next(err);
    }

    // Attach coaching report if available
    const coaching = await CoachingReport.findOne({ sessionId: req.params.id, userId }).lean();

    const html = buildPdfHtml(session, coaching);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
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
 * GET /api/analytics
 * Chart-ready analytics: outcomes over time, per-scenario satisfaction, results by personality.
 */
async function getAnalytics(req, res, next) {
  try {
    const userId = getUserId(req);
    const sessions = await Session.find({ userId }).sort({ completedAt: 1 }).lean();

    if (sessions.length === 0) {
      return res.json({
        outcomesOverTime: [],
        satisfactionPerScenario: [],
        resultsPerPersonality: [],
        concessionsPerRound: [],
        kpis: { total: 0, agreementRate: 0, avgRounds: 0, avgScore: 0 },
      });
    }

    // ── KPIs ──
    const total = sessions.length;
    const agreements = sessions.filter(s => s.outcome === 'agreement').length;
    const avgRounds = Math.round(sessions.reduce((s, n) => s + (n.totalRounds || 0), 0) / total);
    const scoredSessions = sessions.filter(s => s.performanceScore != null);
    const avgScore = scoredSessions.length > 0
      ? Math.round(scoredSessions.reduce((s, n) => s + n.performanceScore, 0) / scoredSessions.length) : 0;

    // ── Outcomes over time (grouped by week) ──
    const weekBuckets = {};
    sessions.forEach(s => {
      const d = new Date(s.completedAt || s.createdAt);
      const week = `${d.getFullYear()}-W${String(Math.ceil(((d - new Date(d.getFullYear(), 0, 1)) / 86400000 + 1) / 7)).padStart(2, '0')}`;
      if (!weekBuckets[week]) weekBuckets[week] = { week, agreement: 0, rejection: 0, max_rounds: 0, stopped: 0, other: 0 };
      const key = ['agreement', 'rejection', 'max_rounds', 'stopped'].includes(s.outcome) ? s.outcome : 'other';
      weekBuckets[week][key]++;
    });
    const outcomesOverTime = Object.values(weekBuckets).sort((a, b) => a.week.localeCompare(b.week));

    // ── Satisfaction per scenario ──
    const scenarioMap = {};
    sessions.forEach(s => {
      const key = s.scenarioName || s.scenarioId || 'Unknown';
      if (!scenarioMap[key]) scenarioMap[key] = { scenario: key, scores: [], count: 0 };
      scenarioMap[key].count++;
      if (s.performanceScore != null) scenarioMap[key].scores.push(s.performanceScore);
    });
    const satisfactionPerScenario = Object.values(scenarioMap).map(item => ({
      scenario: item.scenario,
      count: item.count,
      avgScore: item.scores.length > 0 ? Math.round(item.scores.reduce((a, b) => a + b, 0) / item.scores.length) : 0,
    }));

    // ── Results by personality ──
    const personalityMap = {};
    sessions.forEach(s => {
      (s.participants || []).forEach(p => {
        const pers = p.personality || 'unknown';
        if (!personalityMap[pers]) personalityMap[pers] = { personality: pers, agreement: 0, other: 0, total: 0 };
        personalityMap[pers].total++;
        if (s.outcome === 'agreement') personalityMap[pers].agreement++;
        else personalityMap[pers].other++;
      });
    });
    const resultsPerPersonality = Object.values(personalityMap).map(p => ({
      ...p,
      agreementRate: p.total > 0 ? Math.round((p.agreement / p.total) * 100) : 0,
    }));

    // ── Average concessions per round ──
    const roundBuckets = {};
    sessions.forEach(s => {
      const history = s.concessionHistory || {};
      for (const records of Object.values(history)) {
        (records || []).forEach(r => {
          const rnd = r.round || 1;
          if (!roundBuckets[rnd]) roundBuckets[rnd] = { round: rnd, amounts: [] };
          if (r.concessionAmount > 0) roundBuckets[rnd].amounts.push(r.concessionAmount);
        });
      }
    });
    const concessionsPerRound = Object.values(roundBuckets)
      .sort((a, b) => a.round - b.round)
      .slice(0, 20)
      .map(b => ({
        round: b.round,
        avgConcession: b.amounts.length > 0 ? Math.round(b.amounts.reduce((s, n) => s + n, 0) / b.amounts.length) : 0,
        count: b.amounts.length,
      }));

    res.json({
      kpis: { total, agreementRate: Math.round((agreements / total) * 100), avgRounds, avgScore },
      outcomesOverTime,
      satisfactionPerScenario,
      resultsPerPersonality,
      concessionsPerRound,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Extract user ID from request.
 */
function getUserId(req) {
  if (req.user && req.user.id) return req.user.id;
  const authHeader = req.headers.authorization || '';
  if (authHeader === 'Bearer mock-token-fallback') {
    return req.query.userId || 'demo-user';
  }
  return req.query.userId || 'anonymous';
}

module.exports = {
  listSessions,
  getSession,
  deleteSession,
  exportSessionCsv,
  exportSessionPdf,
  getDashboard,
  getAnalytics,
};
