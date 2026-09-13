/**
 * services/evaluation.service.js
 * Agreement detection, offer validation, and deadlock detection.
 */

const logger = require('../utils/logger');

/**
 * Check if the negotiation has reached an agreement.
 * Agreement occurs when:
 *   1. An agent's decision is 'accept'
 *   2. Both agents' latest offers are within a small tolerance (auto-close gap)
 *
 * @param {object} session   — negotiation session
 * @param {object} lastMsg   — the message just generated { agentId, offer, decision }
 * @returns {{ agreed: boolean, finalOffer: number|null, reason: string|null }}
 */
function checkAgreement(session, lastMsg) {
  // Explicit acceptance
  if (lastMsg.decision === 'accept') {
    const opponentId = session.agents.find(a => a.id !== lastMsg.agentId)?.id;
    const opponentOffer = session.offers[opponentId];

    if (opponentOffer !== undefined && opponentOffer !== null) {
      logger.negotiation(`Agreement! ${lastMsg.agentId} accepted offer of ${opponentOffer}`);
      return {
        agreed: true,
        finalOffer: opponentOffer,
        reason: `${lastMsg.agentName} accepted the offer.`,
        acceptingAgentId: lastMsg.agentId,
      };
    }
  }

  // Auto-detect if offers are within 1% tolerance of each other (very close gap)
  const allOffers = Object.values(session.offers).filter(o => o !== null && o !== undefined);
  if (allOffers.length >= 2) {
    const [offerA, offerB] = allOffers;
    const avg = (offerA + offerB) / 2;
    const gap = Math.abs(offerA - offerB);
    const tolerance = avg * 0.01;  // 1% tolerance

    if (gap <= tolerance) {
      const finalOffer = Math.round(avg);
      logger.negotiation(`Auto-agreement: offers converged within 1% tolerance. Final: ${finalOffer}`);
      return {
        agreed: true,
        finalOffer,
        reason: 'Offers converged — agreement reached automatically.',
        acceptingAgentId: null,
      };
    }
  }

  return { agreed: false, finalOffer: null, reason: null };
}

/**
 * Check if the negotiation has been rejected (both agents rejecting, or deadlock).
 */
function checkRejection(session, lastMsg) {
  if (lastMsg.decision === 'reject') {
    // Check if previous messages also show rejection patterns
    const recentMessages = session.messages.slice(-4);
    const rejectionCount = recentMessages.filter(m => m.decision === 'reject').length;

    if (rejectionCount >= 2) {
      return {
        rejected: true,
        reason: 'Both parties reached an impasse. No agreement was possible.',
      };
    }

    // Single rejection — allow negotiation to continue (other agent may still counter)
    return { rejected: false };
  }

  return { rejected: false };
}

/**
 * Check if maximum rounds have been reached.
 */
function checkMaxRounds(session) {
  if (session.currentRound >= session.maxRounds) {
    logger.negotiation(`Max rounds (${session.maxRounds}) reached for ${session.id}`);
    return {
      maxReached: true,
      reason: `Maximum rounds (${session.maxRounds}) reached without agreement.`,
    };
  }
  return { maxReached: false };
}

/**
 * Detect deadlock: dual-agent offer stagnation across the last N rounds.
 *
 * Returns:
 *   { deadlocked: false }                                          — no deadlock
 *   { deadlocked: false, warning: true, reason: '...' }           — warning at 2 rounds
 *   { deadlocked: true,  finalOfferSignal: false, reason: '...' } — hard deadlock at 3 rounds
 *   { deadlocked: true,  finalOfferSignal: true,  reason: '...' } — extended deadlock (4+)
 *
 * @param {object} session
 * @param {number} [stagnationThreshold=3] — rounds with no change to trigger deadlock
 */
function checkDeadlock(session, stagnationThreshold = 3) {
  const msgs = session.messages;
  // Need at least (threshold * 2) messages (both agents × threshold rounds)
  const minMsgs = stagnationThreshold * 2;
  if (msgs.length < minMsgs) return { deadlocked: false };

  const agents = session.agents;
  const agentStagnantRounds = {};

  for (const agent of agents) {
    const agentOffers = msgs
      .filter(m => m.agentId === agent.id && m.offer !== null && m.offer !== undefined)
      .map(m => m.offer);

    if (agentOffers.length < stagnationThreshold) {
      agentStagnantRounds[agent.id] = 0;
      continue;
    }

    // Count how many consecutive identical offers at the tail
    const tail = agentOffers.slice(-(stagnationThreshold + 1));
    let count = 1;
    for (let i = tail.length - 1; i > 0; i--) {
      if (tail[i] === tail[i - 1]) count++;
      else break;
    }
    agentStagnantRounds[agent.id] = count;
  }

  const stagnantAgents = agents.filter(a => agentStagnantRounds[a.id] >= stagnationThreshold);
  const warnAgents     = agents.filter(a => agentStagnantRounds[a.id] >= stagnationThreshold - 1);

  // Hard deadlock — ALL agents stagnant for threshold rounds
  if (stagnantAgents.length === agents.length) {
    const extended = stagnantAgents.some(a => agentStagnantRounds[a.id] > stagnationThreshold);
    const names = stagnantAgents.map(a => a.name).join(' & ');
    logger.warn('Evaluation', `Deadlock confirmed: ${names} stagnant for ≥${stagnationThreshold} rounds.`);
    return {
      deadlocked: true,
      finalOfferSignal: extended,
      reason: `${names} failed to move their positions for ${stagnationThreshold} consecutive rounds. Deadlock declared.`,
    };
  }

  // Single agent stagnant at threshold — hard single-agent deadlock
  if (stagnantAgents.length >= 1) {
    const agent = stagnantAgents[0];
    logger.warn('Evaluation', `Deadlock: ${agent.name} stagnant for ${stagnantAgents[0].id ? agentStagnantRounds[stagnantAgents[0].id] : '?'} rounds.`);
    return {
      deadlocked: true,
      finalOfferSignal: false,
      reason: `${agent.name} has not moved from their position for ${stagnationThreshold} consecutive rounds. Deadlock declared.`,
    };
  }

  // Warning — approaching deadlock (1 round before threshold)
  if (warnAgents.length === agents.length) {
    const names = warnAgents.map(a => a.name).join(' & ');
    logger.negotiation(`Deadlock warning: ${names} approaching stagnation.`);
    return {
      deadlocked: false,
      warning: true,
      reason: `${names} have not moved in ${stagnationThreshold - 1} consecutive rounds. One more round of stagnation will result in a deadlock.`,
    };
  }

  return { deadlocked: false };
}

const { evaluateOffer, resolveAgentThresholds } = require('./offerEvaluation.service');

module.exports = {
  checkAgreement,
  checkRejection,
  checkMaxRounds,
  checkDeadlock,
  evaluateOffer,
  resolveAgentThresholds,
};
