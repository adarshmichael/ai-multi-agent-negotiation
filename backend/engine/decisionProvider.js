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

const logger                                = require('../utils/logger');
const { generateCounteroffer }              = require('../services/counteroffer.service');

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
const { PERSONALITY_PARAMS, DEFAULT_PARAMS } = require('../config/personalityParams');

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

    // Check deterministic evaluation (Module 2)
    const evaluation = session._latestEvaluation;
    if (evaluation && evaluation.recommendation) {
      if (evaluation.recommendation === 'ACCEPT') {
        return this._accept(agent, opponentOffer);
      } else if (evaluation.recommendation === 'REJECT') {
        return this._reject(agent, opponentOffer);
      }
    }

    // If deterministic evaluation didn't catch it, fallback to default behavior
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
    // ── Module 3: delegate all concession math to generateCounteroffer() ──
    const counterResult = generateCounteroffer({
      agent,
      opponentOffer,
      currentRound: round,
      maxRounds,
    });

    const newOffer = counterResult.proposed_offer.price;

    const message = pick([
      `I understand your position, but I need to stay within my constraints. How about ${formatINR(newOffer)}?`,
      `Your offer of ${formatINR(opponentOffer)} is noted. I can move to ${formatINR(newOffer)} — let's see if we can meet somewhere in the middle.`,
      `I'm moving in your direction. My revised offer is ${formatINR(newOffer)}. I hope we can find a fair resolution.`,
      `Let me counter with ${formatINR(newOffer)}. I believe this is a reasonable compromise given both our positions.`,
      `I've considered your proposal carefully. ${formatINR(newOffer)} is where I can go right now. Over to you.`,
    ]);

    return {
      message,
      offer:        newOffer,
      decision:     'counter_offer',
      reason:       counterResult.reason,
      action:       'COUNTEROFFER',
      counterResult,   // full Module 3 result — available for UI and LLM context
    };
  }
}

// ============================================================
// LLMDecisionProvider — stub for Milestone 2
// ============================================================

const { generateAgentResponse } = require('../services/llm.service');
const { buildPrompt } = require('../utils/promptBuilder');

class LLMDecisionProvider extends AgentDecisionProvider {
  async decide(agent, session) {
    // Find the opponent's last message to include in the prompt
    const opponentMessage = [...session.messages].reverse().find(m => m.agentId !== agent.id) || null;
    let opponentInfo = null;
    if (opponentMessage) {
      opponentInfo = {
        agentName: opponentMessage.agentName,
        message: opponentMessage.message,
        offer: opponentMessage.offer
      };
    }

    // Determine the deterministic decision to pass to the LLM for context
    let deterministicDecision = null;
    const evaluation = session._latestEvaluation;
    if (evaluation && evaluation.recommendation) {
      deterministicDecision = evaluation.recommendation; // 'ACCEPT' | 'COUNTER' | 'REJECT'
    }

    // Retrieve latest concession snapshot (computed after trackConcession in Engine)
    const concessionState = session._latestConcessionSnapshot || null;

    const prompt = buildPrompt({
      agent,
      scenario: session.scenario,
      history: session.messages,
      opponent: opponentInfo,
      round: session.currentRound,
      maxRounds: session.maxRounds,
      offerState: session.offers,
      // Module 1–4 context
      evaluation:    evaluation || null,
      decision:      deterministicDecision,
      counterResult: null,   // will be generated post-LLM; pre-pass is null on first call
      concession:    concessionState,
    });

    const response = await generateAgentResponse(
      prompt,
      agent.name,
      agent,
      session.currentRound,
      session.maxRounds,
      session.offers
    );

    // Normalize decision string (COUNTER -> counter_offer, ACCEPT -> accept, REJECT -> reject)
    let decision = (response.decision || 'counter_offer').toLowerCase().trim();
    if (decision.includes('accept')) {
      decision = 'accept';
    } else if (decision.includes('reject')) {
      decision = 'reject';
    } else {
      decision = 'counter_offer';
    }

    // Sanitize and parse numeric offer
    let offer = null;
    if (typeof response.offer === 'number' && !isNaN(response.offer)) {
      offer = Math.round(response.offer);
    } else if (typeof response.offer === 'string') {
      const cleaned = response.offer.replace(/[^\d.-]/g, '');
      const parsed = parseFloat(cleaned);
      if (!isNaN(parsed)) offer = Math.round(parsed);
    }

    if (decision === 'accept' && offer === null && opponentInfo?.offer) {
      offer = opponentInfo.offer;
    }

    // ---- Phase 7: Strict Backend Constraint Enforcement & Deterministic Logic (Module 2) ----
    const nc = agent.numericConstraint;
    let constraintNote = '';

    // Use 'evaluation' already resolved above (session._latestEvaluation)
    if (evaluation && evaluation.recommendation) {
      if (evaluation.recommendation === 'REJECT') {
        logger.warn('Engine', `Module 2 Logic: Forcing REJECT for ${agent.name} due to hard constraint violation.`);
        decision = 'reject';
        offer = null;
        constraintNote = ` [Deterministic Logic: Rejected because offer violated hard constraints]`;
      } else if (evaluation.recommendation === 'ACCEPT') {
        logger.warn('Engine', `Module 2 Logic: Forcing ACCEPT for ${agent.name} as constraints and targets are satisfied.`);
        decision = 'accept';
        offer = opponentInfo?.offer ?? null;
        constraintNote = ` [Deterministic Logic: Accepted because offer meets target criteria]`;
      }
    }

    if (decision !== 'accept' && decision !== 'reject' && nc && typeof offer === 'number') {
      if (nc.type === 'max' && offer > nc.value) {
        logger.warn('Engine', `Constraint violation by ${agent.name}: proposed ₹${offer} > max budget ₹${nc.value}. Clamping.`);
        offer = nc.value;
        constraintNote = ` [Constraint Enforced: Clamped to budget ceiling ${formatINR(nc.value)}]`;
      } else if (nc.type === 'min' && offer < nc.value) {
        logger.warn('Engine', `Constraint violation by ${agent.name}: proposed ₹${offer} < minimum price ₹${nc.value}. Clamping.`);
        offer = nc.value;
        constraintNote = ` [Constraint Enforced: Clamped to floor price ${formatINR(nc.value)}]`;
      }
    }

    // Constraint check on acceptance (fallback if deterministic logic didn't catch it)
    if (decision === 'accept' && nc && opponentInfo?.offer) {
      if (nc.type === 'max' && opponentInfo.offer > nc.value) {
        logger.warn('Engine', `Constraint violation by ${agent.name}: cannot accept ₹${opponentInfo.offer} > max budget ₹${nc.value}. Overriding to counter.`);
        decision = 'counter_offer';
        offer = nc.value;
        constraintNote = ` [Constraint Enforced: Cannot accept above budget limit ${formatINR(nc.value)}]`;
      } else if (nc.type === 'min' && opponentInfo.offer < nc.value) {
        logger.warn('Engine', `Constraint violation by ${agent.name}: cannot accept ₹${opponentInfo.offer} < min price ₹${nc.value}. Overriding to counter.`);
        decision = 'counter_offer';
        offer = nc.value;
        constraintNote = ` [Constraint Enforced: Cannot accept below minimum price ${formatINR(nc.value)}]`;
      }
    }

    // Determine semantic action label
    let action = 'OFFER';
    if (decision === 'counter_offer') {
      const hasPriorOffers = session.messages.some(m => m.offer !== null && m.offer !== undefined);
      action = (session.currentRound <= 1 && !hasPriorOffers) ? 'OFFER' : 'COUNTEROFFER';
    } else if (decision === 'accept') {
      action = 'ACCEPT';
    } else {
      action = 'REJECT';
    }

    const reasoning = (response.reasoning || 'Evaluated context, goals, and constraints.') + constraintNote;

    // ── Module 3: generate / validate counteroffer for COUNTER decisions ──
    let counterResult = null;
    if (decision === 'counter_offer' && typeof offer === 'number' && opponentInfo?.offer) {
      try {
        counterResult = generateCounteroffer({
          agent,
          opponentOffer: opponentInfo.offer,
          session,
        });
        // If the LLM offer diverges significantly (> 5 %) from strategy, correct it
        const strategicPrice = counterResult.proposed_offer.price;
        const divergencePct  = Math.abs(offer - strategicPrice) / (strategicPrice || 1);
        if (divergencePct > 0.05) {
          logger.warn('Engine',
            `LLM offer ₹${offer} diverges ${(divergencePct * 100).toFixed(1)}% from Module 3 strategic price ₹${strategicPrice}. Correcting.`
          );
          offer = strategicPrice;
        }
      } catch (cErr) {
        logger.warn('Engine', `Module 3 counteroffer generation failed: ${cErr.message}`);
      }
    }

    return {
      message: response.message || `I have decided to ${decision}.`,
      offer,
      decision,
      reason: reasoning,
      parameters:   response.parameters || {},
      action,
      counterResult,   // full Module 3 result — null when not COUNTER
    };
  }

  evaluateOffer(agent, offer) {
    const nc = agent.numericConstraint;
    const satisfied = this.evaluateConstraint(nc, offer);
    return {
      acceptable: satisfied,
      constraintSatisfied: satisfied,
      reason: satisfied ? 'Offer satisfies constraints.' : 'Offer violates constraints.',
    };
  }
}

module.exports = {
  AgentDecisionProvider,
  RuleBasedDecisionProvider,
  LLMDecisionProvider,
  PERSONALITY_PARAMS,
};
