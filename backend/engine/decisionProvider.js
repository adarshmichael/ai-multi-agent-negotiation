/**
 * engine/decisionProvider.js
 * AgentDecisionProvider — abstract interface for negotiation decision-making.
 *
 * Architecture (LLM-ready):
 *
 *   NegotiationEngine
 *         ↓
 *   AgentDecisionProvider  ← abstraction layer (this file)
 *         ↓
 *   RuleBasedDecisionProvider  (Milestone 1 — deterministic)
 *         ↓  (swap in M2)
 *   LLMDecisionProvider        (Milestone 2 — Gemini LLM)
 *
 * Decision output shape:
 *   { message, offer, decision, reason, action }
 *   decision: 'accept' | 'reject' | 'counter_offer'
 *   action:   'ACCEPT' | 'REJECT' | 'OFFER' | 'COUNTEROFFER'
 */

const logger = require('../utils/logger');

// ============================================================
// Formatting helpers (backend version of frontend formatINR)
// ============================================================

function formatINR(amount) {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(amount);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================================
// AgentDecisionProvider — abstract base class
// ============================================================

class AgentDecisionProvider {
  /**
   * Make a negotiation decision for the current agent.
   * @param {object} agent   — BaseAgent instance (has id, name, role, personality, numericConstraint, etc.)
   * @param {object} session — live negotiation session
   * @returns {Promise<{ message: string, offer: number|null, decision: string, reason: string, action: string }>}
   */
  // eslint-disable-next-line no-unused-vars
  async decide(agent, session) {
    throw new Error('AgentDecisionProvider.decide() must be implemented by subclass');
  }

  /**
   * Evaluate whether an offer is acceptable (for reporting/testing).
   * @param {object} agent
   * @param {number} offer
   * @returns {{ acceptable: boolean, reason: string }}
   */
  // eslint-disable-next-line no-unused-vars
  evaluateOffer(agent, offer) {
    throw new Error('AgentDecisionProvider.evaluateOffer() must be implemented by subclass');
  }

  /**
   * Evaluate a constraint against a value.
   * @param {object} numericConstraint — { type: 'max'|'min', value: number }
   * @param {number} offerValue
   * @returns {boolean}
   */
  evaluateConstraint(numericConstraint, offerValue) {
    if (!numericConstraint || offerValue === null || offerValue === undefined) return true;
    if (numericConstraint.type === 'max') return offerValue <= numericConstraint.value;
    if (numericConstraint.type === 'min') return offerValue >= numericConstraint.value;
    return true;
  }

  /**
   * Evaluate goals — are we achieving what we set out to?
   * Default implementation: offer is within 5% of ideal.
   */
  evaluateGoals(agent, offerValue) {
    const nc = agent.numericConstraint;
    if (!nc) return true;
    const tolerance = nc.value * 0.05;
    if (nc.type === 'max') return offerValue <= nc.value - tolerance;
    if (nc.type === 'min') return offerValue >= nc.value + tolerance;
    return true;
  }
}

// ============================================================
// RuleBasedDecisionProvider — deterministic M1 implementation
// ============================================================

/**
 * Personality-driven parameters for the rule-based engine.
 *
 * initialFactor: how far from the constraint limit to start
 *   max-buyer:   starts at X * maxBudget  (X < 1 = low initial offer)
 *   min-seller:  starts at Y * minPrice   (Y > 1 = high initial offer)
 *
 * concessionRate: fraction of remaining gap moved per round
 * acceptanceBuffer:  buyer accepts if sellerOffer <= max * buf  (buf < 1)
 * acceptanceFloor:   seller accepts if buyerOffer >= min * flr  (flr > 1)
 */
const PERSONALITY_PARAMS = {
  aggressive: {
    initialFactor:    { max: 0.58, min: 1.42 },
    concessionRate:   0.06,
    acceptanceBuffer: 0.98,   // buyer accepts at or below 98% of max
    acceptanceFloor:  1.02,   // seller accepts at or above 102% of min
  },
  collaborative: {
    initialFactor:    { max: 0.72, min: 1.28 },
    concessionRate:   0.14,
    acceptanceBuffer: 0.93,
    acceptanceFloor:  1.07,
  },
  'risk-averse': {
    initialFactor:    { max: 0.67, min: 1.33 },
    concessionRate:   0.10,
    acceptanceBuffer: 0.95,
    acceptanceFloor:  1.05,
  },
  competitive: {
    initialFactor:    { max: 0.60, min: 1.40 },
    concessionRate:   0.07,
    acceptanceBuffer: 0.97,
    acceptanceFloor:  1.03,
  },
  flexible: {
    initialFactor:    { max: 0.70, min: 1.30 },
    concessionRate:   0.16,
    acceptanceBuffer: 0.91,
    acceptanceFloor:  1.09,
  },
  analytical: {
    initialFactor:    { max: 0.65, min: 1.35 },
    concessionRate:   0.09,
    acceptanceBuffer: 0.94,
    acceptanceFloor:  1.06,
  },
  professional: {
    initialFactor:    { max: 0.68, min: 1.32 },
    concessionRate:   0.11,
    acceptanceBuffer: 0.95,
    acceptanceFloor:  1.05,
  },
};

const DEFAULT_PARAMS = PERSONALITY_PARAMS['collaborative'];

class RuleBasedDecisionProvider extends AgentDecisionProvider {
  constructor() {
    super();
  }

  async decide(agent, session) {
    const round   = session.currentRound;
    const maxRounds = session.maxRounds;
    const personality = (agent.personality || 'collaborative').toLowerCase();
    const params  = PERSONALITY_PARAMS[personality] || DEFAULT_PARAMS;
    const nc      = agent.numericConstraint;

    const myCurrentOffer  = session.offers[agent.id] ?? null;
    const opponent        = session.agents.find(a => a.id !== agent.id);
    const opponentOffer   = opponent ? (session.offers[opponent.id] ?? null) : null;

    logger.info('RuleEngine',
      `${agent.name} | Round ${round} | personality=${personality} | myOffer=${myCurrentOffer} | opponentOffer=${opponentOffer}`
    );

    // Round 1 or no opponent offer yet → generate initial offer
    if (round === 1 || opponentOffer === null) {
      return this._initialOffer(agent, params, nc, round);
    }

    // Check if opponent's offer satisfies our hard constraint
    const constraintSatisfied = this.evaluateConstraint(nc, opponentOffer);

    // Check if offer is good enough to accept
    if (constraintSatisfied && this._isAcceptable(nc, opponentOffer, params)) {
      return this._accept(agent, opponentOffer);
    }

    // Constraint violated and no rounds left → reject
    if (!constraintSatisfied && round >= maxRounds) {
      return this._reject(agent, opponentOffer);
    }

    // Normal counter-offer
    return this._counterOffer(agent, nc, opponentOffer, myCurrentOffer, params, round, maxRounds);
  }

  evaluateOffer(agent, offer) {
    const nc = agent.numericConstraint;
    const satisfied = this.evaluateConstraint(nc, offer);
    const personality = (agent.personality || 'collaborative').toLowerCase();
    const params = PERSONALITY_PARAMS[personality] || DEFAULT_PARAMS;
    const acceptable = satisfied && this._isAcceptable(nc, offer, params);

    return {
      acceptable,
      constraintSatisfied: satisfied,
      reason: acceptable
        ? 'Offer meets constraints and acceptance threshold'
        : !satisfied
          ? `Offer violates ${nc?.type} constraint of ${formatINR(nc?.value)}`
          : 'Offer satisfies constraint but below acceptance threshold',
    };
  }

  // ---- Private helpers ----

  _isAcceptable(nc, opponentOffer, params) {
    if (!nc) return false;
    if (nc.type === 'max') return opponentOffer <= nc.value * params.acceptanceBuffer;
    if (nc.type === 'min') return opponentOffer >= nc.value * params.acceptanceFloor;
    return false;
  }

  _initialOffer(agent, params, nc, round) {
    let value;
    if (nc) {
      if (nc.type === 'max') {
        // Buyer: open low
        value = Math.round((nc.value * params.initialFactor.max) / 1000) * 1000;
      } else {
        // Seller: open high
        value = Math.round((nc.value * params.initialFactor.min) / 1000) * 1000;
      }
    } else {
      value = 100000;
    }

    const message = pick([
      `I'd like to open with ${formatINR(value)}. Based on my requirements and the current market, I believe this is a fair starting point.`,
      `After careful consideration, my opening offer is ${formatINR(value)}. I'm looking forward to reaching a mutually beneficial agreement.`,
      `I'm pleased to begin our negotiation with ${formatINR(value)}. This reflects my goals and the value I see in this opportunity.`,
      `Let's start at ${formatINR(value)}. I believe there's good potential here and I'd like to find a deal that works for both of us.`,
    ]);

    return {
      message,
      offer:    value,
      decision: 'counter_offer',
      reason:   'Initial offer based on goals and constraints',
      action:   'OFFER',
    };
  }

  _accept(agent, opponentOffer) {
    const message = pick([
      `I'm happy to accept your offer of ${formatINR(opponentOffer)}. We have a deal!`,
      `${formatINR(opponentOffer)} works perfectly for me. I'm glad we could reach an agreement.`,
      `Excellent — I accept ${formatINR(opponentOffer)}. Let's move forward with this.`,
      `That's acceptable. I accept your offer of ${formatINR(opponentOffer)}. Looking forward to working together.`,
    ]);

    return {
      message,
      offer:    opponentOffer,
      decision: 'accept',
      reason:   'Offer satisfies all constraints and acceptance threshold',
      action:   'ACCEPT',
    };
  }

  _reject(agent, opponentOffer) {
    const message = pick([
      `I appreciate the negotiation, but ${formatINR(opponentOffer)} doesn't work for me given my constraints. I'll have to decline.`,
      `Unfortunately, we've reached an impasse. ${formatINR(opponentOffer)} is not something I can accept.`,
      `Despite our efforts, I can't accept ${formatINR(opponentOffer)}. Thank you for the discussion.`,
      `I'm afraid ${formatINR(opponentOffer)} doesn't meet my minimum requirements. I need to walk away from this one.`,
    ]);

    return {
      message,
      offer:    null,
      decision: 'reject',
      reason:   'Offer violates hard constraint and maximum rounds reached',
      action:   'REJECT',
    };
  }

  _counterOffer(agent, nc, opponentOffer, myLastOffer, params, round, maxRounds) {
    // Urgency increases in later rounds → bigger moves
    const urgency         = Math.min(round / maxRounds, 0.8);
    const effectiveRate   = params.concessionRate * (1 + urgency * 2.5);

    let newOffer;
    if (nc) {
      if (nc.type === 'max') {
        // Buyer: move UP toward opponent
        const base = myLastOffer ?? (nc.value * params.initialFactor.max);
        const gap  = opponentOffer - base;
        newOffer   = base + (gap * effectiveRate);
        newOffer   = Math.min(newOffer, nc.value);           // never exceed budget
      } else {
        // Seller: move DOWN toward opponent
        const base = myLastOffer ?? (nc.value * params.initialFactor.min);
        const gap  = base - opponentOffer;
        newOffer   = base - (gap * effectiveRate);
        newOffer   = Math.max(newOffer, nc.value);           // never go below minimum
      }
    } else {
      // No numeric constraint — move 20% toward opponent
      newOffer = (myLastOffer ?? opponentOffer) + (opponentOffer - (myLastOffer ?? opponentOffer)) * 0.20;
    }

    newOffer = Math.round(newOffer / 1000) * 1000;

    const message = pick([
      `I understand your position, but I need to stay within my constraints. How about ${formatINR(newOffer)}?`,
      `Your offer of ${formatINR(opponentOffer)} is noted. I can move to ${formatINR(newOffer)} — let's see if we can meet somewhere in the middle.`,
      `I'm moving in your direction. My revised offer is ${formatINR(newOffer)}. I hope we can find a fair resolution.`,
      `Let me counter with ${formatINR(newOffer)}. I believe this is a reasonable compromise given both our positions.`,
      `I've considered your proposal carefully. ${formatINR(newOffer)} is where I can go right now. Over to you.`,
    ]);

    return {
      message,
      offer:    newOffer,
      decision: 'counter_offer',
      reason:   `Counter offer at ${(effectiveRate * 100).toFixed(1)}% concession (round ${round}/${maxRounds})`,
      action:   'COUNTEROFFER',
    };
  }
}

// ============================================================
// LLMDecisionProvider — stub for Milestone 2
// ============================================================

class LLMDecisionProvider extends AgentDecisionProvider {
  async decide(agent, session) {
    // Will be implemented in Milestone 2 using Gemini / llm.service.js
    throw new Error('LLMDecisionProvider is not yet implemented. Use RuleBasedDecisionProvider for Milestone 1.');
  }

  evaluateOffer(agent, offer) {
    throw new Error('LLMDecisionProvider.evaluateOffer() not yet implemented.');
  }
}

module.exports = {
  AgentDecisionProvider,
  RuleBasedDecisionProvider,
  LLMDecisionProvider,
  PERSONALITY_PARAMS,
};
