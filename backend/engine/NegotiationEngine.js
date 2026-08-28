/**
 * engine/NegotiationEngine.js
 * The central orchestrator for multi-agent negotiations.
 *
 * Architecture (Milestone 1 — Rule-Based):
 *
 *   start() → initialize agents → round loop
 *           → AgentDecisionProvider.decide()   ← abstraction (swap for LLM in M2)
 *           → trackConcession()
 *           → appendNegotiationHistory()
 *           → emit WebSocket events
 *           → detect termination → finalize()
 *
 * WebSocket events emitted:
 *   negotiation_started, round_started, agent_thinking, agent_message,
 *   offer_updated, negotiation_completed, negotiation_failed
 */

const { initializeAgents }                    = require('../services/agent.service');
const { trackConcession, getConcessionSummary } = require('../services/concession.service');
const { checkAgreement, checkRejection, checkMaxRounds, checkDeadlock } = require('../services/evaluation.service');
const { updateSession }                        = require('../services/negotiation.service');
const { createMessage }                        = require('../models/message.model');
const { STATUS, RESULT, appendNegotiationHistory } = require('../models/negotiation.model');
const { ACTION, decisionToAction }             = require('../models/offer.model');
const { RuleBasedDecisionProvider }            = require('./decisionProvider');
const { config }                               = require('../config/env');
const logger                                   = require('../utils/logger');

// ============================================================
// Decision Provider — swap RuleBasedDecisionProvider → LLMDecisionProvider in M2
// ============================================================
const decisionProvider = new RuleBasedDecisionProvider();

// WebSocket clients map: negotiationId → Set of ws connections
const wsClients = new Map();

// ============================================================
// WebSocket helpers
// ============================================================

function registerClient(negotiationId, ws) {
  if (!wsClients.has(negotiationId)) wsClients.set(negotiationId, new Set());
  wsClients.get(negotiationId).add(ws);
  logger.info('Engine', `Client registered for ${negotiationId}. Total: ${wsClients.get(negotiationId).size}`);
}

function unregisterClient(negotiationId, ws) {
  const clients = wsClients.get(negotiationId);
  if (clients) {
    clients.delete(ws);
    logger.info('Engine', `Client unregistered from ${negotiationId}. Remaining: ${clients.size}`);
  }
}

function broadcast(negotiationId, event, data) {
  const clients = wsClients.get(negotiationId);
  if (!clients || clients.size === 0) return;

  const payload = JSON.stringify({ event, data: { negotiationId, ...data } });

  for (const ws of clients) {
    try {
      if (ws.readyState === 1) ws.send(payload); // WebSocket.OPEN
    } catch (err) {
      logger.warn('Engine', `Failed to send to client: ${err.message}`);
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// Main negotiation runner
// ============================================================

/**
 * Run the negotiation engine for a session.
 * Executes asynchronously — does not block the HTTP response.
 *
 * @param {object} session — live session from negotiation service
 */
async function run(session) {
  const negotiationId = session.id;
  logger.negotiation(`Engine starting (rule-based): ${negotiationId}`);

  // Initialize agent instances
  let agents;
  try {
    agents = initializeAgents(session);
  } catch (err) {
    logger.error('Engine', `Agent initialization failed: ${err.message}`);
    updateSession(negotiationId, { status: STATUS.FAILED, result: RESULT.ERROR, resultReason: err.message });
    broadcast(negotiationId, 'negotiation_failed', { reason: 'Agent initialization failed.' });
    return;
  }

  // Transition to IN_PROGRESS
  updateSession(negotiationId, {
    status:           STATUS.IN_PROGRESS,
    currentAgentTurn: agents[0]?.id || null,
  });

  broadcast(negotiationId, 'negotiation_started', {
    scenario:  session.scenario,
    agents:    agents.map(a => ({ id: a.id, name: a.name, role: a.role, personality: a.personality })),
    maxRounds: session.maxRounds,
  });

  logger.negotiation(`${negotiationId}: ${agents.length} agents initialized. Starting rounds...`);

  let currentAgentIndex = 0;

  // ======== MAIN NEGOTIATION LOOP ========
  while (true) {
    const freshSession = session; // live reference
    const round        = freshSession.currentRound + 1;

    // Update round counter and currentAgentTurn
    const currentAgent  = agents[currentAgentIndex];
    const opponentIndex = (currentAgentIndex + 1) % agents.length;

    updateSession(negotiationId, {
      currentRound:     round,
      currentAgentTurn: currentAgent.id,
    });

    logger.round(`${negotiationId}: Round ${round}/${freshSession.maxRounds} | Turn: ${currentAgent.name}`);
    broadcast(negotiationId, 'round_started', {
      round,
      maxRounds:        freshSession.maxRounds,
      currentAgentTurn: currentAgent.id,
      currentAgentName: currentAgent.name,
    });

    // ---- Thinking indicator ----
    broadcast(negotiationId, 'agent_thinking', {
      agentId:       currentAgent.id,
      agentName:     currentAgent.name,
      role:          currentAgent.role,
      round,
      thinkingPhrase: getThinkingPhrase(currentAgent.personality),
    });

    // Configurable delay to make the UI feel alive
    await sleep(config.thinkDelayMs);

    // ---- Decision via AgentDecisionProvider (rule-based for M1) ----
    let decision;
    try {
      decision = await decisionProvider.decide(currentAgent, freshSession);
    } catch (err) {
      logger.error('Engine', `DecisionProvider error for ${currentAgent.name}: ${err.message}`);
      // Graceful fallback — hold position
      decision = {
        message:  'I need a moment to reconsider my position. Please allow me to respond shortly.',
        offer:    freshSession.offers[currentAgent.id] ?? null,
        decision: 'counter_offer',
        reason:   'Decision provider error — holding position',
        action:   ACTION.COUNTEROFFER,
      };
    }

    // ---- Track concession BEFORE updating offers ----
    if (decision.offer !== null && decision.offer !== undefined) {
      trackConcession(freshSession, currentAgent.id, decision.offer);

      // Track initial offer
      if (!freshSession.initialOffers[currentAgent.id]) {
        freshSession.initialOffers[currentAgent.id] = decision.offer;
        currentAgent.initialOffer = decision.offer;
      }

      // Update current offer in session and agent
      freshSession.offers[currentAgent.id] = decision.offer;
      currentAgent.currentOffer = decision.offer;
    }

    // ---- Create message record ----
    const message = createMessage({
      agentId:   currentAgent.id,
      agentName: currentAgent.name,
      role:      currentAgent.role,
      message:   decision.message,
      offer:     decision.offer,
      decision:  decision.decision,
      round,
    });

    freshSession.messages.push(message);

    // ---- Append to structured negotiation history ----
    const action = decision.action || decisionToAction(decision.decision);
    appendNegotiationHistory(freshSession, {
      round,
      agentId:   currentAgent.id,
      agentName: currentAgent.name,
      action,
      offer:     decision.offer,
      reason:    decision.reason || '',
      timestamp: message.timestamp,
    });

    // ---- Broadcast message to frontend ----
    broadcast(negotiationId, 'agent_message', {
      message:   message.message,
      offer:     message.offer,
      decision:  message.decision,
      agentId:   message.agentId,
      agentName: message.agentName,
      role:      message.role,
      round:     message.round,
      timestamp: message.timestamp,
      id:        message.id,
    });

    // ---- Broadcast offer update if offer changed ----
    if (message.offer !== null && message.offer !== undefined) {
      broadcast(negotiationId, 'offer_updated', {
        agentId:      currentAgent.id,
        agentName:    currentAgent.name,
        offer:        message.offer,
        offers:       { ...freshSession.offers },
        round,
      });
    }

    logger.agent(
      `${currentAgent.name} | Round ${round} | Action: ${action} | Offer: ${decision.offer}`
    );

    // ======== TERMINATION CHECKS ========

    // 1. Agreement
    const agreementCheck = checkAgreement(freshSession, {
      agentId:   currentAgent.id,
      agentName: currentAgent.name,
      offer:     decision.offer,
      decision:  decision.decision,
    });
    if (agreementCheck.agreed) {
      await finalize(session, RESULT.AGREEMENT, agreementCheck.finalOffer, agreementCheck.reason, agents, negotiationId);
      return;
    }

    // 2. Rejection
    const rejectionCheck = checkRejection(freshSession, {
      agentId:  currentAgent.id,
      decision: decision.decision,
    });
    if (rejectionCheck.rejected) {
      await finalize(session, RESULT.REJECTION, null, rejectionCheck.reason, agents, negotiationId);
      return;
    }

    // 3. Max rounds
    const maxRoundsCheck = checkMaxRounds(freshSession);
    if (maxRoundsCheck.maxReached) {
      await finalize(session, RESULT.MAX_ROUNDS, null, maxRoundsCheck.reason, agents, negotiationId);
      return;
    }

    // 4. Deadlock
    const deadlockCheck = checkDeadlock(freshSession);
    if (deadlockCheck.deadlocked) {
      await finalize(session, RESULT.REJECTION, null, deadlockCheck.reason, agents, negotiationId);
      return;
    }

    // ---- Advance turn ----
    currentAgentIndex = opponentIndex;
    await sleep(500);
  }
}

// ============================================================
// Finalize — close negotiation and emit completion event
// ============================================================

async function finalize(session, result, finalOffer, reason, agents, negotiationId) {
  const now = new Date().toISOString();

  const statusMap = {
    [RESULT.AGREEMENT]:  STATUS.COMPLETED,
    [RESULT.REJECTION]:  STATUS.COMPLETED,
    [RESULT.MAX_ROUNDS]: STATUS.COMPLETED,
    [RESULT.ERROR]:      STATUS.FAILED,
  };

  updateSession(negotiationId, {
    status:      statusMap[result] || STATUS.COMPLETED,
    result,
    resultReason: reason,
    completedAt: now,
    agreement:   result === RESULT.AGREEMENT ? { offer: finalOffer, reason } : null,
  });

  // Build summary including concession data
  const concessionSummary = getConcessionSummary(session);
  const summary = buildSummary(session, result, finalOffer, agents, reason, concessionSummary);

  logger.negotiation(`${negotiationId} finalized. Result: ${result}. Final offer: ${finalOffer}`);

  broadcast(negotiationId, 'negotiation_completed', {
    result,
    finalOffer,
    reason,
    summary,
    concessionSummary,
    rounds:  session.currentRound,
    status:  statusMap[result] || STATUS.COMPLETED,
    agents:  agents.map(a => ({
      id:           a.id,
      name:         a.name,
      role:         a.role,
      decision:     result === RESULT.AGREEMENT ? 'accepted' : 'rejected',
      initialOffer: session.initialOffers[a.id] || null,
      finalOffer:   session.offers[a.id] || null,
    })),
  });
}

// ============================================================
// Summary builder
// ============================================================

function buildSummary(session, result, finalOffer, agents, reason, concessionSummary) {
  const summary = {
    result,
    reason,
    finalOffer,
    totalRounds:  session.currentRound,
    maxRounds:    session.maxRounds,
    agentSummaries: agents.map(a => ({
      id:           a.id,
      name:         a.name,
      role:         a.role,
      personality:  a.personality,
      goals:        a.goals || [a.goal],
      initialOffer: session.initialOffers[a.id] || null,
      finalOffer:   session.offers[a.id] || null,
      concessions:  concessionSummary?.[a.id] || {},
    })),
    negotiationHistory: session.negotiationHistory,
    messages:           session.messages,
  };

  if (result === RESULT.AGREEMENT) {
    const allOffers = agents.map(a => session.offers[a.id]).filter(Boolean);
    if (allOffers.length >= 2) {
      summary.offerGapClosed = Math.abs(allOffers[0] - allOffers[1]);
    }
  }

  return summary;
}

// ============================================================
// Thinking phrases (personality-aware)
// ============================================================

function getThinkingPhrase(personality) {
  const phrases = {
    aggressive:    ['Formulating a strong counter...', 'Assessing leverage...', 'Preparing a firm response...'],
    collaborative: ['Considering mutual benefits...', 'Looking for common ground...', 'Analyzing your proposal...'],
    'risk-averse': ['Carefully evaluating risks...', 'Reviewing the terms...', 'Calculating a safe move...'],
    competitive:   ['Identifying winning strategy...', 'Analyzing opponent position...', 'Preparing to win...'],
    flexible:      ['Adapting my approach...', 'Exploring options...', 'Finding the best angle...'],
    analytical:    ['Running the numbers...', 'Evaluating data points...', 'Computing optimal response...'],
    professional:  ['Reviewing the proposal...', 'Consulting my guidelines...', 'Preparing a structured response...'],
  };
  const options = phrases[(personality || '').toLowerCase()] || phrases['collaborative'];
  return options[Math.floor(Math.random() * options.length)];
}

module.exports = { run, registerClient, unregisterClient, broadcast };
