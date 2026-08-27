/**
 * agents/SellerAgent.js
 * Specializes BaseAgent for seller-type roles.
 * Seller agents have a minimum price they must never go below.
 */

const BaseAgent = require('./BaseAgent');

class SellerAgent extends BaseAgent {
  constructor(config, scenario) {
    super(config, scenario);
    this.agentType = 'seller';
  }

  /**
   * Override: Sellers start by anchoring HIGH.
   * Returns an initial offer value based on personality.
   */
  getOpeningOfferHint(targetRange) {
    if (!targetRange) return null;
    const { min, max } = targetRange;
    const spread = max - min;

    switch (this.personality) {
      case 'aggressive':
        return Math.round(max - spread * 0.05);   // Very high anchor
      case 'collaborative':
        return Math.round(max - spread * 0.25);   // Reasonable starting point
      case 'risk-averse':
        return Math.round(max - spread * 0.15);   // Conservative high
      default:
        return Math.round(max - spread * 0.15);
    }
  }
}

module.exports = SellerAgent;
