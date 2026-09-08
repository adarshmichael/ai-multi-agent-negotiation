/**
 * engine/NegotiationEngine.js
 * The central autonomous orchestrator for multi-agent negotiations.
 *
 * Architecture:
 *   run() → initializeAgents (once, stored on session._agents)
 *         → autonomous while loop
 *         → executeTurn() per agent, per round
 *         → broadcast WebSocket events after each event
 *         → detect terminal conditions → finalize()
 *
 * WebSocket events emitted:
 *   negotiation_started, round_started, agent_thinking, agent_message,
 *   offer_updated, negotiation_completed, negotiation_failed
 *
 * Pause/Resume:
 *   session._paused = true  → loop will finish current turn then stop
 *   session._paused = false → loop continues
 */

const { initializeAgents }                       = require('../services/agent.service');
const { trackConcession, getConcessionSummary }  = require('../services/concession.service');
const { checkAgreement, checkRejection, checkMaxRounds, checkDeadlock } = require('../services/evaluation.service');
const { updateSession }                          = require('../services/negotiation.service');
const { createMessage }                          = require('../models/message.model');
const { STATUS, RESULT, appendNegotiationHistory } = require('../models/negotiation.model');
const { ACTION, decisionToAction }               = require('../models/offer.model');
const { RuleBasedDecisionProvider, LLMDecisionProvider } = require('./decisionProvider');
const { config }                                 = require('../config/env');
const logger                                     = require('../utils/logger');

// ============================================================
// Decision Provider — selected by session mode
// ============================================================

function getDecisionProvider(mode) {
  if (mode === 'gemini') {
    return new LLMDecisionProvider();
  }
  return new RuleBasedDecisionProvider();
}

// ============================================================
// WebSocket client registry
// ============================================================

const wsClients = new Map();

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
// Main negotiation runner — AUTONOMOUS LOOP
// ============================================================

/**
 * Run the negotiation engine for a session.
 * Executes autonomously — fires and keeps running until a terminal condition.
 * Prevents duplicate execution via session._running flag.
 *
 * @param {object} session — live session object from negotiation service
 */
async function run(session) {
  const negotiationId = session.id;

  // ---- Guard: prevent double-start ----
  if (session._running) {
    logger.warn('Engine', `${negotiationId}: Already running — ignoring duplicate start.`);
    return;
  }
  session._running = true;
  session._paused  = false;

  logger.negotiation(`Engine starting autonomously: ${negotiationId}`);

  // ---- Initialize agent instances (once, stored on session) ----
  if (!session._agents) {
    try {
      session._agents = initializeAgents(session);
    } catch (err) {
      logger.error('Engine', `Agent initialization failed: ${err.message}`);
      updateSession(negotiationId, { status: STATUS.FAILED, result: RESULT.ERROR, resultReason: err.message });
      broadcast(negotiationId, 'negotiation_failed', { reason: 'Agent initialization failed.' });
      session._running = false;
      return;
    }
  }

  const agents = session._agents;

  // ---- Transition to IN_PROGRESS ----
  updateSession(negotiationId, {
    status:            STATUS.IN_PROGRESS,
    currentAgentTurn:  agents[0]?.id || null,
    currentAgentIndex: 0,
  });

  broadcast(negotiationId, 'negotiation_started', {
    scenario:  session.scenario,
    agents:    agents.map(a => ({ id: a.id, name: a.name, role: a.role, personality: a.personality })),
    maxRounds: session.maxRounds,
  });

  logger.negotiation(`${negotiationId}: ${agents.length} agents initialized. Autonomous loop starting...`);

  // ---- AUTONOMOUS ORCHESTRATION LOOP ----
  while (true) {
    // Check session is still in progress
    if (session.status !== STATUS.IN_PROGRESS) {
      logger.negotiation(`${negotiationId}: Loop exiting — status is ${session.status}`);
      break;
    }

    // Check pause flag
    if (session._paused) {
      logger.negotiation(`${negotiationId}: Paused. Waiting...`);
      await sleep(500);
      continue;
    }

    // Execute one turn — returns 'continue' or 'terminate'
    const turnResult = await executeTurn(session);
    if (turnResult === 'terminate') {
      break;
    }

    // Natural delay between turns so UI can animate
    await sleep(300);
  }

  session._running = false;
  logger.negotiation(`${negotiationId}: Autonomous loop complete.`);
}

// ============================================================
// Single turn execution
// ============================================================

/**
 * Execute exactly one agent's turn.
 * Returns 'continue' to keep loop going, 'terminate' to stop.
 */
async function executeTurn(session) {
  const negotiationId    = session.id;
  const agents           = session._agents;

  if (!agents || agents.length === 0) {
    logger.error('Engine', `${negotiationId}: No agents available for turn.`);
    return 'terminate';
  }

  const currentAgentIndex = session.currentAgentIndex || 0;
  const currentAgent      = agents[currentAgentIndex];
  const opponentIndex     = (currentAgentIndex + 1) % agents.length;
  const round             = session.currentRound + 1;

  // Update session with new round and current agent
  updateSession(negotiationId, {
    currentRound:      round,
    currentAgentTurn:  currentAgent.id,
    currentAgentIndex: currentAgentIndex,
  });

  logger.round(`${negotiationId}: Round ${round}/${session.maxRounds} | Turn: ${currentAgent.name}`);

  // ---- Broadcast: round started ----
  broadcast(negotiationId, 'round_started', {
    round,
    maxRounds:        session.maxRounds,
    currentAgentTurn: currentAgent.id,
    currentAgentName: currentAgent.name,
  });

  // ---- Broadcast: agent thinking ----
  broadcast(negotiationId, 'agent_thinking', {
    agentId:        currentAgent.id,
    agentName:      currentAgent.name,
    role:           currentAgent.role,
    round,
    thinkingPhrase: getThinkingPhrase(currentAgent.personality),
  });

  // ---- Thinking delay (makes the UI feel alive) ----
  await sleep(config.thinkDelayMs);

  // Check if session was paused or stopped during thinking delay
  if (session._paused || session.status !== STATUS.IN_PROGRESS) {
    return session.status !== STATUS.IN_PROGRESS ? 'terminate' : 'continue';
  }

  // ---- Generate decision via AgentDecisionProvider ----
  const decisionProvider = getDecisionProvider(session.mode);
  let decision;
  try {
    decision = await decisionProvider.decide(currentAgent, session);
  } catch (err) {
    logger.error('Engine', `DecisionProvider error for ${currentAgent.name}: ${err.message}`);
    // Graceful fallback — hold position with a realistic message
    decision = {
      message:  'I need a moment to reconsider. Please bear with me.',
      offer:    session.offers[currentAgent.id] ?? null,
      decision: 'counter_offer',
      reason:   'Provider error — holding position',
      action:   ACTION.COUNTEROFFER,
    };
  }

  // ---- Track concession and update offers BEFORE termination checks ----
  if (decision.offer !== null && decision.offer !== undefined) {
    trackConcession(session, currentAgent.id, decision.offer);

    // Track initial offer
    if (!session.initialOffers[currentAgent.id]) {
      session.initialOffers[currentAgent.id] = decision.offer;
      currentAgent.initialOffer = decision.offer;
    }

    // Update current offer in both session and agent instance
    session.offers[currentAgent.id]   = decision.offer;
    currentAgent.currentOffer         = decision.offer;
  }

  // ---- Create and store message ----
  const message = createMessage({
    agentId:   currentAgent.id,
    agentName: currentAgent.name,
    role:      currentAgent.role,
    message:   decision.message,
    offer:     decision.offer,
    decision:  decision.decision,
    round,
  });

  session.messages.push(message);

  // ---- Append to structured negotiation history ----
  const action = decision.action || decisionToAction(decision.decision);
  appendNegotiationHistory(session, {
    round,
    agentId:   currentAgent.id,
    agentName: currentAgent.name,
    action,
    offer:     decision.offer,
    reason:    decision.reason || '',
    timestamp: message.timestamp,
  });

  // ---- Broadcast: agent message (the core conversation event) ----
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
    reason:    decision.reason,
    parameters: decision.parameters,
  });

  // ---- Broadcast: offer updated ----
  if (message.offer !== null && message.offer !== undefined) {
    broadcast(negotiationId, 'offer_updated', {
      agentId:   currentAgent.id,
      agentName: currentAgent.name,
      offer:     message.offer,
      offers:    { ...session.offers },
      round,
    });
  }

  logger.agent(`${currentAgent.name} | Round ${round} | Action: ${action} | Offer: ${decision.offer}`);

  // ======== TERMINATION CHECKS ========

  // 1. Agreement
  const agreementCheck = checkAgreement(session, {
    agentId:   currentAgent.id,
    agentName: currentAgent.name,
    offer:     decision.offer,
    decision:  decision.decision,
  });
  if (agreementCheck.agreed) {
    await finalize(session, RESULT.AGREEMENT, agreementCheck.finalOffer, agreementCheck.reason, agents, negotiationId);
    return 'terminate';
  }

  // 2. Explicit Rejection
  const rejectionCheck = checkRejection(session, {
    agentId:  currentAgent.id,
    decision: decision.decision,
  });
  if (rejectionCheck.rejected) {
    await finalize(session, RESULT.REJECTION, null, rejectionCheck.reason, agents, negotiationId);
    return 'terminate';
  }

  // 3. Max rounds
  const maxRoundsCheck = checkMaxRounds(session);
  if (maxRoundsCheck.maxReached) {
    await finalize(session, RESULT.MAX_ROUNDS, null, maxRoundsCheck.reason, agents, negotiationId);
    return 'terminate';
  }

  // 4. Deadlock
  const deadlockCheck = checkDeadlock(session);
  if (deadlockCheck.deadlocked) {
    await finalize(session, RESULT.REJECTION, null, deadlockCheck.reason, agents, negotiationId);
    return 'terminate';
  }

  // ---- Advance to next agent ----
  updateSession(negotiationId, { currentAgentIndex: opponentIndex });

  return 'continue';
}

// ============================================================
// Pause / Resume
// ============================================================

function pauseNegotiation(session) {
  if (session.status === STATUS.IN_PROGRESS) {
    session._paused = true;
    updateSession(session.id, { status: 'paused' });
    broadcast(session.id, 'negotiation_paused', { round: session.currentRound });
    logger.negotiation(`${session.id}: Paused.`);
  }
}

function resumeNegotiation(session) {
  if (session._paused || session.status === 'paused') {
    session._paused = false;
    updateSession(session.id, { status: STATUS.IN_PROGRESS });
    broadcast(session.id, 'negotiation_resumed', { round: session.currentRound });
    logger.negotiation(`${session.id}: Resumed.`);
  }
}

// ============================================================
// Finalize
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
    totalRounds:    session.currentRound,
    maxRounds:      session.maxRounds,
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

module.exports = {
  run,
  pauseNegotiation,
  resumeNegotiation,
  registerClient,
  unregisterClient,
  broadcast,
};
