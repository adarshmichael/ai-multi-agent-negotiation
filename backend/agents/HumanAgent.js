/**
 * agents/HumanAgent.js
 * Represents a human participant in Practice Mode.
 * The engine pauses for this agent's turn and waits for WebSocket input.
 */

const BaseAgent = require('./BaseAgent');

class HumanAgent extends BaseAgent {
  constructor(config, scenario) {
    super(config, scenario);
    this.type = 'human';
    this.personality = config.personality || 'human';
  }

  /**
   * Override: Human agents do not call LLM.
   * The engine will detect this type and pause to await human WS input.
   */
  buildPrompt() {
    return null; // Not used for human agents
  }

  /**
   * Validate a human-submitted response against hard constraints.
   * @param {object} response — { message, offer, decision }
   */
  validateResponse(response) {
    if (!response || typeof response !== 'object') {
      throw new Error('Invalid human turn submission format.');
    }

    // Default decision
    if (!response.decision || !['counter_offer', 'accept', 'reject'].includes(response.decision)) {
      response.decision = response.offer !== null && response.offer !== undefined
        ? 'counter_offer'
        : 'reject';
    }

    // Default message
    if (!response.message || typeof response.message !== 'string' || !response.message.trim()) {
      response.message = `I offer ₹${Number(response.offer).toLocaleString('en-IN')}.`;
    }

    // Enforce numeric hard constraints (same as AI agents)
    if (response.offer !== null && response.offer !== undefined && this.numericConstraint) {
      const { type, value } = this.numericConstraint;
      if (type === 'max' && response.offer > value) {
        response.offer = value;
        response.message += ` (Clamped to your maximum limit of ₹${value.toLocaleString('en-IN')}.)`;
      }
      if (type === 'min' && response.offer < value) {
        response.offer = value;
        response.message += ` (Clamped to your minimum limit of ₹${value.toLocaleString('en-IN')}.)`;
      }
    }

    // Ensure offer is a valid number or null
    if (response.offer !== null && response.offer !== undefined) {
      response.offer = Math.round(Number(response.offer));
      if (isNaN(response.offer)) response.offer = null;
    }

    return response;
  }
}

module.exports = HumanAgent;
