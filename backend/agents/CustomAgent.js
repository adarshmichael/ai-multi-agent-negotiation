/**
 * agents/CustomAgent.js
 * A generic agent for scenarios where role isn't strictly buyer/seller.
 * Used for Job Offer, Budget Allocation, etc.
 */

const BaseAgent = require('./BaseAgent');

class CustomAgent extends BaseAgent {
  constructor(config, scenario) {
    super(config, scenario);
    this.agentType = 'custom';
  }
}

module.exports = CustomAgent;
