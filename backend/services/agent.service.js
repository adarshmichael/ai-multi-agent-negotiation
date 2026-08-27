/**
 * services/agent.service.js
 * Initializes agent instances from session configs using the correct class.
 */

const BuyerAgent = require('../agents/BuyerAgent');
const SellerAgent = require('../agents/SellerAgent');
const CustomAgent = require('../agents/CustomAgent');
const logger = require('../utils/logger');

/**
 * Create an agent instance from a config object.
 * @param {object} agentConfig  — from negotiation session agents array
 * @param {object} scenario     — { name, description }
 * @returns {BaseAgent}
 */
function createAgentInstance(agentConfig, scenario) {
  let agent;

  switch (agentConfig.agentType) {
    case 'buyer':
      agent = new BuyerAgent(agentConfig, scenario);
      break;
    case 'seller':
      agent = new SellerAgent(agentConfig, scenario);
      break;
    default:
      agent = new CustomAgent(agentConfig, scenario);
  }

  logger.agent(`Initialized: ${agent.name} | Role: ${agent.role} | Personality: ${agent.personality} | Type: ${agentConfig.agentType || 'custom'}`);
  return agent;
}

/**
 * Initialize all agents for a negotiation session.
 * @param {object} session
 * @returns {BaseAgent[]}
 */
function initializeAgents(session) {
  return session.agents.map(agentConfig =>
    createAgentInstance(agentConfig, session.scenario)
  );
}

module.exports = { createAgentInstance, initializeAgents };
