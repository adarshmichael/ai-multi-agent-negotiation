/**
 * backend/services/report.service.js
 * Generates structured negotiation outcome analysis.
 *
 * Produces:
 *  - Per-agent satisfaction scores (from actual offer vs target/min/max)
 *  - Concession timeline (round-by-round from session.negotiationHistory)
 *  - Decision breakdown (accept/counter/reject counts)
 *  - Deadlock analysis
 *  - Key textual insights
 */

'use strict';

const { RESULT } = require('../models/negotiation.model');

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

function formatINR(amount) {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(amount);
}

// ── Satisfaction Score ────────────────────────────────────────────────────────

/**
 * Calculate a 0-100 satisfaction score for one agent.
 *
 * For buyer (wants LOW price):  good = finalOffer ≤ target ≤ maxAcceptable
 * For seller (wants HIGH price): good = finalOffer ≥ target ≥ minAcceptable
 */
function calcSatisfaction(agent, finalOffer, initialOffer) {
  if (finalOffer == null) return null;

  const nc = agent.numericConstraint;
  const target = agent.targetValue;

  // Constraint-aware scoring
  if (nc && target != null) {
    if (nc.type === 'max') {
      // Buyer perspective: lower is better
      const limit = nc.value;
      if (finalOffer <= target) return 100;
      if (finalOffer >= limit)  return 0;
      const score = ((limit - finalOffer) / (limit - target)) * 100;
      return Math.round(clamp(score, 0, 100));
    }
    if (nc.type === 'min') {
      // Seller perspective: higher is better
      const limit = nc.value;
      if (finalOffer >= target) return 100;
      if (finalOffer <= limit)  return 0;
      const score = ((finalOffer - limit) / (target - limit)) * 100;
      return Math.round(clamp(score, 0, 100));
    }
  }

  // Fallback: how much of the initial gap was closed toward target
  if (initialOffer != null && target != null) {
    const initialGap = Math.abs(initialOffer - target);
    if (initialGap === 0) return 100;
    const finalGap = Math.abs(finalOffer - target);
    const score = ((initialGap - finalGap) / initialGap) * 100;
    return Math.round(clamp(score, 0, 100));
  }

  return null;
}

// ── Concession Timeline ───────────────────────────────────────────────────────

/**
 * Build a per-round timeline from session.negotiationHistory.
 * Groups by round and summarises both agents.
 */
function buildConcessionTimeline(session, agents) {
  const history = session.negotiationHistory || [];
  if (history.length === 0) return [];

  // Group entries by round
  const byRound = {};
  for (const entry of history) {
    const r = entry.round;
    if (!byRound[r]) byRound[r] = [];
    byRound[r].push(entry);
  }

  return Object.keys(byRound)
    .map(Number)
    .sort((a, b) => a - b)
    .map(round => {
      const entries = byRound[round];
      return {
        round,
        entries: entries.map(e => ({
          agentId:   e.agentId,
          agentName: e.agentName,
          action:    e.action,
          offer:     e.offer,
          offerFmt:  formatINR(e.offer),
          reason:    e.reason || '',
          timestamp: e.timestamp,
        })),
      };
    });
}

// ── Decision Breakdown ────────────────────────────────────────────────────────

function buildDecisionBreakdown(session, agents) {
  const breakdown = {};
  for (const agent of agents) {
    breakdown[agent.id] = { agentName: agent.name, accept: 0, counter: 0, reject: 0, total: 0 };
  }

  for (const msg of session.messages || []) {
    const entry = breakdown[msg.agentId];
    if (!entry) continue;
    entry.total++;
    if (msg.decision === 'accept')       entry.accept++;
    else if (msg.decision === 'reject')  entry.reject++;
    else                                  entry.counter++;
  }

  return Object.values(breakdown);
}

// ── Key Insights ──────────────────────────────────────────────────────────────

function buildInsights(session, agents, finalOffer, result, satisfactionScores) {
  const insights = [];

  // Who made more concessions?
  const concSummary = session.concessionHistory || {};
  let maxMover = null;
  let maxMoved = -1;
  for (const agent of agents) {
    const records = concSummary[agent.id] || [];
    const total = records.reduce((s, r) => s + (r.concessionAmount || 0), 0);
    if (total > maxMoved) { maxMoved = total; maxMover = agent; }
  }
  if (maxMover && maxMoved > 0) {
    insights.push(`${maxMover.name} made the most concessions, moving a total of ${formatINR(maxMoved)}.`);
  }

  // Efficiency (rounds used vs max)
  const roundsUsed = session.currentRound;
  const maxRounds  = session.maxRounds;
  const efficiency = Math.round((1 - (roundsUsed / maxRounds)) * 100);
  if (result === RESULT.AGREEMENT) {
    if (efficiency >= 40) {
      insights.push(`Negotiation was efficient — agreement reached in ${roundsUsed} of ${maxRounds} possible rounds.`);
    } else {
      insights.push(`Negotiation required ${roundsUsed} rounds out of ${maxRounds} maximum.`);
    }
  }

  // Constraint respect
  const agentsAtLimit = agents.filter(a => {
    const nc = a.numericConstraint;
    if (!nc || !finalOffer) return false;
    if (nc.type === 'max') return finalOffer <= nc.value;
    if (nc.type === 'min') return finalOffer >= nc.value;
    return true;
  });
  if (agentsAtLimit.length === agents.length && finalOffer) {
    insights.push('All hard constraints were respected in the final agreement.');
  }

  // Satisfaction
  if (satisfactionScores.length >= 2) {
    const avg = Math.round(satisfactionScores.reduce((s, e) => s + (e.score || 0), 0) / satisfactionScores.length);
    if (avg >= 70) {
      insights.push(`Both parties achieved a satisfactory outcome (avg satisfaction: ${avg}%).`);
    } else if (avg >= 50) {
      insights.push(`Outcome was acceptable but not ideal for both parties (avg satisfaction: ${avg}%).`);
    } else if (result !== RESULT.AGREEMENT) {
      insights.push('No agreement was reached. Hard constraints could not be bridged.');
    }
  }

  // Deadlock
  if (result === RESULT.REJECTION || result === RESULT.MAX_ROUNDS) {
    insights.push('Parties failed to reach agreement. Consider revising constraints or introducing a mediator.');
  }

  return insights;
}

// ── Main Report Builder ───────────────────────────────────────────────────────

/**
 * Build a complete negotiation report from a session.
 *
 * @param {object} session  — live negotiation session
 * @returns {object} report
 */
function buildReport(session) {
  const agents      = session._agents || session.agents || [];
  const result      = session.result;
  const finalOffer  = session.agreement?.offer ?? null;

  // Satisfaction scores
  const satisfactionScores = agents.map(agent => {
    // BUG FIX: Use the AGREED deal price (finalOffer) for satisfaction,
    // not the agent's own last counter-offer (session.offers[agent.id]).
    // The agent's own position would always look favorable from their
    // perspective, inflating scores. What matters is the actual settlement.
    const scoredOffer = finalOffer ?? session.offers[agent.id] ?? null;
    const agentInitOffer  = session.initialOffers[agent.id] ?? null;
    const score = calcSatisfaction(agent, scoredOffer, agentInitOffer);
    return {
      agentId:       agent.id,
      agentName:     agent.name,
      role:          agent.role,
      goal:          agent.goal || (agent.goals || [])[0] || '',
      target:        agent.targetValue ?? null,
      targetFmt:     formatINR(agent.targetValue),
      finalOffer:    scoredOffer,
      finalOfferFmt: formatINR(scoredOffer),
      score:         score,
      constraint:    agent.numericConstraint || null,
    };
  });

  // Concession timeline
  const concessionTimeline = buildConcessionTimeline(session, agents);

  // Decision breakdown
  const decisionBreakdown = buildDecisionBreakdown(session, agents);

  // Concession summary per agent
  const concessionSummary = agents.map(agent => {
    const records  = (session.concessionHistory || {})[agent.id] || [];
    const total    = records.reduce((s, r) => s + (r.concessionAmount || 0), 0);
    const count    = records.filter(r => r.concessionAmount > 0).length;
    const initPos  = session.initialOffers[agent.id] ?? null;
    const finalPos = session.offers[agent.id] ?? null;
    const pct      = (initPos && finalPos && initPos !== 0)
      ? Math.round((Math.abs(finalPos - initPos) / Math.abs(initPos)) * 100)
      : 0;
    return {
      agentId:         agent.id,
      agentName:       agent.name,
      initialPosition: initPos,
      initialFmt:      formatINR(initPos),
      finalPosition:   finalPos,
      finalFmt:        formatINR(finalPos),
      totalConcession: total,
      totalFmt:        formatINR(total),
      concessionPct:   pct,
      concessionCount: count,
    };
  });

  // Insights
  const insights = buildInsights(session, agents, finalOffer, result, satisfactionScores);

  return {
    meta: {
      negotiationId: session.id,
      scenarioId:    session.scenarioId,
      scenarioName:  session.scenario?.name || 'Unknown Scenario',
      mode:          session.mode || 'simulation',
      result,
      resultReason:  session.resultReason || '',
      totalRounds:   session.currentRound,
      maxRounds:     session.maxRounds,
      startedAt:     session.startedAt,
      completedAt:   session.completedAt,
      finalOffer,
      finalOfferFmt: formatINR(finalOffer),
    },
    satisfactionScores,
    concessionTimeline,
    concessionSummary,
    decisionBreakdown,
    insights,
  };
}

module.exports = { buildReport };
