/**
 * agents/BuyerAgent.js
 * Specializes BaseAgent for buyer-type roles.
 * Buyer agents have a maximum budget they must never exceed.
 */

const BaseAgent = require('./BaseAgent');

class BuyerAgent extends BaseAgent {
  constructor(config, scenario) {
    super(config, scenario);
    this.agentType = 'buyer';
  }

  /**
   * Override: Buyers start by anchoring LOW.
   * Returns an initial offer value based on personality.
   */
  getOpeningOfferHint(targetRange) {
    if (!targetRange) return null;
    const { min, max } = targetRange;
    const spread = max - min;

    switch (this.personality) {
      case 'aggressive':
        return Math.round(min + spread * 0.05);   // Very low anchor
      case 'collaborative':
        return Math.round(min + spread * 0.25);   // Reasonable starting point
      case 'risk-averse':
        return Math.round(min + spread * 0.15);   // Conservative low
      default:
        return Math.round(min + spread * 0.15);
    }
  }
}

module.exports = BuyerAgent;
