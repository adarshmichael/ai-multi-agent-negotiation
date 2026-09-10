/**
 * services/offerEvaluation.service.js
 * Module 1: Deterministic Offer Evaluation Engine.
 *
 * Evaluates incoming offers against:
 *   - Agent goals & constraints (hard budget/price limits)
 *   - Target values, minimum acceptable & maximum acceptable values
 *   - Negotiation round progress & urgency
 *   - Negotiation history, previous offers, and opponent concession trends
 *
 * Returns a structured deterministic evaluation result:
 * {
 *   evaluation: 'FAVORABLE' | 'PARTIALLY_ACCEPTABLE' | 'UNACCEPTABLE',
 *   opponent_offer: { price: number },
 *   distance_from_target: number,
 *   constraint_status: 'WITHIN_LIMIT' | 'VIOLATED',
 *   recommendation: 'ACCEPT' | 'COUNTER' | 'REJECT',
 *   reason: string,
 *   metrics: { target_value, min_acceptable, max_acceptable, current_round, max_rounds, gap, opponent_concession }
 * }
 */

const logger = require('../utils/logger');

/**
 * Format currency in Indian Rupees (₹).
 */
function formatINR(amount) {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Determine if agent is operating as a buyer/cost-minimizer or seller/value-maximizer.
 */
function isBuyerAgent(agent) {
  if (agent.numericConstraint?.type === 'max') return true;
  if (agent.numericConstraint?.type === 'min') return false;
  if (agent.agentType === 'buyer') return true;
  if (agent.agentType === 'seller') return false;
  return /buyer|candidate|client|customer|project manager/i.test(agent.role || agent.name || '');
}

/**
 * Extract or compute reference values (target, min acceptable, max acceptable) for an agent.
 */
function resolveAgentThresholds(agent) {
  const isBuyer = isBuyerAgent(agent);
  const nc = agent.numericConstraint;

  let minAcceptable = agent.minAcceptableValue ?? null;
  let maxAcceptable = agent.maxAcceptableValue ?? null;
  let targetValue   = agent.targetValue ?? null;

  if (isBuyer) {
    if (maxAcceptable === null && nc?.type === 'max') {
      maxAcceptable = nc.value;
    }
    if (targetValue === null) {
      if (agent.initialOffer !== null && agent.initialOffer !== undefined) {
        targetValue = agent.initialOffer;
      } else if (maxAcceptable !== null) {
        // Default buyer target: 15% below max budget
        targetValue = Math.round((maxAcceptable * 0.85) / 1000) * 1000;
      }
    }
    if (minAcceptable === null && targetValue !== null) {
      minAcceptable = Math.round((targetValue * 0.7) / 1000) * 1000;
    }
  } else {
    // Seller
    if (minAcceptable === null && nc?.type === 'min') {
      minAcceptable = nc.value;
    }
    if (targetValue === null) {
      if (agent.initialOffer !== null && agent.initialOffer !== undefined) {
        targetValue = agent.initialOffer;
      } else if (minAcceptable !== null) {
        // Default seller target: 15% above minimum price
        targetValue = Math.round((minAcceptable * 1.15) / 1000) * 1000;
      }
    }
    if (maxAcceptable === null && targetValue !== null) {
      maxAcceptable = Math.round((targetValue * 1.3) / 1000) * 1000;
    }
  }

  return { isBuyer, minAcceptable, maxAcceptable, targetValue };
}

/**
 * Deterministically evaluate an opponent's offer from the perspective of an agent.
 *
 * @param {object} params
 * @param {object} params.agent           - Agent config or instance (goals, constraints, personality, etc.)
 * @param {number|object} params.opponentOffer - Opponent's numeric offer or offer object { price, ... }
 * @param {object} [params.session]       - Live negotiation session or context { currentRound, maxRounds, offers, concessionHistory, messages }
 * @param {number} [params.currentRound]  - Current round number (if session not provided)
 * @param {number} [params.maxRounds]     - Max rounds (if session not provided)
 * @returns {object} Structured evaluation result
 */
function evaluateOffer({ agent, opponentOffer, session = null, currentRound = null, maxRounds = null }) {
  if (!agent) {
    throw new Error('evaluateOffer requires an agent parameter');
  }

  // Normalize opponent offer price
  let price = null;
  if (typeof opponentOffer === 'number') {
    price = Math.round(opponentOffer);
  } else if (opponentOffer && typeof opponentOffer === 'object') {
    const raw = opponentOffer.price ?? opponentOffer.value ?? opponentOffer.offer ?? null;
    if (raw !== null && raw !== undefined) {
      price = Math.round(Number(raw));
    }
  }

  if (price === null || isNaN(price)) {
    throw new Error(`evaluateOffer received an invalid opponent offer: ${JSON.stringify(opponentOffer)}`);
  }

  const { isBuyer, minAcceptable, maxAcceptable, targetValue } = resolveAgentThresholds(agent);

  const round = currentRound || session?.currentRound || 1;
  const max   = maxRounds || session?.maxRounds || 10;
  const isFinalRound = round >= max;

  // Track opponent previous offers and concessions if session is provided
  let opponentConcession = 0;
  let myLastOffer = session?.offers?.[agent.id] ?? agent.currentOffer ?? null;
  const opponentId = session?.agents?.find(a => a.id !== agent.id)?.id;

  if (session?.concessionHistory && opponentId && session.concessionHistory[opponentId]) {
    const oppConcessions = session.concessionHistory[opponentId];
    if (oppConcessions.length > 0) {
      const latest = oppConcessions[oppConcessions.length - 1];
      opponentConcession = latest.concessionAmount || 0;
    }
  }

  // Calculate gap between agent's current position and opponent's offer
  let gap = null;
  if (myLastOffer !== null && myLastOffer !== undefined) {
    gap = Math.abs(myLastOffer - price);
  }

  // 1. Evaluate Hard Numeric Constraints
  let constraintStatus = 'WITHIN_LIMIT';
  let evaluation = 'PARTIALLY_ACCEPTABLE';
  let recommendation = 'COUNTER';
  let reason = '';
  let distanceFromTarget = 0;

  if (isBuyer) {
    // Buyer: Cannot exceed maxAcceptable (budget)
    // Distance from target: target - price (positive = savings below target, negative = above target)
    distanceFromTarget = targetValue !== null ? (targetValue - price) : 0;

    if (maxAcceptable !== null && price > maxAcceptable) {
      constraintStatus = 'VIOLATED';
      evaluation = 'UNACCEPTABLE';
      recommendation = 'REJECT';
      reason = `Offer of ${formatINR(price)} exceeds maximum budget limit of ${formatINR(maxAcceptable)}.`;
    } else if (targetValue !== null && price <= targetValue) {
      // Met or beat buyer target (favorable)
      constraintStatus = 'WITHIN_LIMIT';
      evaluation = 'FAVORABLE';
      recommendation = 'ACCEPT';
      const savings = targetValue - price;
      reason = savings > 0
        ? `Offer of ${formatINR(price)} is ${formatINR(savings)} below target (${formatINR(targetValue)}). Highly favorable.`
        : `Offer of ${formatINR(price)} matches the agent's target value.`;
    } else {
      // Between target and budget limit
      constraintStatus = 'WITHIN_LIMIT';
      evaluation = 'PARTIALLY_ACCEPTABLE';

      // Check if convergence tolerance reached or final round
      if (gap !== null && myLastOffer && gap <= (myLastOffer * 0.02)) {
        recommendation = 'ACCEPT';
        reason = `Offer of ${formatINR(price)} is within ${formatINR(gap)} (2%) of our position. Recommendation is to accept.`;
      } else if (isFinalRound) {
        recommendation = 'ACCEPT';
        reason = `Offer of ${formatINR(price)} is within budget limit (${formatINR(maxAcceptable)}). Reached final round ${round}/${max}; accept to secure deal.`;
      } else {
        recommendation = 'COUNTER';
        reason = `Offer is above the agent's target (${formatINR(targetValue)}) but still within negotiable limits (budget ceiling ${formatINR(maxAcceptable)}).`;
      }
    }
  } else {
    // Seller / Vendor: Cannot go below minAcceptable (floor price)
    // Distance from target: price - target (positive = above target, negative = below target)
    distanceFromTarget = targetValue !== null ? (price - targetValue) : 0;

    if (minAcceptable !== null && price < minAcceptable) {
      constraintStatus = 'VIOLATED';
      evaluation = 'UNACCEPTABLE';
      recommendation = 'REJECT';
      reason = `Offer of ${formatINR(price)} is below minimum acceptable price of ${formatINR(minAcceptable)}.`;
    } else if (targetValue !== null && price >= targetValue) {
      // Met or beat seller target (favorable)
      constraintStatus = 'WITHIN_LIMIT';
      evaluation = 'FAVORABLE';
      recommendation = 'ACCEPT';
      const premium = price - targetValue;
      reason = premium > 0
        ? `Offer of ${formatINR(price)} exceeds target (${formatINR(targetValue)}) by ${formatINR(premium)}. Highly favorable.`
        : `Offer of ${formatINR(price)} matches the agent's target value.`;
    } else {
      // Between min acceptable price and target
      constraintStatus = 'WITHIN_LIMIT';
      evaluation = 'PARTIALLY_ACCEPTABLE';

      // Check if convergence tolerance reached or final round
      if (gap !== null && myLastOffer && gap <= (myLastOffer * 0.02)) {
        recommendation = 'ACCEPT';
        reason = `Offer of ${formatINR(price)} is within ${formatINR(gap)} (2%) of our position. Recommendation is to accept.`;
      } else if (isFinalRound) {
        recommendation = 'ACCEPT';
        reason = `Offer of ${formatINR(price)} satisfies minimum price (${formatINR(minAcceptable)}). Reached final round ${round}/${max}; accept to close agreement.`;
      } else {
        recommendation = 'COUNTER';
        reason = `Offer is below the agent's target (${formatINR(targetValue)}) but still within negotiable limits (floor price ${formatINR(minAcceptable)}).`;
      }
    }
  }

  const result = {
    evaluation,
    opponent_offer: {
      price,
    },
    distance_from_target: distanceFromTarget,
    constraint_status: constraintStatus,
    recommendation,
    reason,
    target_value: targetValue,
    min_acceptable: minAcceptable,
    max_acceptable: maxAcceptable,
    round,
    max_rounds: max,
    gap,
    opponent_concession: opponentConcession,
  };

  logger.info(
    'OfferEvaluation',
    `${agent.name} evaluated ₹${price}: [${evaluation}] status=${constraintStatus} distance=${distanceFromTarget} rec=${recommendation}`
  );

  return result;
}

module.exports = {
  evaluateOffer,
  resolveAgentThresholds,
  isBuyerAgent,
  formatINR,
};
