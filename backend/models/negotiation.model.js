/**
 * models/negotiation.model.js
 * Factory for creating and managing negotiation session state.
 *
 * NegotiationState
 * ├── id                  session identifier
 * ├── scenarioId
 * ├── scenario            { name, description }
 * ├── status              STATUS constant
 * ├── mode                simulation | practice
 * ├── currentRound        1-based round counter
 * ├── maxRounds
 * ├── currentAgentTurn    agentId of the agent expected to act next
 * ├── currentAgentIndex   numeric index (for array access)
 * ├── agents              array of agent configs (with goals, constraints, personality)
 * ├── messages            all chat messages in order (for UI display)
 * ├── negotiationHistory  structured history items (for LLM/reporting)
 * ├── offers              { [agentId]: latestOfferAmount }
 * ├── initialOffers       { [agentId]: firstOfferAmount }
 * ├── concessionHistory   { [agentId]: [concession records] }
 * ├── agreement           { offer, reason } | null
 * ├── result              RESULT constant
 * ├── resultReason
 * ├── startedAt
 * ├── updatedAt
 * └── completedAt
 */

const { generateNegotiationId } = require('../utils/idGenerator');

/**
 * Negotiation statuses.
 * Maps to the engine lifecycle stages.
 */
const STATUS = {
  CREATED:     'created',       // session exists, not yet started (NOT_STARTED equivalent)
  STARTING:    'starting',      // engine being initialized
  IN_PROGRESS: 'in_progress',   // actively running
  AGREEMENT:   'agreement',     // terminal — deal reached (sets final status to COMPLETED)
  REJECTED:    'rejected',      // terminal — explicit rejection
  DEADLOCK:    'deadlock',      // terminal — no progress possible
  COMPLETED:   'completed',     // final closed state after any terminal condition
  FAILED:      'failed',        // internal error
  STOPPED:     'stopped',       // user stopped
};

/**
 * Negotiation result types.
 */
const RESULT = {
  AGREEMENT:  'agreement',
  REJECTION:  'rejection',
  MAX_ROUNDS: 'max_rounds',
  STOPPED:    'stopped',
  ERROR:      'error',
};

/**
 * Create a new negotiation session.
 * @param {object} params
 * @returns {object} negotiation session (live, not serialized)
 */
function createNegotiation({ scenarioId, scenario, agents, maxRounds, mode }) {
  const id  = generateNegotiationId();
  const now = new Date().toISOString();

  return {
    id,
    scenarioId,
    scenario,                         // { name, description }
    status:             STATUS.CREATED,
    mode:               mode || 'simulation',
    currentRound:       0,
    maxRounds:          maxRounds || 10,
    currentAgentTurn:   null,         // set when engine starts
    currentAgentIndex:  0,
    agents,                           // array of agent configs (with goals, constraints, personality)
    messages:           [],           // chronological chat messages (UI display)
    negotiationHistory: [],           // structured history items for reporting / LLM context
    offers:             {},           // { [agentId]: latestOfferAmount }
    initialOffers:      {},           // { [agentId]: firstOfferAmount }
    concessionHistory:  {},           // { [agentId]: [concession records] }
    agreement:          null,         // { offer, reason } or null
    result:             null,         // RESULT constant
    resultReason:       null,
    startedAt:          now,
    updatedAt:          now,
    completedAt:        null,
    websocketClients:   new Set(),    // connected WS clients (not serialized)
  };
}

/**
 * Append an item to the structured negotiationHistory array.
 * This is richer than the messages array — includes action, offer, reason.
 *
 * @param {object} session
 * @param {object} item — { round, agentId, agentName, action, offer, reason, timestamp }
 */
function appendNegotiationHistory(session, item) {
  session.negotiationHistory.push({
    round:     item.round,
    agentId:   item.agentId,
    agentName: item.agentName,
    action:    item.action,           // OFFER | COUNTEROFFER | ACCEPT | REJECT
    offer:     item.offer ?? null,
    reason:    item.reason || '',
    timestamp: item.timestamp || new Date().toISOString(),
  });
  session.updatedAt = new Date().toISOString();
}

/**
 * Serialize a negotiation session for HTTP responses (strips non-serializable fields).
 */
function serializeNegotiation(neg) {
  // eslint-disable-next-line no-unused-vars
  const { websocketClients, ...rest } = neg;
  return rest;
}

module.exports = {
  createNegotiation,
  appendNegotiationHistory,
  serializeNegotiation,
  STATUS,
  RESULT,
};
