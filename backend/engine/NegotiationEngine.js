/**
 * engine/NegotiationEngine.js
 * The central orchestrator for multi-agent negotiations.
 *
 * Flow:
 *   start() → initialize agents → round loop → emit WS events → detect end → finalize
 *
 * WebSocket events emitted:
 *   negotiation_started, round_started, agent_thinking, agent_message,
 *   offer_updated, negotiation_completed, negotiation_failed
 */

const { initializeAgents } = require('../services/agent.service');
const { generateAgentResponse } = require('../services/llm.service');
const { checkAgreement, checkRejection, checkMaxRounds, checkDeadlock } = require('../services/evaluation.service');
const { updateSession } = require('../services/negotiation.service');
const { createMessage } = require('../models/message.model');
const { STATUS, RESULT, serializeNegotiation } = require('../models/negotiation.model');
const { config } = require('../config/env');
const logger = require('../utils/logger');

// WebSocket clients map: negotiationId → Set of ws connections
const wsClients = new Map();

/**
 * Register a WebSocket client for a negotiation session.
 */
function registerClient(negotiationId, ws) {
  if (!wsClients.has(negotiationId)) {
    wsClients.set(negotiationId, new Set());
  }
  wsClients.get(negotiationId).add(ws);
  logger.info('Engine', `Client registered for ${negotiationId}. Total: ${wsClients.get(negotiationId).size}`);
}

/**
 * Remove a WebSocket client.
 */
function unregisterClient(negotiationId, ws) {
  const clients = wsClients.get(negotiationId);
  if (clients) {
    clients.delete(ws);
    logger.info('Engine', `Client unregistered from ${negotiationId}. Remaining: ${clients.size}`);
  }
}

/**
 * Broadcast a structured event to all connected clients for a negotiation.
 */
function broadcast(negotiationId, event, data) {
  const clients = wsClients.get(negotiationId);
  if (!clients || clients.size === 0) return;

  const payload = JSON.stringify({ event, data: { negotiationId, ...data } });

  for (const ws of clients) {
    try {
      if (ws.readyState === 1) {  // WebSocket.OPEN
        ws.send(payload);
      }
    } catch (err) {
      logger.warn('Engine', `Failed to send to client: ${err.message}`);
    }
  }
}

/**
 * Sleep helper.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main negotiation runner.
 * Runs as a detached async process — does not block the HTTP response.
 *
 * @param {object} session  — live session from negotiation service
 */
async function run(session) {
  const negotiationId = session.id;
  logger.negotiation(`Engine starting: ${negotiationId}`);

  // Initialize agents
  let agents;
  try {
    agents = initializeAgents(session);
  } catch (err) {
    logger.error('Engine', `Agent initialization failed: ${err.message}`);
    updateSession(negotiationId, { status: STATUS.FAILED, result: RESULT.ERROR, resultReason: err.message });
    broadcast(negotiationId, 'negotiation_failed', { reason: 'Agent initialization failed.' });
    return;
  }

  // Update status
  updateSession(negotiationId, { status: STATUS.IN_PROGRESS });

  // Emit start event
  broadcast(negotiationId, 'negotiation_started', {
    scenario: session.scenario,
    agents: agents.map(a => ({ id: a.id, name: a.name, role: a.role, personality: a.personality })),
    maxRounds: session.maxRounds,
  });

  logger.negotiation(`${negotiationId}: ${agents.length} agents initialized. Starting rounds...`);

  let currentAgentIndex = 0;
  let continueNegotiation = true;

  // ======== MAIN NEGOTIATION LOOP ========
  while (continueNegotiation) {
    const freshSession = session;  // Live reference
    const round = freshSession.currentRound + 1;

    // Update round
    updateSession(negotiationId, { currentRound: round });

    logger.round(`${negotiationId}: Round ${round} / ${freshSession.maxRounds} started`);
    broadcast(negotiationId, 'round_started', { round, maxRounds: freshSession.maxRounds });

    const currentAgent = agents[currentAgentIndex];
    const opponentIndex = (currentAgentIndex + 1) % agents.length;
    const opponentAgent = agents[opponentIndex];

    // Find opponent's last message
    const agentMessages = freshSession.messages;
    const opponentLastMsg = [...agentMessages].reverse().find(m => m.agentId === opponentAgent.id);

    // Emit "thinking" indicator
    broadcast(negotiationId, 'agent_thinking', {
      agentId: currentAgent.id,
      agentName: currentAgent.name,
      role: currentAgent.role,
      round,
      thinkingPhrase: getThinkingPhrase(currentAgent.personality),
    });

    await sleep(config.thinkDelayMs);

    // Build offer state
    const offerState = {};
    for (const agent of agents) {
      offerState[agent.id] = freshSession.offers[agent.id] ?? null;
    }

    // Generate LLM response
    let llmResponse;
    try {
      const prompt = currentAgent.buildPrompt({
        history: freshSession.messages,
        opponent: opponentLastMsg ? {
          agentName: opponentLastMsg.agentName,
          message: opponentLastMsg.message,
          offer: opponentLastMsg.offer,
        } : null,
        round,
        maxRounds: freshSession.maxRounds,
        offerState,
      });

      const rawResponse = await generateAgentResponse(
        prompt, 
        currentAgent.name,
        currentAgent, // agentConfig
        round,
        freshSession.maxRounds,
        offerState
      );
      llmResponse = currentAgent.validateResponse(rawResponse);

    } catch (err) {
      logger.error('Engine', `LLM error for ${currentAgent.name}: ${err.message}`);

      // Use a graceful fallback instead of crashing the negotiation
      llmResponse = {
        message: `I need a moment to reconsider my position. Please allow me to get back to you shortly.`,
        offer: freshSession.offers[currentAgent.id] ?? null,
        decision: 'counter_offer',
      };
    }

    // Create message record
    const message = createMessage({
      agentId: currentAgent.id,
      agentName: currentAgent.name,
      role: currentAgent.role,
      message: llmResponse.message,
      offer: llmResponse.offer,
      decision: llmResponse.decision,
      round,
    });

    // Store message
    freshSession.messages.push(message);

    // Update offer tracking
    if (llmResponse.offer !== null && llmResponse.offer !== undefined) {
      // Track initial offer
      if (!freshSession.initialOffers[currentAgent.id]) {
        freshSession.initialOffers[currentAgent.id] = llmResponse.offer;
      }
      freshSession.offers[currentAgent.id] = llmResponse.offer;
      currentAgent.currentOffer = llmResponse.offer;
    }

    // Emit the message to frontend
    broadcast(negotiationId, 'agent_message', {
      message: message.message,
      offer: message.offer,
      decision: message.decision,
      agentId: message.agentId,
      agentName: message.agentName,
      role: message.role,
      round: message.round,
      timestamp: message.timestamp,
      id: message.id,
    });

    // Emit offer update if offer changed
    if (message.offer !== null) {
      broadcast(negotiationId, 'offer_updated', {
        agentId: currentAgent.id,
        agentName: currentAgent.name,
        offer: message.offer,
        offers: { ...freshSession.offers },
        round,
      });
    }

    logger.agent(`${currentAgent.name} | Round ${round} | Decision: ${llmResponse.decision} | Offer: ${llmResponse.offer}`);

    // ======== END-CONDITION CHECKS ========

    // 1. Agreement check
    const agreementCheck = checkAgreement(freshSession, {
      agentId: currentAgent.id,
      agentName: currentAgent.name,
      offer: llmResponse.offer,
      decision: llmResponse.decision,
    });

    if (agreementCheck.agreed) {
      await finalize(session, RESULT.AGREEMENT, agreementCheck.finalOffer, agreementCheck.reason, agents, negotiationId);
      return;
    }

    // 2. Rejection check
    const rejectionCheck = checkRejection(freshSession, {
      agentId: currentAgent.id,
      decision: llmResponse.decision,
    });

    if (rejectionCheck.rejected) {
      await finalize(session, RESULT.REJECTION, null, rejectionCheck.reason, agents, negotiationId);
      return;
    }

    // 3. Max rounds check
    const maxRoundsCheck = checkMaxRounds(freshSession);
    if (maxRoundsCheck.maxReached) {
      await finalize(session, RESULT.MAX_ROUNDS, null, maxRoundsCheck.reason, agents, negotiationId);
      return;
    }

    // 4. Deadlock check
    const deadlockCheck = checkDeadlock(freshSession);
    if (deadlockCheck.deadlocked) {
      await finalize(session, RESULT.REJECTION, null, deadlockCheck.reason, agents, negotiationId);
      return;
    }

    // Switch to next agent
    currentAgentIndex = opponentIndex;

    // Small delay between agent turns
    await sleep(500);
  }
}

/**
 * Finalize the negotiation — update state, compute summary, emit completion event.
 */
async function finalize(session, result, finalOffer, reason, agents, negotiationId) {
  const now = new Date().toISOString();
  const statusMap = {
    [RESULT.AGREEMENT]: STATUS.COMPLETED,
    [RESULT.REJECTION]: STATUS.COMPLETED,
    [RESULT.MAX_ROUNDS]: STATUS.COMPLETED,
    [RESULT.ERROR]: STATUS.FAILED,
  };

  updateSession(negotiationId, {
    status: statusMap[result] || STATUS.COMPLETED,
    result,
    resultReason: reason,
    completedAt: now,
    agreement: result === RESULT.AGREEMENT ? { offer: finalOffer, reason } : null,
  });

  // Build summary
  const summary = buildSummary(session, result, finalOffer, agents, reason);

  logger.negotiation(`${negotiationId} finalized. Result: ${result}. Final offer: ${finalOffer}`);

  broadcast(negotiationId, 'negotiation_completed', {
    result,
    finalOffer,
    reason,
    summary,
    rounds: session.currentRound,
    status: statusMap[result] || STATUS.COMPLETED,
    agents: agents.map(a => ({
      id: a.id,
      name: a.name,
      role: a.role,
      decision: result === RESULT.AGREEMENT ? 'accepted' : 'rejected',
      initialOffer: session.initialOffers[a.id] || null,
      finalOffer: session.offers[a.id] || null,
    })),
  });
}

/**
 * Build a human-readable negotiation summary.
 */
function buildSummary(session, result, finalOffer, agents, reason) {
  const summary = {
    result,
    reason,
    finalOffer,
    totalRounds: session.currentRound,
    maxRounds: session.maxRounds,
    agentSummaries: agents.map(a => ({
      id: a.id,
      name: a.name,
      role: a.role,
      personality: a.personality,
      initialOffer: session.initialOffers[a.id] || null,
      finalOffer: session.offers[a.id] || null,
    })),
    messages: session.messages,
  };

  if (result === RESULT.AGREEMENT) {
    const allOffers = agents.map(a => session.offers[a.id]).filter(Boolean);
    if (allOffers.length >= 2) {
      summary.offerGapClosed = Math.abs(allOffers[0] - allOffers[1]);
    }
  }

  return summary;
}

/**
 * Get a contextual thinking phrase based on personality.
 */
function getThinkingPhrase(personality) {
  const phrases = {
    aggressive: ['Formulating a strong counter...', 'Assessing leverage...', 'Preparing a firm response...'],
    collaborative: ['Considering mutual benefits...', 'Looking for common ground...', 'Analyzing your proposal...'],
    'risk-averse': ['Carefully evaluating risks...', 'Reviewing the terms...', 'Calculating a safe move...'],
  };
  const options = phrases[personality] || phrases['collaborative'];
  return options[Math.floor(Math.random() * options.length)];
}

module.exports = { run, registerClient, unregisterClient, broadcast };
