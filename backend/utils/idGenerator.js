/**
 * utils/idGenerator.js
 * Generate unique IDs for negotiations and messages.
 */

const { v4: uuidv4 } = require('uuid');

function generateNegotiationId() {
  const year = new Date().getFullYear();
  const short = uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase();
  return `NEG-${year}-${short}`;
}

function generateMessageId(round, agentId) {
  return `MSG-R${round}-${agentId}-${Date.now()}`;
}

function generateOfferSnapshotId() {
  return `OFFER-${Date.now()}`;
}

module.exports = { generateNegotiationId, generateMessageId, generateOfferSnapshotId };
