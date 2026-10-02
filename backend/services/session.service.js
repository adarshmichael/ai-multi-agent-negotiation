/**
 * services/session.service.js
 * Persists completed negotiation sessions to MongoDB.
 *
 * This is the abstraction layer between the negotiation engine's in-memory
 * sessions and long-term storage. The frontend never touches the DB directly.
 *
 * Architecture:
 *   Engine finishes → session.service.saveSession() → MongoDB
 *   Frontend calls  → /api/sessions → session.service → MongoDB
 */

'use strict';

const Session = require('../models/session.model');
const { buildReport } = require('./report.service');
const { calculateSessionScore } = require('./performance.service');
const logger = require('../utils/logger');

/**
 * Save a completed in-memory negotiation session to MongoDB.
 * Called automatically when the engine reaches a terminal state.
 *
 * @param {object} liveSession — the in-memory session from negotiation.service
 * @param {string} userId — authenticated user's ID (or 'anonymous')
 * @returns {object|null} saved document or null on error
 */
async function saveSession(liveSession, userId) {
  if (!liveSession || !liveSession.id) {
    logger.warn('SessionService', 'saveSession called with invalid session');
    return null;
  }

  // Prevent duplicate saves
  const existing = await Session.findOne({ sessionId: liveSession.id });
  if (existing) {
    logger.info('SessionService', `Session ${liveSession.id} already saved — skipping duplicate.`);
    return existing;
  }

  // Build the rich report from the live session (reuses report.service.js)
  let report = null;
  try {
    report = buildReport(liveSession);
  } catch (err) {
    logger.warn('SessionService', `Report generation failed for ${liveSession.id}: ${err.message}`);
  }

  // Extract agent data
  const agents = liveSession._agents || liveSession.agents || [];
  const satisfactionScores = report?.satisfactionScores || [];

  const participants = agents.map(agent => {
    const satEntry = satisfactionScores.find(s => s.agentId === agent.id);
    return {
      id: agent.id,
      name: agent.name,
      role: agent.role || '',
      personality: agent.personality || 'collaborative',
      agentType: agent.type || agent.agentType || 'ai',
      goals: agent.goals || (agent.goal ? [agent.goal] : []),
      constraints: agent.constraints || [],
      numericConstraint: agent.numericConstraint || null,
      initialOffer: liveSession.initialOffers?.[agent.id] || null,
      finalOffer: liveSession.offers?.[agent.id] || null,
      satisfaction: satEntry?.score || null,
    };
  });

  // Concession stats aggregation
  const concessionHistory = liveSession.concessionHistory || {};
  let totalConcessions = 0;
  let totalPct = 0;
  let pctCount = 0;
  let largest = 0;
  let totalMovement = 0;
  let movementCount = 0;

  for (const agentId of Object.keys(concessionHistory)) {
    const records = concessionHistory[agentId] || [];
    for (const r of records) {
      if (r.concessionAmount > 0) {
        totalConcessions++;
        totalPct += r.concessionPercentage || 0;
        pctCount++;
        if (r.concessionAmount > largest) largest = r.concessionAmount;
      }
    }
    // Movement = distance between initial and final
    const initial = liveSession.initialOffers?.[agentId];
    const final = liveSession.offers?.[agentId];
    if (initial != null && final != null) {
      totalMovement += Math.abs(final - initial);
      movementCount++;
    }
  }

  const concessionStats = {
    totalConcessions,
    averagePercentage: pctCount > 0 ? parseFloat((totalPct / pctCount).toFixed(1)) : 0,
    largestConcession: largest,
    averageOfferMovement: movementCount > 0 ? Math.round(totalMovement / movementCount) : 0,
  };

  // Map outcome from the engine's result constants
  const outcomeMap = {
    agreement: 'agreement',
    rejection: 'rejection',
    max_rounds: 'max_rounds',
    stopped: 'stopped',
    error: 'error',
  };
  const outcome = outcomeMap[liveSession.result] || liveSession.result || 'unknown';

  // Timing
  const startedAt = liveSession.startedAt ? new Date(liveSession.startedAt) : new Date();
  const completedAt = liveSession.completedAt ? new Date(liveSession.completedAt) : new Date();
  const duration = Math.round((completedAt - startedAt) / 1000);

  // Determine practice mode
  const isPractice = agents.some(a => (a.type || a.agentType) === 'human');
  const mode = isPractice ? 'practice' : (liveSession.mode || 'simulation');

  // Build the document
  const sessionDoc = {
    sessionId: liveSession.id,
    userId: userId || 'anonymous',
    scenarioId: liveSession.scenarioId,
    scenarioName: liveSession.scenario?.name || 'Unknown Scenario',
    scenarioDescription: liveSession.scenario?.description || '',
    mode,
    maxRounds: liveSession.maxRounds || 10,
    participants,
    outcome,
    resultReason: liveSession.resultReason || '',
    finalOffer: liveSession.agreement?.offer || null,
    totalRounds: liveSession.currentRound || 0,
    successStatus: outcome === 'agreement',
    concessionStats,
    concessionHistory: liveSession.concessionHistory || {},
    messages: (liveSession.messages || []).map(m => ({
      id: m.id,
      agentId: m.agentId,
      agentName: m.agentName,
      role: m.role,
      message: m.message,
      offer: m.offer,
      decision: m.decision,
      round: m.round,
      timestamp: m.timestamp,
    })),
    negotiationHistory: liveSession.negotiationHistory || [],
    initialOffers: liveSession.initialOffers || {},
    finalOffers: liveSession.offers || {},
    report,
    startedAt,
    completedAt,
    duration,
  };

  // Calculate performance score
  sessionDoc.performanceScore = calculateSessionScore(sessionDoc);

  try {
    const saved = await Session.create(sessionDoc);
    logger.info('SessionService', `Session saved: ${saved.sessionId} | Score: ${saved.performanceScore} | Outcome: ${saved.outcome}`);
    return saved;
  } catch (err) {
    logger.error('SessionService', `Failed to save session ${liveSession.id}: ${err.message}`);
    return null;
  }
}

/**
 * Get all sessions for a user, sorted by most recent first.
 * Supports filtering and pagination.
 */
async function getSessions(userId, filters = {}) {
  const query = { userId };

  if (filters.scenarioId) query.scenarioId = filters.scenarioId;
  if (filters.outcome) query.outcome = filters.outcome;
  if (filters.mode) query.mode = filters.mode;
  if (filters.search) {
    // search can match scenarioName or sessionId prefix
    query.$or = [
      { scenarioName: { $regex: filters.search, $options: 'i' } },
      { sessionId: { $regex: filters.search, $options: 'i' } },
    ];
  }
  if (filters.minScore != null) {
    query.performanceScore = { ...query.performanceScore, $gte: Number(filters.minScore) };
  }
  if (filters.maxScore != null) {
    query.performanceScore = { ...query.performanceScore, $lte: Number(filters.maxScore) };
  }

  // Sort
  const sortOptions = {
    newest: { completedAt: -1 },
    oldest: { completedAt: 1 },
    highest_score: { performanceScore: -1 },
    lowest_score: { performanceScore: 1 },
    most_rounds: { totalRounds: -1 },
    shortest: { duration: 1 },
  };
  const sort = sortOptions[filters.sort] || sortOptions.newest;

  // For list view, exclude heavy fields
  const projection = {
    messages: 0,
    negotiationHistory: 0,
    concessionHistory: 0,
    report: 0,
  };

  const page = Math.max(1, parseInt(filters.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(filters.limit) || 20));
  const skip = (page - 1) * limit;

  const [sessions, total] = await Promise.all([
    Session.find(query, projection).sort(sort).skip(skip).limit(limit).lean(),
    Session.countDocuments(query),
  ]);

  return { sessions, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * Get a single session by sessionId OR MongoDB _id, with ownership check.
 * Accepts both formats so that export endpoints using _id also work.
 */
async function getSessionById(sessionId, userId) {
  // Try by sessionId first (the live negotiation ID)
  let doc = await Session.findOne({ sessionId, userId }).lean();
  if (doc) return doc;
  // Fall back to MongoDB _id (used by export endpoints)
  if (sessionId && sessionId.match && sessionId.match(/^[a-f\d]{24}$/i)) {
    doc = await Session.findOne({ _id: sessionId, userId }).lean();
  }
  return doc || null;
}

/**
 * Delete a session.
 */
async function deleteSession(sessionId, userId) {
  const result = await Session.deleteOne({ sessionId, userId });
  return result.deletedCount > 0;
}

/**
 * Get dashboard aggregation data for a user.
 * Fetches all sessions and delegates to performance.service.js.
 */
async function getDashboardData(userId) {
  const { calculatePerformance } = require('./performance.service');

  const sessions = await Session.find({ userId }).lean();
  return calculatePerformance(sessions);
}

module.exports = {
  saveSession,
  getSessions,
  getSessionById,
  deleteSession,
  getDashboardData,
};
