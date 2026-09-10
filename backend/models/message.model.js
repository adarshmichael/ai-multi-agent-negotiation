/**
 * models/message.model.js
 * Factory for creating negotiation message objects.
 */

const { generateMessageId } = require('../utils/idGenerator');

/**
 * Create a new message record.
 * @param {object} params
 * @returns {object} message
 */
function createMessage({ agentId, agentName, role, message, offer, round, decision, evaluation }) {
  return {
    id: generateMessageId(round, agentId),
    agentId,
    agentName,
    role,
    message,
    offer: offer ?? null,
    decision: decision || 'counter_offer',
    evaluation: evaluation || null,
    round,
    timestamp: new Date().toISOString(),
  };
}

module.exports = { createMessage };
