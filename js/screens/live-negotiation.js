/**
 * js/screens/live-negotiation.js
 * Live Negotiation Screen module.
 *
 * Responsibilities:
 *   1. Initialize all four new components (StatePanel, NegotiationTimeline,
 *      OrchestratorIndicator, ConversationLog) into their mount points.
 *   2. Drive the mock demo auto-play via MockEngine.DEMO_SCRIPT with timed delays.
 *   3. Expose event-bridge callbacks so app.js can forward real WS events here.
 *
 * Public API:
 *   LiveNegotiationScreen.init(agents, scenario, maxRounds?)
 *   LiveNegotiationScreen.startDemo()
 *   LiveNegotiationScreen.stopDemo()
 *   LiveNegotiationScreen.reset()
 *
 *   — Event bridge (called from handleNegotiationEvent in app.js) —
 *   LiveNegotiationScreen.onRoundStarted(round, maxRounds)
 *   LiveNegotiationScreen.onAgentThinking(agentName, agentId)
 *   LiveNegotiationScreen.onAgentMessage(data, agentIndex)
 *   LiveNegotiationScreen.onOfferUpdated(agentName, agentId, offer, round)
 *   LiveNegotiationScreen.onNegotiationComplete(result)
 *   LiveNegotiationScreen.onNegotiationFailed(reason)
 */

const LiveNegotiationScreen = (function () {

  let _agents    = [];
  let _scenario  = null;
  let _maxRounds = 10;
  let _demoTimer = null;
  let _demoRunning = false;

  /* ================================================================
     Init — mount all components
     ================================================================ */

  function init(agents, scenario, maxRounds = 10) {
    _agents    = agents || [];
    _scenario  = scenario;
    _maxRounds = maxRounds;

    // Mount components (safe to call multiple times — they re-render)
    if (window.StatePanel)             StatePanel.mount('ln-state-panel');
    if (window.NegotiationTimeline)    NegotiationTimeline.mount('ln-timeline');
    if (window.OrchestratorIndicator)  OrchestratorIndicator.mount('ln-orch-indicator');
    if (window.ConversationLog)        ConversationLog.mount('ln-conv-log');

    // Prime state panel with initial values
    if (window.StatePanel) {
      StatePanel.update(0, maxRounds, '—', 'starting');
    }
  }

  /* ================================================================
     Demo auto-play — driven by MockEngine.DEMO_SCRIPT
     ================================================================ */

  function startDemo() {
    if (_demoRunning) return;
    _demoRunning = true;

    const script   = window.MockEngine ? window.MockEngine.DEMO_SCRIPT : [];
    const maxR     = window.MockEngine ? window.MockEngine.totalRounds  : 4;

    if (!script || script.length === 0) {
      console.warn('[LiveNegotiationScreen] No demo script available — MockEngine not loaded?');
      return;
    }

    // Collect unique rounds
    const rounds = [...new Set(script.map(e => e.round))].sort((a, b) => a - b);
    let delay = 0;

    rounds.forEach(round => {
      const roundEntries = script.filter(e => e.round === round);

      // Round start event
      delay += 400;
      _schedule(delay, () => {
        onRoundStarted(round, maxR);
      });

      // Each agent turn in this round
      roundEntries.forEach(entry => {
        // Show thinking
        delay += 1200;
        _schedule(delay, () => {
          onAgentThinking(entry.agentName, entry.agentId);
          if (window.OrchestratorIndicator) {
            OrchestratorIndicator.setPhase('agent_turn',
              `ROUND ${round} — AWAITING ${entry.agentName.toUpperCase()}`);
          }
        });

        // Deliver message + offer
        delay += 1800;
        _schedule(delay, () => {
          const agentIndex = _agents.findIndex(a => a.id === entry.agentId);
          onAgentMessage({
            agentId:   entry.agentId,
            agentName: entry.agentName,
            role:      entry.role,
            message:   entry.message,
            offer:     entry.offer,
            decision:  entry.decision,
            round:     entry.round,
            timestamp: Date.now(),
          }, agentIndex >= 0 ? agentIndex : 0);
        });

        // Offer update
        delay += 200;
        _schedule(delay, () => {
          if (entry.offer !== null && entry.offer !== undefined) {
            onOfferUpdated(entry.agentName, entry.agentId, entry.offer, round);
          }
        });

        // State updated phase
        delay += 300;
        _schedule(delay, () => {
          if (window.OrchestratorIndicator) {
            OrchestratorIndicator.setPhase(
              entry.decision === 'accept' ? 'termination_check' : 'state_updated',
              entry.orchestratorLabel
            );
          }
        });
      });
    });

    // Negotiation complete
    delay += 1600;
    _schedule(delay, () => {
      onNegotiationComplete('agreement', script[script.length - 1]?.offer || null);
    });
  }

  function stopDemo() {
    _demoRunning = false;
    if (_demoTimer) {
      clearTimeout(_demoTimer);
      _demoTimer = null;
    }
  }

  function _schedule(delayMs, fn) {
    setTimeout(() => {
      if (!_demoRunning && delayMs > 400) return; // allow first events
      fn();
    }, delayMs);
  }

  /* ================================================================
     Event bridge — called from app.js handleNegotiationEvent
     OR from the demo auto-player above
     ================================================================ */

  function onRoundStarted(round, maxRounds) {
    if (window.StatePanel) {
      StatePanel.update(round, maxRounds || _maxRounds, '—', 'in_progress');
    }
    if (window.OrchestratorIndicator) {
      OrchestratorIndicator.setPhase('state_pass',
        `ROUND ${round} — STATE PASS`);
    }
  }

  function onAgentThinking(agentName, agentId) {
    if (window.StatePanel) {
      StatePanel.setActiveTurn(agentName);
    }
    if (window.OrchestratorIndicator) {
      OrchestratorIndicator.setPhase('agent_turn',
        `AWAITING ${agentName.toUpperCase()}`);
    }
  }

  function onAgentMessage(data, agentIndex) {
    // Conversation log: show mock "input" (context summary) + actual output
    if (window.ConversationLog) {
      const input = _buildInputContext(data);
      ConversationLog.addEntry(
        data.agentName,
        data.agentId,
        input,
        data.message,
        data.round,
        data.timestamp
      );
    }
    if (window.OrchestratorIndicator) {
      OrchestratorIndicator.setPhase('state_updated',
        `${data.agentName.toUpperCase()} RESPONSE RECEIVED`);
    }
  }

  function onOfferUpdated(agentName, agentId, offer, round) {
    if (window.NegotiationTimeline) {
      // Determine decision from existing history
      const script  = window.MockEngine ? window.MockEngine.DEMO_SCRIPT : [];
      const entry   = script.find(e => e.agentId === agentId && e.round === round);
      NegotiationTimeline.addEntry({
        agentId,
        agentName,
        offer,
        round,
        decision:  entry?.decision || 'offer',
        message:   entry?.message  || null,
        timestamp: Date.now(),
      });
    }
    if (window.StatePanel) {
      StatePanel.updateStatus('in_progress');
    }
  }

  function onNegotiationComplete(result, finalOffer) {
    if (window.StatePanel) {
      StatePanel.updateStatus(result || 'completed');
    }
    if (window.OrchestratorIndicator) {
      OrchestratorIndicator.setPhase('complete',
        result === 'agreement'
          ? 'AGREEMENT CONFIRMED — SESSION COMPLETE'
          : 'SESSION TERMINATED — NO AGREEMENT');
    }
    _demoRunning = false;
  }

  function onNegotiationFailed(reason) {
    if (window.StatePanel) StatePanel.updateStatus('failed');
    if (window.OrchestratorIndicator) {
      OrchestratorIndicator.setPhase('complete', 'SESSION FAILED');
    }
    _demoRunning = false;
  }

  /* ================================================================
     Helpers
     ================================================================ */

  function _buildInputContext(data) {
    const scenarioName = _scenario?.name || 'Vendor Pricing Negotiation';
    return [
      `[SCENARIO] ${scenarioName}`,
      `[ROUND] ${data.round}`,
      `[AGENT] ${data.agentName} (${data.role || data.agentId})`,
      `[TASK] Generate negotiation response. Offer or counteroffer with justification.`,
      `[CONTEXT] Previous offer: ${data.offer ? `₹${data.offer.toLocaleString('en-IN')}` : 'none'}`,
    ].join('\n');
  }

  function reset() {
    stopDemo();
    _agents    = [];
    _scenario  = null;
    _maxRounds = 10;

    if (window.StatePanel)            StatePanel.reset();
    if (window.NegotiationTimeline)   NegotiationTimeline.reset();
    if (window.OrchestratorIndicator) OrchestratorIndicator.reset();
    if (window.ConversationLog)       ConversationLog.reset();
  }

  return {
    init,
    startDemo,
    stopDemo,
    reset,
    // Event bridge
    onRoundStarted,
    onAgentThinking,
    onAgentMessage,
    onOfferUpdated,
    onNegotiationComplete,
    onNegotiationFailed,
  };
})();

window.LiveNegotiationScreen = LiveNegotiationScreen;
