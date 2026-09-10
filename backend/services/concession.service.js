/**
 * services/concession.service.js
 * Tracks and calculates concession data for every offer made in a negotiation.
 *
 * Concession record:
 * ├── round               which round the offer was made
 * ├── previousOffer       the agent's prior offer value (null on first offer)
 * ├── currentOffer        the new offer value
 * ├── concessionAmount    absolute change |current - previous|
 * ├── concessionPercentage percentage change relative to previous offer
 * ├── direction           INCREASE | DECREASE | NO_CHANGE
 * └── timestamp           ISO timestamp
 */

const logger                             = require('../utils/logger');
const { resolveAgentThresholds }         = require('./offerEvaluation.service');
const { PERSONALITY_PARAMS }             = require('../config/personalityParams');

// ─── Reversal tolerance: allow ≤₹500 rounding drift ─────────────────────────
const REVERSAL_TOLERANCE = 500;

/**
 * Concession direction constants.
 */
const DIRECTION = {
  INCREASE:  'INCREASE',
  DECREASE:  'DECREASE',
  NO_CHANGE: 'NO_CHANGE',
};

/**
 * Calculate concession data between two offer values.
 * @param {number|null} previousOffer
 * @param {number}      currentOffer
 * @returns {object} concession metrics
 */
function calculateConcession(previousOffer, currentOffer) {
  if (previousOffer === null || previousOffer === undefined) {
    return {
      previousOffer:       null,
      currentOffer,
      concessionAmount:    0,
      concessionPercentage: 0,
      direction:           DIRECTION.NO_CHANGE,
    };
  }

  const diff             = currentOffer - previousOffer;
  const concessionAmount = Math.abs(diff);
  const concessionPct    = previousOffer !== 0
    ? parseFloat(((concessionAmount / Math.abs(previousOffer)) * 100).toFixed(2))
    : 0;

  let direction;
  if (diff > 0)      direction = DIRECTION.INCREASE;
  else if (diff < 0) direction = DIRECTION.DECREASE;
  else               direction = DIRECTION.NO_CHANGE;

  return {
    previousOffer,
    currentOffer,
    concessionAmount,
    concessionPercentage: concessionPct,
    direction,
  };
}

/**
 * Track a new offer for an agent — appends to session.concessionHistory.
 * Call this BEFORE updating session.offers[agentId] with the new value.
 *
 * @param {object} session  — live negotiation session
 * @param {string} agentId
 * @param {number} newOffer
 * @returns {object} concession record that was just added
 */
function trackConcession(session, agentId, newOffer) {
  const previousOffer = session.offers[agentId] ?? null;
  const concession    = calculateConcession(previousOffer, newOffer);

  // Initialise structure if missing (backwards compat)
  if (!session.concessionHistory)        session.concessionHistory = {};
  if (!session.concessionHistory[agentId]) session.concessionHistory[agentId] = [];

  const record = {
    round: session.currentRound,
    timestamp: new Date().toISOString(),
    ...concession,
  };

  session.concessionHistory[agentId].push(record);

  logger.info('Concession',
    `${agentId} | Round ${session.currentRound} | ${previousOffer ?? 'initial'} → ${newOffer}` +
    ` | ${concession.direction} ${concession.concessionAmount} (${concession.concessionPercentage}%)`
  );

  return record;
}

/**
 * Get full concession history for a specific agent.
 * @param {object} session
 * @param {string} agentId
 * @returns {object[]}
 */
function getConcessionHistory(session, agentId) {
  return session.concessionHistory?.[agentId] || [];
}

/**
 * Build a summary of all concessions for every agent.
 * @param {object} session
 * @returns {object} { [agentId]: { agentName, totalConcession, rounds, history } }
 */
function getConcessionSummary(session) {
  const summary = {};

  for (const agent of session.agents) {
    const history        = getConcessionHistory(session, agent.id);
    const totalConcession = history.reduce((sum, c) => sum + c.concessionAmount, 0);

    summary[agent.id] = {
      agentName: agent.name,
      totalConcession,
      totalConcessionPct: history.length > 0
        ? parseFloat(history.reduce((sum, c) => sum + c.concessionPercentage, 0).toFixed(2))
        : 0,
      rounds:  history.length,
      history,
    };
  }

  return summary;
}

// ─── Module 4 — New functions ─────────────────────────────────────────────────

/**
 * Compute remaining negotiating room between current offer and hard limit.
 *
 * @param {object} agentConfig - agent with numericConstraint / agentType / threshold fields
 * @param {number} currentOffer
 * @returns {{ flexibility: number|null, initialFlexibility: number|null, pctConsumed: number }}
 */
function getAgentFlexibility(agentConfig, currentOffer, initialOffer = null) {
  if (!agentConfig || currentOffer === null || currentOffer === undefined) {
    return { flexibility: null, initialFlexibility: null, pctConsumed: 0 };
  }

  const { isBuyer, minAcceptable, maxAcceptable } = resolveAgentThresholds(agentConfig);

  let flexibility        = null;
  let initialFlexibility = null;

  if (isBuyer && maxAcceptable !== null) {
    flexibility        = maxAcceptable - currentOffer;
    if (initialOffer !== null) initialFlexibility = maxAcceptable - initialOffer;
  } else if (!isBuyer && minAcceptable !== null) {
    flexibility        = currentOffer - minAcceptable;
    if (initialOffer !== null) initialFlexibility = initialOffer - minAcceptable;
  }

  const pctConsumed = (initialFlexibility && initialFlexibility > 0)
    ? parseFloat(Math.min((1 - (flexibility / initialFlexibility)) * 100, 100).toFixed(1))
    : 0;

  return { flexibility, initialFlexibility, pctConsumed };
}

/**
 * Build a full concession snapshot for an agent.
 * Call AFTER trackConcession() AND AFTER session.offers[agentId] is updated.
 *
 * @param {object} session
 * @param {string} agentId
 * @param {object} [agentConfig] - agent config with threshold fields (optional but enriches output)
 * @returns {object} structured snapshot
 */
function getConcessionSnapshot(session, agentId, agentConfig = null) {
  const history          = getConcessionHistory(session, agentId);
  const initialPosition  = session.initialOffers?.[agentId] ?? null;
  const currentOffer     = session.offers?.[agentId]       ?? null;
  const latestRecord     = history.length > 0 ? history[history.length - 1] : null;
  const previousOffer    = latestRecord?.previousOffer ?? null;

  // Totals from initial position
  const totalConcession = (initialPosition !== null && currentOffer !== null)
    ? Math.abs(currentOffer - initialPosition) : 0;

  const concessionPercentage = (initialPosition && initialPosition !== 0 && totalConcession > 0)
    ? parseFloat(((totalConcession / Math.abs(initialPosition)) * 100).toFixed(2)) : 0;

  // This-round move
  const concessionAmount = latestRecord?.concessionAmount ?? 0;

  // Rounds with actual movement (> ₹0)
  const concessionsCount = history.filter(h => h.concessionAmount > 0).length;

  // Flexibility & within-limit
  const flexInfo = agentConfig
    ? getAgentFlexibility(agentConfig, currentOffer, initialPosition)
    : { flexibility: null, initialFlexibility: null, pctConsumed: 0 };

  let withinLimit = true;
  if (agentConfig) {
    const { isBuyer, minAcceptable, maxAcceptable } = resolveAgentThresholds(agentConfig);
    if (isBuyer && maxAcceptable !== null && currentOffer !== null) {
      withinLimit = currentOffer <= maxAcceptable;
    } else if (!isBuyer && minAcceptable !== null && currentOffer !== null) {
      withinLimit = currentOffer >= minAcceptable;
    }
  }

  // Is agent moving in the right direction?
  let isProgressing = true;
  if (latestRecord && latestRecord.direction !== DIRECTION.NO_CHANGE && agentConfig) {
    const { isBuyer } = resolveAgentThresholds(agentConfig);
    isProgressing = isBuyer
      ? latestRecord.direction === DIRECTION.INCREASE
      : latestRecord.direction === DIRECTION.DECREASE;
  }

  return {
    initial_position:       initialPosition,
    previous_offer:         previousOffer,
    current_offer:          currentOffer,
    concession_amount:      concessionAmount,
    total_concession:       totalConcession,
    concession_percentage:  concessionPercentage,
    concessions_count:      concessionsCount,
    within_limit:           withinLimit,
    remaining_flexibility:  flexInfo.flexibility,
    initial_flexibility:    flexInfo.initialFlexibility,
    flexibility_consumed_pct: flexInfo.pctConsumed,
    is_progressing:         isProgressing,
    history,
  };
}

/**
 * Validate a proposed offer against four safeguard rules.
 * Called BEFORE finalising a counteroffer (inside counteroffer.service.js).
 *
 * Flags:
 *   REVERSAL   — moving in wrong direction (e.g. seller going UP)
 *   EXCESSIVE  — single-round move > personality's maxSingleRoundPct
 *   LIMIT_BREACH — proposed value outside min/max (hard enforcement)
 *   STAGNATION — no meaningful movement in last 3 rounds
 *
 * Non-destructive: REVERSAL and EXCESSIVE cap the move; LIMIT_BREACH clamps.
 * Returns a corrected offer and which flags fired.
 *
 * @param {object} session
 * @param {string} agentId
 * @param {number} proposedOffer
 * @param {object} agentConfig
 * @returns {{ valid: boolean, clampedOffer: number, reason: string, flags: string[] }}
 */
function validateConcession(session, agentId, proposedOffer, agentConfig) {
  const flags  = [];
  const parts  = [];
  let   clamped = proposedOffer;

  const previousOffer = session?.offers?.[agentId] ?? null;

  // First offer — nothing to validate
  if (previousOffer === null || previousOffer === undefined) {
    return { valid: true, clampedOffer: Math.round(proposedOffer), reason: 'Initial offer.', flags: [] };
  }

  const { isBuyer, minAcceptable, maxAcceptable } = resolveAgentThresholds(agentConfig);
  const personality   = (agentConfig?.personality || 'collaborative').toLowerCase();
  const params        = PERSONALITY_PARAMS[personality] || PERSONALITY_PARAMS['collaborative'];
  const maxRoundPct   = params.maxSingleRoundPct ?? 0.20;

  // ── 1. LIMIT_BREACH: hard ceiling / floor always enforced ────────────────
  if (isBuyer && maxAcceptable !== null && clamped > maxAcceptable) {
    flags.push('LIMIT_BREACH');
    parts.push(`LIMIT_BREACH: clamped ₹${Math.round(clamped)} → ₹${maxAcceptable} (budget ceiling).`);
    clamped = maxAcceptable;
  } else if (!isBuyer && minAcceptable !== null && clamped < minAcceptable) {
    flags.push('LIMIT_BREACH');
    parts.push(`LIMIT_BREACH: clamped ₹${Math.round(clamped)} → ₹${minAcceptable} (floor price).`);
    clamped = minAcceptable;
  }

  // ── 2. REVERSAL: wrong direction (allow ₹500 rounding tolerance) ─────────
  if (isBuyer && clamped < previousOffer - REVERSAL_TOLERANCE) {
    flags.push('REVERSAL');
    parts.push(`REVERSAL: buyer cannot go below previous ₹${previousOffer}. Held.`);
    clamped = previousOffer;   // freeze position
    logger.warn('Concession', `REVERSAL detected for ${agentId}: proposed ₹${Math.round(proposedOffer)} < prev ₹${previousOffer}`);
  } else if (!isBuyer && clamped > previousOffer + REVERSAL_TOLERANCE) {
    flags.push('REVERSAL');
    parts.push(`REVERSAL: seller cannot go above previous ₹${previousOffer}. Held.`);
    clamped = previousOffer;   // freeze position
    logger.warn('Concession', `REVERSAL detected for ${agentId}: proposed ₹${Math.round(proposedOffer)} > prev ₹${previousOffer}`);
  }

  // ── 3. EXCESSIVE: single-round move too large ─────────────────────────────
  if (!flags.includes('REVERSAL')) {
    const moveSize = Math.abs(clamped - previousOffer);
    const movePct  = previousOffer !== 0 ? moveSize / Math.abs(previousOffer) : 0;
    if (movePct > maxRoundPct) {
      flags.push('EXCESSIVE');
      const maxMove = Math.abs(previousOffer) * maxRoundPct;
      const cappedRaw = isBuyer
        ? previousOffer + maxMove
        : previousOffer - maxMove;
      // round to ₹500
      clamped = Math.round(cappedRaw / 500) * 500;
      parts.push(
        `EXCESSIVE: ${(movePct * 100).toFixed(1)}% move > ${(maxRoundPct * 100).toFixed(0)}% limit. ` +
        `Capped at ₹${clamped}.`
      );
      logger.warn('Concession',
        `EXCESSIVE concession for ${agentId}: ${(movePct * 100).toFixed(1)}% > cap ${(maxRoundPct * 100).toFixed(0)}%`
      );
    }
  }

  // ── 4. STAGNATION: no meaningful movement in last 3 rounds ───────────────
  const history = session?.concessionHistory?.[agentId] || [];
  if (history.length >= 3) {
    const last3 = history.slice(-3);
    if (last3.every(h => h.concessionAmount < 500)) {
      flags.push('STAGNATION');
      parts.push('STAGNATION: < ₹500 movement in last 3 rounds.');
      logger.warn('Concession', `STAGNATION detected for ${agentId}`);
    }
  }

  // ── Re-apply hard limit after any capping ────────────────────────────────
  if (isBuyer && maxAcceptable !== null && clamped > maxAcceptable) {
    clamped = maxAcceptable;
  } else if (!isBuyer && minAcceptable !== null && clamped < minAcceptable) {
    clamped = minAcceptable;
  }

  const valid = !flags.some(f => f === 'REVERSAL' || f === 'LIMIT_BREACH');

  return {
    valid,
    clampedOffer: Math.round(clamped),
    reason:       parts.join(' ') || 'Concession within safe bounds.',
    flags,
  };
}

module.exports = {
  DIRECTION,
  calculateConcession,
  trackConcession,
  getConcessionHistory,
  getConcessionSummary,
  getConcessionSnapshot,
  validateConcession,
  getAgentFlexibility,
};
