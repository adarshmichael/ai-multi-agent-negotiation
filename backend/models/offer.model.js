/**
 * models/offer.model.js
 * Standard Offer structure used across all negotiation scenarios.
 *
 * Offer
 * ├── offerId         unique identifier
 * ├── agentId         who made this offer
 * ├── roundNumber     which round this offer belongs to
 * ├── value           numeric offer value (null for ACCEPT/REJECT without counter)
 * ├── terms           scenario-specific key-value terms
 * ├── reason          human-readable reason for this offer
 * ├── timestamp       ISO timestamp
 * └── action          OFFER | COUNTEROFFER | ACCEPT | REJECT
 */

const { generateOfferSnapshotId } = require('../utils/idGenerator');

/**
 * Offer action types — reusable across scenarios.
 */
const ACTION = {
  OFFER:        'OFFER',
  COUNTEROFFER: 'COUNTEROFFER',
  ACCEPT:       'ACCEPT',
  REJECT:       'REJECT',
};

/**
 * Create a standard Offer object.
 * @param {object} params
 * @returns {object} Offer
 */
function createOffer({ agentId, roundNumber, value = null, terms = {}, reason = '', action = ACTION.OFFER }) {
  if (!ACTION[action]) {
    throw new Error(
      `Invalid offer action: "${action}". Must be one of: ${Object.values(ACTION).join(', ')}`
    );
  }

  return {
    offerId: generateOfferSnapshotId(),
    agentId,
    roundNumber,
    value: value !== null && value !== undefined ? Math.round(Number(value)) : null,
    terms,
    reason,
    timestamp: new Date().toISOString(),
    action,
  };
}

/**
 * Validate an Offer object and return an array of error messages.
 * @param {object} offer
 * @returns {string[]} errors — empty array means valid
 */
function validateOffer(offer) {
  const errors = [];

  if (!offer.agentId) errors.push('agentId is required');
  if (!offer.roundNumber || offer.roundNumber < 1) errors.push('roundNumber must be >= 1');
  if (!ACTION[offer.action]) errors.push(`action must be one of: ${Object.values(ACTION).join(', ')}`);

  if (offer.action === ACTION.OFFER || offer.action === ACTION.COUNTEROFFER) {
    if (offer.value === null || offer.value === undefined) {
      errors.push('value is required for OFFER and COUNTEROFFER actions');
    } else if (typeof offer.value === 'number' && (isNaN(offer.value) || offer.value <= 0)) {
      errors.push('value must be a positive number');
    }
  }

  return errors;
}

/**
 * Map from a decision string (used internally) to an ACTION constant.
 */
function decisionToAction(decision) {
  switch (decision) {
    case 'accept':       return ACTION.ACCEPT;
    case 'reject':       return ACTION.REJECT;
    case 'counter_offer': return ACTION.COUNTEROFFER;
    default:             return ACTION.OFFER;
  }
}

module.exports = { ACTION, createOffer, validateOffer, decisionToAction };
