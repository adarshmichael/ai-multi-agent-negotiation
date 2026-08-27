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
 * Detect deadlock: same offer repeated multiple times
 */
function checkDeadlock(session) {
  const msgs = session.messages;
  if (msgs.length < 6) return { deadlocked: false };

  // Check last 4 offers from same agent — if unchanged, it's a deadlock
  const agents = session.agents;
  for (const agent of agents) {
    const agentOffers = msgs
      .filter(m => m.agentId === agent.id && m.offer !== null)
      .slice(-3)
      .map(m => m.offer);

    if (agentOffers.length >= 3 && agentOffers.every(o => o === agentOffers[0])) {
      logger.warn('Evaluation', `Deadlock detected: ${agent.name} repeated offer ${agentOffers[0]} 3 times`);
      return {
        deadlocked: true,
        reason: `${agent.name} has not moved from their position. Deadlock declared.`,
      };
    }
  }

  return { deadlocked: false };
}

module.exports = { checkAgreement, checkRejection, checkMaxRounds, checkDeadlock };
