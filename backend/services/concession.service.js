/**
 * services/concession.service.js
 * Tracks and calculates concession data for every offer made in a negotiation.
 *
 * Concession record:
 * ├── round               which round the offer was made
 * ├── previousOffer       the agent's prior offer value (null on first offer)
 * ├── currentOffer        the new offer value
 * ├── concessionAmount    absolute change |current - previous|
 * ├── concessionPercentage percentage change relative to previous offer
 * ├── direction           INCREASE | DECREASE | NO_CHANGE
 * └── timestamp           ISO timestamp
 */

const logger = require('../utils/logger');

/**
 * Concession direction constants.
 */
const DIRECTION = {
  INCREASE:  'INCREASE',
  DECREASE:  'DECREASE',
  NO_CHANGE: 'NO_CHANGE',
};

/**
 * Calculate concession data between two offer values.
 * @param {number|null} previousOffer
 * @param {number}      currentOffer
 * @returns {object} concession metrics
 */
function calculateConcession(previousOffer, currentOffer) {
  if (previousOffer === null || previousOffer === undefined) {
    return {
      previousOffer:       null,
      currentOffer,
      concessionAmount:    0,
      concessionPercentage: 0,
      direction:           DIRECTION.NO_CHANGE,
    };
  }

  const diff             = currentOffer - previousOffer;
  const concessionAmount = Math.abs(diff);
  const concessionPct    = previousOffer !== 0
    ? parseFloat(((concessionAmount / Math.abs(previousOffer)) * 100).toFixed(2))
    : 0;

  let direction;
  if (diff > 0)      direction = DIRECTION.INCREASE;
  else if (diff < 0) direction = DIRECTION.DECREASE;
  else               direction = DIRECTION.NO_CHANGE;

  return {
    previousOffer,
    currentOffer,
    concessionAmount,
    concessionPercentage: concessionPct,
    direction,
  };
}

/**
 * Track a new offer for an agent — appends to session.concessionHistory.
 * Call this BEFORE updating session.offers[agentId] with the new value.
 *
 * @param {object} session  — live negotiation session
 * @param {string} agentId
 * @param {number} newOffer
 * @returns {object} concession record that was just added
 */
function trackConcession(session, agentId, newOffer) {
  const previousOffer = session.offers[agentId] ?? null;
  const concession    = calculateConcession(previousOffer, newOffer);

  // Initialise structure if missing (backwards compat)
  if (!session.concessionHistory)        session.concessionHistory = {};
  if (!session.concessionHistory[agentId]) session.concessionHistory[agentId] = [];

  const record = {
    round: session.currentRound,
    timestamp: new Date().toISOString(),
    ...concession,
  };

  session.concessionHistory[agentId].push(record);

  logger.info('Concession',
    `${agentId} | Round ${session.currentRound} | ${previousOffer ?? 'initial'} → ${newOffer}` +
    ` | ${concession.direction} ${concession.concessionAmount} (${concession.concessionPercentage}%)`
  );

  return record;
}

/**
 * Get full concession history for a specific agent.
 * @param {object} session
 * @param {string} agentId
 * @returns {object[]}
 */
function getConcessionHistory(session, agentId) {
  return session.concessionHistory?.[agentId] || [];
}

/**
 * Build a summary of all concessions for every agent.
 * @param {object} session
 * @returns {object} { [agentId]: { agentName, totalConcession, rounds, history } }
 */
function getConcessionSummary(session) {
  const summary = {};

  for (const agent of session.agents) {
    const history        = getConcessionHistory(session, agent.id);
    const totalConcession = history.reduce((sum, c) => sum + c.concessionAmount, 0);

    summary[agent.id] = {
      agentName: agent.name,
      totalConcession,
      totalConcessionPct: history.length > 0
        ? parseFloat(history.reduce((sum, c) => sum + c.concessionPercentage, 0).toFixed(2))
        : 0,
      rounds:  history.length,
      history,
    };
  }

  return summary;
}

module.exports = {
  DIRECTION,
  calculateConcession,
  trackConcession,
  getConcessionHistory,
  getConcessionSummary,
};
