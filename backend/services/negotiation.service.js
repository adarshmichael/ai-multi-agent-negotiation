/**
 * services/negotiation.service.js
 * In-memory negotiation session store.
 * Structured so PostgreSQL can be added later without changing the engine.
 */

const { createNegotiation, serializeNegotiation, STATUS } = require('../models/negotiation.model');
const { createAgentConfig } = require('../models/agent.model');
const logger = require('../utils/logger');

// In-memory store: Map<negotiationId, session>
const sessions = new Map();

// Scenario data (mirrors frontend scenarios.js — single source of truth)
const SCENARIOS = [
  {
    id: 'vendor-pricing',
    name: 'Vendor Pricing Negotiation',
    description: 'A buyer and a vendor negotiate the price of goods or services, balancing budget limits against profit margins.',
    icon: 'cart',
    agents: [
      {
        id: 'buyer',
        name: 'Buyer',
        role: 'Customer / Buyer',
        goal: 'Get the best possible price',
        constraints: ['Limited budget', 'Must adhere to procurement policies'],
        numericConstraint: { type: 'max', value: 800000 },  // Max ₹8,00,000
        agentType: 'buyer',
      },
      {
        id: 'vendor',
        name: 'Vendor',
        role: 'Seller / Vendor',
        goal: 'Maximize profit',
        constraints: ['Minimum acceptable price', 'Cannot compromise on quality terms'],
        numericConstraint: { type: 'min', value: 700000 },  // Min ₹7,00,000
        agentType: 'seller',
      },
    ],
  },
  {
    id: 'job-offer',
    name: 'Job Offer Negotiation',
    description: 'A candidate and an employer negotiate compensation and benefits within the constraints of a hiring budget.',
    icon: 'briefcase',
    agents: [
      {
        id: 'candidate',
        name: 'Candidate',
        role: 'Job Candidate',
        goal: 'Get the best overall compensation and benefits',
        constraints: ['Minimum acceptable compensation', 'Must include standard benefits package'],
        numericConstraint: { type: 'min', value: 1200000 },  // Min ₹12 LPA
        agentType: 'buyer',
      },
      {
        id: 'employer',
        name: 'Employer',
        role: 'Hiring Manager / Employer',
        goal: 'Hire the candidate within the company\'s budget',
        constraints: ['Fixed hiring budget / compensation range', 'Must comply with internal salary bands'],
        numericConstraint: { type: 'max', value: 1800000 },  // Max ₹18 LPA
        agentType: 'seller',
      },
    ],
  },
  {
    id: 'budget-allocation',
    name: 'Project Budget Allocation',
    description: 'A project manager and a finance manager negotiate how much budget a project should receive.',
    icon: 'chart',
    agents: [
      {
        id: 'project-manager',
        name: 'Project Manager',
        role: 'Project Manager',
        goal: 'Secure enough budget to successfully complete the project',
        constraints: ['Limited overall project budget', 'Must deliver core features without compromise'],
        numericConstraint: { type: 'min', value: 2000000 },  // Needs at least ₹20L
        agentType: 'buyer',
      },
      {
        id: 'finance-manager',
        name: 'Finance Manager',
        role: 'Finance Manager',
        goal: 'Control spending and optimize budget allocation',
        constraints: ['Fixed organizational budget', 'Quarterly spending limits must be respected'],
        numericConstraint: { type: 'max', value: 3000000 },  // Max ₹30L available
        agentType: 'seller',
      },
    ],
  },
];

function getAllScenarios() {
  return SCENARIOS;
}

function getScenarioById(id) {
  return SCENARIOS.find(s => s.id === id) || null;
}

/**
 * Create a new negotiation session from a configuration request.
 * @param {object} params — { scenario_id, agents: [{id, personality}], maxRounds, mode }
 * @returns {object} serialized session
 */
function createSession({ scenario_id, agents: agentPersonalities, maximum_rounds, mode }) {
  const scenarioDef = getScenarioById(scenario_id);
  if (!scenarioDef) {
    throw new Error(`Scenario not found: ${scenario_id}`);
  }

  // Build agent configs by merging scenario agent defs with user-selected personalities
  const agentConfigs = scenarioDef.agents.map(agentDef => {
    const userConfig = agentPersonalities?.find(a => a.id === agentDef.id);
    return createAgentConfig({
      ...agentDef,
      personality: userConfig?.personality || 'collaborative',
    });
  });

  const session = createNegotiation({
    scenarioId: scenario_id,
    scenario: { name: scenarioDef.name, description: scenarioDef.description },
    agents: agentConfigs,
    maxRounds: maximum_rounds || 10,
    mode: mode || 'simulation',
  });

  sessions.set(session.id, session);
  logger.negotiation(`Session created: ${session.id} | Scenario: ${scenarioDef.name}`);

  return serializeNegotiation(session);
}

function getSession(id) {
  const session = sessions.get(id);
  if (!session) return null;
  return session;  // return live reference (not serialized) for engine use
}

function getSerializedSession(id) {
  const session = sessions.get(id);
  if (!session) return null;
  return serializeNegotiation(session);
}

function updateSession(id, updates) {
  const session = sessions.get(id);
  if (!session) throw new Error(`Session not found: ${id}`);
  Object.assign(session, updates);
  return session;
}

function getAllSessions() {
  return Array.from(sessions.values()).map(serializeNegotiation);
}

module.exports = {
  getAllScenarios,
  getScenarioById,
  createSession,
  getSession,
  getSerializedSession,
  updateSession,
  getAllSessions,
};
