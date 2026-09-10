/**
 * services/counteroffer.service.js
 * Module 3 — Counteroffer Generation Engine.
 *
 * Generates a deterministic, personality-aware counteroffer when the
 * decision is COUNTER.  Called by both RuleBasedDecisionProvider and
 * LLMDecisionProvider so the numeric offer is always safe and consistent.
 *
 * Strategy: Boulware-style gradual concession, TARGET-ANCHORED
 * ─────────────────────────────────────────────────────────────
 *   Buyer  (moves UP toward maxAcceptable):
 *     base   = myLastOffer ?? (targetValue × 0.9)
 *     gap    = opponentOffer - base
 *     move   = gap × effectiveConcessionRate
 *     raw    = base + move
 *     clamped = min(raw, maxAcceptableValue)   ← hard ceiling
 *
 *   Seller (moves DOWN toward minAcceptable):
 *     base   = myLastOffer ?? (targetValue × 1.1)
 *     gap    = base - opponentOffer
 *     move   = gap × effectiveConcessionRate
 *     raw    = base - move
 *     clamped = max(raw, minAcceptableValue)   ← hard floor
 *
 *   effectiveConcessionRate = concessionRate × (1 + urgencyFactor × 2.5)
 *   urgencyFactor           = currentRound / maxRounds  (0 → 1)
 *   Stalling bonus          = +0.25 urgency if < 2 % movement in last 2 rounds
 *
 * Rounding: nearest ₹500 (tighter than the existing ₹1 000).
 *
 * Returns:
 * {
 *   decision:               'COUNTER',
 *   proposed_offer:         { price: number },
 *   target:                 number,
 *   min_acceptable:         number | null,
 *   max_acceptable:         number | null,
 *   opponent_offer:         number,
 *   previous_agent_offer:   number | null,
 *   distance_from_target:   number,
 *   concession_amount:      number,
 *   concession_rate:        number,   // effective fraction used this round
 *   urgency_factor:         number,
 *   is_stalling:            boolean,
 *   constraint_status:      'WITHIN_LIMIT' | 'CLAMPED',
 *   personality:            string,
 *   reason:                 string,   // deterministic — safe for LLM phrasing
 * }
 */

const { resolveAgentThresholds, isBuyerAgent, formatINR } = require('./offerEvaluation.service');
const { PERSONALITY_PARAMS }                               = require('../config/personalityParams');
const { validateConcession }                               = require('./concession.service');
const logger                                               = require('../utils/logger');

// ─── Rounding helper ────────────────────────────────────────────────────────

/**
 * Round a value to the nearest multiple of `step`.
 * Default step = 500 (tighter than the existing ₹1 000 used elsewhere).
 */
function roundTo(value, step = 500) {
  return Math.round(value / step) * step;
}

// ─── Stalling detection ─────────────────────────────────────────────────────

/**
 * Detect if the agent has been making negligible concessions (< 2 % per round)
 * for the last two rounds.  When stalling is detected, urgency gets a +0.25 bonus
 * so the engine breaks out of the deadlock organically.
 *
 * @param {object} session
 * @param {string} agentId
 * @returns {boolean}
 */
function detectStalling(session, agentId) {
  const history = session.concessionHistory?.[agentId];
  if (!history || history.length < 2) return false;

  const recent = history.slice(-2);
  return recent.every(c => c.concessionPercentage < 2);
}

// ─── Main entry point ────────────────────────────────────────────────────────

/**
 * Generate a structured counteroffer.
 *
 * @param {object} params
 * @param {object} params.agent           - Agent config (id, name, personality, numericConstraint, …)
 * @param {number|object} params.opponentOffer - Opponent's current offer (number or { price })
 * @param {object} [params.session]       - Live negotiation session
 * @param {object} [params.evaluationResult] - Result from offerEvaluation.service (optional but enriches output)
 * @param {number} [params.currentRound]  - Override round (if session not provided)
 * @param {number} [params.maxRounds]     - Override max rounds (if session not provided)
 * @returns {object} Structured counteroffer result
 */
function generateCounteroffer({ agent, opponentOffer, session = null, evaluationResult = null, currentRound = null, maxRounds = null }) {
  if (!agent) throw new Error('generateCounteroffer requires an agent');

  // ── Normalise opponent offer ──────────────────────────────────────────────
  let opponentPrice;
  if (typeof opponentOffer === 'number') {
    opponentPrice = Math.round(opponentOffer);
  } else if (opponentOffer && typeof opponentOffer === 'object') {
    const raw = opponentOffer.price ?? opponentOffer.value ?? opponentOffer.offer ?? null;
    if (raw === null || raw === undefined) throw new Error('generateCounteroffer: invalid opponentOffer object');
    opponentPrice = Math.round(Number(raw));
  } else {
    throw new Error(`generateCounteroffer: invalid opponentOffer: ${JSON.stringify(opponentOffer)}`);
  }

  // ── Resolve thresholds ────────────────────────────────────────────────────
  const { isBuyer, minAcceptable, maxAcceptable, targetValue } = resolveAgentThresholds(agent);

  // ── Round / urgency ───────────────────────────────────────────────────────
  const round    = currentRound ?? session?.currentRound ?? 1;
  const maxR     = maxRounds    ?? session?.maxRounds    ?? 10;

  let urgencyFactor = Math.min(round / maxR, 0.95);

  // Stalling detection — bump urgency if agent is stuck
  const isStalling = session ? detectStalling(session, agent.id) : false;
  if (isStalling) urgencyFactor = Math.min(urgencyFactor + 0.25, 0.95);

  // ── Personality parameters ────────────────────────────────────────────────
  const personality = (agent.personality || 'collaborative').toLowerCase();
  const params      = PERSONALITY_PARAMS[personality] || PERSONALITY_PARAMS['collaborative'];
  const baseConcessionRate  = params.concessionRate;
  const effectiveConcessionRate = baseConcessionRate * (1 + urgencyFactor * 2.5);

  // ── Previous agent offer ──────────────────────────────────────────────────
  const previousAgentOffer = session?.offers?.[agent.id] ?? agent.currentOffer ?? null;

  // ── Compute raw counteroffer ──────────────────────────────────────────────
  let rawOffer;

  if (isBuyer) {
    // Buyer moves UP (wants to pay less, but moves toward seller)
    // Anchor: last offer, or 90 % of target if no history yet
    const base = previousAgentOffer !== null
      ? previousAgentOffer
      : (targetValue !== null ? targetValue * 0.90 : opponentPrice * 0.85);

    const gap  = opponentPrice - base;
    rawOffer   = base + (gap * effectiveConcessionRate);
  } else {
    // Seller moves DOWN (wants to receive more, but moves toward buyer)
    // Anchor: last offer, or 110 % of target if no history yet
    const base = previousAgentOffer !== null
      ? previousAgentOffer
      : (targetValue !== null ? targetValue * 1.10 : opponentPrice * 1.15);

    const gap  = base - opponentPrice;
    rawOffer   = base - (gap * effectiveConcessionRate);
  }

  // ── Hard constraint clamp ─────────────────────────────────────────────────
  let constraintStatus = 'WITHIN_LIMIT';
  let clampedOffer     = rawOffer;

  if (isBuyer && maxAcceptable !== null && rawOffer > maxAcceptable) {
    clampedOffer     = maxAcceptable;
    constraintStatus = 'CLAMPED';
    logger.warn('Counteroffer', `${agent.name}: raw offer ₹${Math.round(rawOffer)} exceeds budget ceiling ₹${maxAcceptable}. Clamped.`);
  } else if (!isBuyer && minAcceptable !== null && rawOffer < minAcceptable) {
    clampedOffer     = minAcceptable;
    constraintStatus = 'CLAMPED';
    logger.warn('Counteroffer', `${agent.name}: raw offer ₹${Math.round(rawOffer)} below floor ₹${minAcceptable}. Clamped.`);
  }

  // ── Round to nearest ₹500 ─────────────────────────────────────────────────
  let proposedPrice = roundTo(clampedOffer, 500);

  // ── Module 4: run safeguard validation on the rounded price ───────────────
  let validationFlags  = [];
  let validationReason = '';
  if (session) {
    // Only run when session is available (unit tests without sessions skip this)
    try {
      const validation = validateConcession(session, agent.id, proposedPrice, agent);
      if (validation.clampedOffer !== proposedPrice) {
        logger.info('Counteroffer',
          `${agent.name}: Module 4 validation adjusted ₹${proposedPrice} → ₹${validation.clampedOffer} [${validation.flags.join(', ')}]`
        );
        proposedPrice = validation.clampedOffer;
        if (constraintStatus === 'WITHIN_LIMIT' && validation.flags.includes('LIMIT_BREACH')) {
          constraintStatus = 'CLAMPED';
        }
      }
      validationFlags  = validation.flags;
      validationReason = validation.reason !== 'Concession within safe bounds.' ? validation.reason : '';
    } catch (vErr) {
      logger.warn('Counteroffer', `Module 4 validation error: ${vErr.message}`);
    }
  }

  // ── Distance from target ──────────────────────────────────────────────────
  // Buyer:  target - proposedPrice  (positive = still below target, good for buyer)
  // Seller: proposedPrice - target  (positive = still above target, good for seller)
  const distanceFromTarget = targetValue !== null
    ? (isBuyer ? targetValue - proposedPrice : proposedPrice - targetValue)
    : 0;

  // ── Concession amount (vs. previous agent offer) ──────────────────────────
  const concessionAmount = previousAgentOffer !== null
    ? Math.abs(proposedPrice - previousAgentOffer)
    : 0;

  // ── Reason string (deterministic — ready for LLM phrasing) ───────────────
  const reason = _buildReason({
    isBuyer,
    opponentPrice,
    proposedPrice,
    previousAgentOffer,
    targetValue,
    minAcceptable,
    maxAcceptable,
    constraintStatus,
    concessionAmount,
    effectiveConcessionRate,
    round,
    maxR,
    isStalling,
    personality,
    distanceFromTarget,
    validationFlags,
    validationReason,
  });

  const result = {
    decision:             'COUNTER',
    proposed_offer:       { price: proposedPrice },
    target:               targetValue,
    min_acceptable:       minAcceptable,
    max_acceptable:       maxAcceptable,
    opponent_offer:       opponentPrice,
    previous_agent_offer: previousAgentOffer,
    distance_from_target: distanceFromTarget,
    concession_amount:    concessionAmount,
    concession_rate:      parseFloat(effectiveConcessionRate.toFixed(4)),
    urgency_factor:       parseFloat(urgencyFactor.toFixed(3)),
    is_stalling:          isStalling,
    constraint_status:    constraintStatus,
    validation_flags:     validationFlags,
    personality,
    reason,
  };

  logger.info(
    'Counteroffer',
    `${agent.name} | Round ${round}/${maxR} | ` +
    `personality=${personality} | ` +
    `prevOffer=${previousAgentOffer ?? '—'} → proposed=${proposedPrice} | ` +
    `opponentOffer=${opponentPrice} | ` +
    `urgency=${urgencyFactor.toFixed(2)} | ` +
    `concessionRate=${(effectiveConcessionRate * 100).toFixed(1)}% | ` +
    `status=${constraintStatus}`
  );

  return result;
}

// ─── Reason builder ───────────────────────────────────────────────────────────

function _buildReason({ isBuyer, opponentPrice, proposedPrice, previousAgentOffer,
  targetValue, minAcceptable, maxAcceptable, constraintStatus,
  concessionAmount, effectiveConcessionRate, round, maxR, isStalling,
  personality, distanceFromTarget, validationFlags = [], validationReason = '' }) {

  const parts = [];

  // Opening: what the opponent offered vs. our position
  if (previousAgentOffer !== null) {
    parts.push(
      `Opponent offered ${formatINR(opponentPrice)}; our previous position was ${formatINR(previousAgentOffer)}.`
    );
  } else {
    parts.push(`Opponent opened at ${formatINR(opponentPrice)}.`);
  }

  // Target distance
  if (targetValue !== null) {
    const sign = distanceFromTarget >= 0 ? 'still' : 'just past';
    parts.push(
      `Proposed ${formatINR(proposedPrice)} is ${sign} ${formatINR(Math.abs(distanceFromTarget))} ${distanceFromTarget >= 0 ? 'from' : 'beyond'} target (${formatINR(targetValue)}).`
    );
  }

  // Concession narrative
  if (concessionAmount > 0) {
    const direction = isBuyer ? 'moved up' : 'moved down';
    parts.push(
      `We ${direction} ${formatINR(concessionAmount)} (${(effectiveConcessionRate * 100).toFixed(1)}% of gap, round ${round}/${maxR}).`
    );
  }

  // Stalling note
  if (isStalling) {
    parts.push(`Stalling detected — applied urgency bonus to break the deadlock.`);
  }

  // Constraint note
  if (constraintStatus === 'CLAMPED') {
    const limit = isBuyer ? formatINR(maxAcceptable) : formatINR(minAcceptable);
    parts.push(`Counter was clamped to hard ${isBuyer ? 'budget ceiling' : 'floor price'} ${limit}.`);
  } else {
    const limit = isBuyer
      ? (maxAcceptable !== null ? `Budget ceiling: ${formatINR(maxAcceptable)}.` : '')
      : (minAcceptable !== null ? `Floor price: ${formatINR(minAcceptable)}.` : '');
    if (limit) parts.push(limit);
  }

  // Validation safeguard notes (Module 4)
  if (validationFlags.length > 0 && validationReason) {
    parts.push(`[Safeguards: ${validationReason}]`);
  }

  return parts.join(' ');
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  generateCounteroffer,
  detectStalling,
  roundTo,
};
