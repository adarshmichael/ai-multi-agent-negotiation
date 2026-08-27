/**
 * agents/BaseAgent.js
 * Abstract base class for all negotiation agents.
 * All agents extend this and inherit prompt-building + constraint enforcement.
 */

const { buildPrompt } = require('../utils/promptBuilder');
const logger = require('../utils/logger');

class BaseAgent {
  /**
   * @param {object} config  — from agent.model createAgentConfig()
   * @param {object} scenario — { name, description }
   */
  constructor(config, scenario) {
    this.id = config.id;
    this.name = config.name;
    this.role = config.role;
    this.goal = config.goal;
    this.constraints = config.constraints || [];
    this.personality = config.personality || 'collaborative';
    this.numericConstraint = config.numericConstraint || null;
    this.scenario = scenario;
    this.currentOffer = null;
    this.initialOffer = null;
    this.decision = null;
  }

  /**
   * Build the LLM prompt for this agent's turn.
   */
  buildPrompt({ history, opponent, round, maxRounds, offerState }) {
    return buildPrompt({
      agent: {
        id: this.id,
        name: this.name,
        role: this.role,
        goal: this.goal,
        constraints: this.constraints,
        personality: this.personality,
        numericConstraint: this.numericConstraint,
      },
      scenario: this.scenario,
      history,
      opponent,
      round,
      maxRounds,
      offerState,
    });
  }

  /**
   * Validate and clamp an LLM response to ensure constraint compliance.
   * If the offer violates a hard constraint, it is clamped to the limit.
   *
   * @param {object} response — { message, offer, decision, reasoning }
   * @returns {object}        — validated and possibly adjusted response
   */
  validateResponse(response) {
    if (!response || typeof response !== 'object') {
      throw new Error(`${this.name}: LLM returned invalid response format`);
    }

    if (!response.message || typeof response.message !== 'string') {
      throw new Error(`${this.name}: LLM response missing 'message' field`);
    }

    if (!['counter_offer', 'accept', 'reject'].includes(response.decision)) {
      logger.warn('Agent', `${this.name}: invalid decision '${response.decision}', defaulting to counter_offer`);
      response.decision = 'counter_offer';
    }

    // Enforce numeric hard constraints
    if (response.offer !== null && response.offer !== undefined && this.numericConstraint) {
      const { type, value } = this.numericConstraint;

      if (type === 'max' && response.offer > value) {
        logger.warn('Agent', `${this.name}: offer ${response.offer} exceeds max ${value} — clamping`);
        response.offer = value;
        response.message += ` (This is my maximum offer.)`;
      }

      if (type === 'min' && response.offer < value) {
        logger.warn('Agent', `${this.name}: offer ${response.offer} below min ${value} — clamping`);
        response.offer = value;
        response.message += ` (This is my minimum acceptable price.)`;
      }
    }

    // Ensure offer is a number or null
    if (response.offer !== null && response.offer !== undefined) {
      response.offer = Math.round(Number(response.offer));
      if (isNaN(response.offer)) response.offer = null;
    }

    // Strip private reasoning — never send to frontend
    delete response.reasoning;

    return response;
  }

  toConfig() {
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      goal: this.goal,
      constraints: this.constraints,
      personality: this.personality,
      numericConstraint: this.numericConstraint,
      currentOffer: this.currentOffer,
      initialOffer: this.initialOffer,
      decision: this.decision,
    };
  }
}

module.exports = BaseAgent;
