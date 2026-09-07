/**
 * js/screens/live-negotiation.js
 * Live Negotiation Screen module.
 *
 * Responsibilities:
 *   1. Initialize all components (StatePanel, NegotiationTimeline,
 *      OrchestratorIndicator, ConversationLog) into their mount points.
 *   2. Drive the mock demo auto-play via MockEngine.DEMO_SCRIPT with timed delays.
 *   3. Expose event-bridge callbacks so app.js can forward real WS events here.
 *   4. Update status banner, agent status chips, offer values, and history badge.
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
  let _historyCount = 0;

  /* ================================================================
     Status Banner helpers
     ================================================================ */

  function _setStatusBanner(status, label) {
    const banner = document.getElementById('neg-status-banner');
    const bannerLabel = document.getElementById('neg-status-banner-label');
    if (banner) banner.dataset.status = status;
    if (bannerLabel) bannerLabel.textContent = label;
  }

  /* ================================================================
     Agent Offer Value helpers
     ================================================================ */

  function _setAgentOfferValue(agentId, offer) {
    const prefix = (agentId === 'buyer' || agentId === 'candidate' || agentId === 'project-manager')
      ? 'buyer' : 'vendor';
    const el = document.getElementById(`neg-${prefix}-offer-value`);
    if (!el) return;

    const formatted = offer !== null && offer !== undefined
      ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(offer)
      : '—';

    el.textContent = formatted;
    // Flash animation
    el.classList.remove('offer-flash');
    void el.offsetWidth;
    el.classList.add('offer-flash');
    setTimeout(() => el.classList.remove('offer-flash'), 600);
  }

  /* ================================================================
     History drawer badge
     ================================================================ */

  function _updateHistoryBadge() {
    _historyCount++;
    const badge = document.getElementById('history-drawer-badge');
    if (badge) {
      badge.textContent = _historyCount;
      badge.style.display = 'flex';
    }
  }

  /* ================================================================
     Init — mount all components
     ================================================================ */

  function init(agents, scenario, maxRounds = 10) {
    _agents    = agents || [];
    _scenario  = scenario;
    _maxRounds = maxRounds;
    _historyCount = 0;

    // Mount components (safe to call multiple times — they re-render)
    if (window.StatePanel)             StatePanel.mount('ln-state-panel');
    if (window.NegotiationTimeline)    NegotiationTimeline.mount('ln-timeline');
    if (window.OrchestratorIndicator)  OrchestratorIndicator.mount('ln-orch-indicator');
    if (window.ConversationLog)        ConversationLog.mount('ln-conv-log');

    // Prime state panel with initial values
    if (window.StatePanel) {
      StatePanel.update(0, maxRounds, '—', 'starting');
    }

    // Set initial status banner
    _setStatusBanner('active', 'ACTIVE');

    // Reset history badge
    const badge = document.getElementById('history-drawer-badge');
    if (badge) { badge.textContent = '0'; badge.style.display = 'none'; }
  }



  /* ================================================================
     Event bridge — called from app.js handleNegotiationEvent
     ================================================================ */

  function onRoundStarted(round, maxRounds) {
    if (window.StatePanel) {
      StatePanel.update(round, maxRounds || _maxRounds, '—', 'in_progress');
    }
    if (window.OrchestratorIndicator) {
      OrchestratorIndicator.setPhase('state_pass',
        `ROUND ${round} — STATE PASS`);
    }
    _setStatusBanner('active', 'ACTIVE');
  }

  function onAgentThinking(agentName, agentId) {
    if (window.StatePanel) {
      StatePanel.setActiveTurn(agentName);
    }
    if (window.OrchestratorIndicator) {
      OrchestratorIndicator.setPhase('agent_turn',
        `AWAITING ${agentName.toUpperCase()}`);
    }

    // Update the agent's status chip to THINKING
    const isBuyer = (agentId === 'buyer' || agentId === 'candidate' || agentId === 'project-manager');
    const prefix = isBuyer ? 'buyer' : 'vendor';
    const agentIndex = isBuyer ? 0 : 1;
    
    const badge = document.getElementById(`neg-${prefix}-badge`);
    if (badge) {
      badge.dataset.state = 'thinking';
      const label = badge.querySelector('.status-chip-label');
      if (label) label.textContent = 'THINKING';
    }

    // Drive the on-screen UI chat windows (uses globals from app.js)
    if (window.showAgentThinking) {
      window.showAgentThinking(agentName, agentIndex, 'Thinking...');
    }
    if (window.setAgentPanelActive) {
      window.setAgentPanelActive(agentIndex, true);
      window.setAgentPanelActive(agentIndex === 0 ? 1 : 0, false);
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
      _updateHistoryBadge();
    }
    if (window.OrchestratorIndicator) {
      OrchestratorIndicator.setPhase('state_updated',
        `${data.agentName.toUpperCase()} RESPONSE RECEIVED`);
    }

    // Update status chip to OFFER SENT
    const prefix = (data.agentId === 'buyer' || data.agentId === 'candidate' || data.agentId === 'project-manager')
      ? 'buyer' : 'vendor';
    const badge = document.getElementById(`neg-${prefix}-badge`);
    if (badge) {
      if (data.decision === 'accept') {
        badge.dataset.state = 'accepted';
        const label = badge.querySelector('.status-chip-label');
        if (label) label.textContent = 'ACCEPTED';
      } else {
        badge.dataset.state = 'offer_sent';
        const label = badge.querySelector('.status-chip-label');
        if (label) label.textContent = 'OFFER SENT';
      }
    }

    // Set the other agent to EVALUATING
    const otherPrefix = prefix === 'buyer' ? 'vendor' : 'buyer';
    const otherBadge = document.getElementById(`neg-${otherPrefix}-badge`);
    if (otherBadge && data.decision !== 'accept') {
      otherBadge.dataset.state = 'evaluating';
      const otherLabel = otherBadge.querySelector('.status-chip-label');
      if (otherLabel) otherLabel.textContent = 'EVALUATING';
    }

    // Drive the on-screen UI chat windows (uses globals from app.js)
    if (window.appendAgentMessage) {
      window.appendAgentMessage(data, agentIndex);
    }
    if (window.setAgentPanelActive) {
      window.setAgentPanelActive(agentIndex, false);
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
        source:    entry?.source || 'mock',
      });
    }
    if (window.StatePanel) {
      StatePanel.updateStatus('in_progress');
    }

    // Update the offer value in the agent card header
    _setAgentOfferValue(agentId, offer);
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

    // Update status banner
    if (result === 'agreement') {
      _setStatusBanner('agreement', 'AGREEMENT REACHED');
    } else {
      _setStatusBanner('terminated', 'TERMINATED');
    }

    // Mark both agents as ACCEPTED if agreement
    if (result === 'agreement') {
      ['buyer', 'vendor'].forEach(prefix => {
        const badge = document.getElementById(`neg-${prefix}-badge`);
        if (badge) {
          badge.dataset.state = 'accepted';
          const label = badge.querySelector('.status-chip-label');
          if (label) label.textContent = 'ACCEPTED';
        }
      });
    }

    const strip = document.getElementById('ln-summary-strip');
    if (strip) {
      const fmtValue = finalOffer ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(finalOffer) : '—';
      strip.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; padding: 24px; background:var(--color-bg-alt); border:1px solid var(--color-border); border-radius:var(--radius-md); margin-bottom:var(--space-4);">
          <div>
            <div style="font-size:12px; font-weight:700; color:var(--color-text-faint); margin-bottom:8px;">TOTAL ROUNDS</div>
            <div style="font-size:24px; font-weight:800; color:var(--color-orchestrator); font-family:var(--font-mono);">${document.getElementById('sp-round-val')?.textContent || '—'}</div>
          </div>
          <div>
            <div style="font-size:12px; font-weight:700; color:var(--color-text-faint); margin-bottom:8px;">FINAL VALUE</div>
            <div style="font-size:24px; font-weight:800; color:var(--color-success-sage); font-family:var(--font-mono);">${fmtValue}</div>
          </div>
          <div>
            <div style="font-size:12px; font-weight:700; color:var(--color-text-faint); margin-bottom:8px;">AI RESPONSES</div>
            <div style="display:flex; gap:8px;">
              <span class="nt-source-tag nt-source-gemini">GEMINI (0)</span>
              <span class="nt-source-tag nt-source-mock">MOCK (8)</span>
            </div>
          </div>
          <div>
            <div style="font-size:12px; font-weight:700; color:var(--color-text-faint); margin-bottom:8px;">CONCESSION TREND</div>
            <div style="font-size:14px; font-weight:700; color:var(--color-text); font-family:var(--font-mono);">Steady Decline</div>
          </div>
        </div>
      `;
      strip.style.display = 'block';
    }
  }

  function onNegotiationFailed(reason) {
    if (window.StatePanel) StatePanel.updateStatus('failed');
    if (window.OrchestratorIndicator) {
      OrchestratorIndicator.setPhase('complete', 'SESSION FAILED');
    }
    _demoRunning = false;
    _setStatusBanner('terminated', 'TERMINATED');
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
    _agents    = [];
    _scenario  = null;
    _maxRounds = 10;
    _historyCount = 0;

    if (window.StatePanel)            StatePanel.reset();
    if (window.NegotiationTimeline)   NegotiationTimeline.reset();
    if (window.OrchestratorIndicator) OrchestratorIndicator.reset();
    if (window.ConversationLog)       ConversationLog.reset();

    // Reset status banner
    _setStatusBanner('active', 'ACTIVE');

    // Reset offer values
    ['buyer', 'vendor'].forEach(prefix => {
      const el = document.getElementById(`neg-${prefix}-offer-value`);
      if (el) el.textContent = '—';
    });

    // Reset history badge
    const badge = document.getElementById('history-drawer-badge');
    if (badge) { badge.textContent = '0'; badge.style.display = 'none'; }
  }

  return {
    init,
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
