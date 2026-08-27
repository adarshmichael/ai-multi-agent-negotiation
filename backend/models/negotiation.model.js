/**
 * models/negotiation.model.js
 * Factory for creating and managing negotiation session state.
 */

const { generateNegotiationId } = require('../utils/idGenerator');

/**
 * Negotiation statuses
 */
const STATUS = {
  CREATED: 'created',
  STARTING: 'starting',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  STOPPED: 'stopped',
};

/**
 * Negotiation result types
 */
const RESULT = {
  AGREEMENT: 'agreement',
  REJECTION: 'rejection',
  MAX_ROUNDS: 'max_rounds',
  STOPPED: 'stopped',
  ERROR: 'error',
};

/**
 * Create a new negotiation session.
 * @param {object} params
 * @returns {object} negotiation session
 */
function createNegotiation({ scenarioId, scenario, agents, maxRounds, mode }) {
  const id = generateNegotiationId();
  const now = new Date().toISOString();

  return {
    id,
    scenarioId,
    scenario,                         // { name, description }
    status: STATUS.CREATED,
    mode: mode || 'simulation',       // simulation | practice
    currentRound: 0,
    maxRounds: maxRounds || 10,
    currentAgentIndex: 0,             // index into agents array
    agents,                           // array of agent configs
    messages: [],                     // all messages in order
    offers: {},                       // { [agentId]: latestOfferAmount }
    initialOffers: {},                // { [agentId]: firstOfferAmount }
    agreement: null,                  // { agentId, offer, round, acceptedBy } or null
    result: null,                     // RESULT constant
    resultReason: null,
    startedAt: now,
    completedAt: null,
    websocketClients: new Set(),      // connected WS clients (not serialized)
  };
}

/**
 * Serialize a negotiation session for HTTP responses (strips non-serializable fields).
 */
function serializeNegotiation(neg) {
  const { websocketClients, ...rest } = neg;
  return rest;
}

module.exports = { createNegotiation, serializeNegotiation, STATUS, RESULT };
