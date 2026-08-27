/**
 * app.js
 * Full negotiation flow — config wizard + live negotiation chat.
 * All rendering is driven by AppState. No LLM calls here — backend only.
 */

const ICONS = {
  cart: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
  briefcase: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/></svg>',
  goal: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
};

function initials(name) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function formatINR(amount) {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(amount);
}

/* ============================== Stepper ============================== */

const STEP_ORDER = [
  { id: AppState.STEPS.SCENARIO,  label: 'Scenario' },
  { id: AppState.STEPS.CONFIGURE, label: 'Configure' },
  { id: AppState.STEPS.SUMMARY,   label: 'Summary' },
  { id: AppState.STEPS.NEGOTIATE, label: 'Negotiate' },
];

function renderStepper() {
  const { currentStep } = AppState.getState();
  const currentIndex = STEP_ORDER.findIndex(s => s.id === currentStep);
  const el = document.getElementById('stepper');
  el.innerHTML = STEP_ORDER.map((step, i) => {
    const cls = i === currentIndex ? 'active' : i < currentIndex ? 'done' : '';
    const connector = i < STEP_ORDER.length - 1 ? '<div class="step-connector"></div>' : '';
    return `<div class="step-pill ${cls}"><span class="dot"></span>${step.label}</div>${connector}`;
  }).join('');
}

/* ============================== Screen switching ============================== */

function showScreen(stepId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const map = {
    [AppState.STEPS.SCENARIO]:  'screen-scenario',
    [AppState.STEPS.CONFIGURE]: 'screen-configure',
    [AppState.STEPS.SUMMARY]:   'screen-summary',
    [AppState.STEPS.NEGOTIATE]: 'screen-negotiate',
  };
  const screenId = map[stepId];
  if (screenId) document.getElementById(screenId).classList.add('active');
  renderStepper();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ============================== 3D tilt interaction ============================== */

function attachTiltEffect(card) {
  const maxTilt = 8;
  card.addEventListener('mousemove', e => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const px = x / rect.width;
    const py = y / rect.height;
    const rotateY = (px - 0.5) * maxTilt * 2;
    const rotateX = (0.5 - py) * maxTilt * 2;
    card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;
    card.style.setProperty('--mx', `${px * 100}%`);
    card.style.setProperty('--my', `${py * 100}%`);
  });
  card.addEventListener('mouseleave', () => {
    card.style.transform = 'rotateX(0deg) rotateY(0deg) translateY(0)';
  });
}

/* ============================== Screen 1: Scenario selection ============================== */

function renderScenarioGrid() {
  const grid = document.getElementById('scenario-grid');
  const { selectedScenarioId, scenarios, isLoading, error } = AppState.getState();

  if (isLoading && scenarios.length === 0) {
    grid.innerHTML = `<div class="loading-state">Loading scenarios...</div>`;
    return;
  }
  if (error && scenarios.length === 0) {
    grid.innerHTML = `<div class="error-state">${error}</div>`;
    return;
  }

  grid.innerHTML = scenarios.map(scenario => {
    const isSelected = scenario.id === selectedScenarioId;
    const agentChips = scenario.agents.map(a => `<span class="agent-chip">${a.name}</span>`).join('');
    return `
      <div class="scenario-card ${isSelected ? 'selected' : ''}" data-scenario-id="${scenario.id}">
        <div class="selected-badge">✓ Selected</div>
        <div class="scenario-card-icon">${ICONS[scenario.icon] || ICONS.goal}</div>
        <div class="scenario-card-body">
          <div class="scenario-card-title">${scenario.name}</div>
          <div class="scenario-card-desc">${scenario.description}</div>
          <div class="scenario-card-agents">${agentChips}</div>
        </div>
        <div class="scenario-card-cta">
          <button class="select-btn" type="button">${isSelected ? 'Selected ✓' : 'Select Scenario'}</button>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.scenario-card').forEach(card => {
    attachTiltEffect(card);
    card.addEventListener('click', () => {
      AppState.selectScenario(card.dataset.scenarioId);
      document.getElementById('scenario-validation').classList.remove('show');
    });
  });
}

function handleScenarioContinue() {
  const { selectedScenarioId } = AppState.getState();
  if (!selectedScenarioId) {
    document.getElementById('scenario-validation').classList.add('show');
    return;
  }
  AppState.goToStep(AppState.STEPS.CONFIGURE);
}

/* ============================== Screen 2: Agent configuration ============================== */

function renderAgentGrid() {
  const { isLoading, error } = AppState.getState();
  const scenario = AppState.getSelectedScenario();
  if (!scenario) return;

  document.getElementById('configure-title').textContent = `Configure Agents — ${scenario.name}`;
  const grid = document.getElementById('agent-grid');

  if (isLoading) { grid.innerHTML = `<div class="loading-state">Loading agent configuration...</div>`; return; }
  if (error)     { grid.innerHTML = `<div class="error-state">${error}</div>`; return; }
  if (!scenario.agents || scenario.agents.length === 0) {
    grid.innerHTML = `<div class="empty-state">No agents configured for this scenario.</div>`;
    return;
  }

  grid.innerHTML = scenario.agents.map(agent => {
    const selectedPersonality = AppState.getPersonality(agent.id);
    const personalityButtons = PERSONALITIES.map(p => {
      const active = p.id === selectedPersonality ? 'active' : '';
      return `<button class="personality-btn ${active}" type="button" data-agent-id="${agent.id}" data-personality-id="${p.id}" title="${p.description}">${p.label}</button>`;
    }).join('');

    return `
      <div class="agent-card" data-agent-id="${agent.id}">
        <div class="agent-card-header">
          <div class="agent-avatar">${initials(agent.name)}</div>
          <div>
            <div class="agent-name">${agent.name}</div>
            <div class="agent-role">${agent.role}</div>
          </div>
        </div>
        <div class="agent-detail-row">
          <div class="agent-detail-icon">${ICONS.goal}</div>
          <div>
            <div class="agent-detail-label">Goal</div>
            <div class="agent-detail-value">${agent.goal}</div>
          </div>
        </div>
        <div class="agent-detail-row">
          <div class="agent-detail-icon">${ICONS.lock}</div>
          <div>
            <div class="agent-detail-label">Constraints</div>
            <ul class="agent-detail-value constraints-list">
              ${(agent.constraints || []).map(c => `<li>${c}</li>`).join('')}
            </ul>
          </div>
        </div>
        <div class="personality-label">Personality</div>
        <div class="personality-options">${personalityButtons}</div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.personality-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      AppState.setPersonality(btn.dataset.agentId, btn.dataset.personalityId);
      document.getElementById('personality-validation').classList.remove('show');
    });
  });
}

function handleConfigureContinue() {
  if (!AppState.allPersonalitiesSelected()) {
    document.getElementById('personality-validation').classList.add('show');
    return;
  }
  AppState.goToStep(AppState.STEPS.SUMMARY);
}

function handleSaveConfiguration() {
  if (!AppState.allPersonalitiesSelected()) {
    document.getElementById('personality-validation').classList.add('show');
    return;
  }
  const btn = document.getElementById('btn-save-config');
  const original = btn.textContent;
  btn.textContent = 'Saved ✓';
  setTimeout(() => (btn.textContent = original), 1400);
}

/* ============================== Screen 3: Summary ============================== */

function renderSummary() {
  const scenario = AppState.getSelectedScenario();
  if (!scenario) return;

  const grid = document.getElementById('summary-grid');
  grid.innerHTML = scenario.agents.map(agent => {
    const personalityId = AppState.getPersonality(agent.id);
    const personality = PERSONALITIES.find(p => p.id === personalityId);
    return `
      <div class="summary-card">
        <div class="summary-card-top">
          <div class="agent-name">${agent.name}</div>
          <span class="personality-tag">${personality ? personality.label : '—'}</span>
        </div>
        <div class="summary-line"><strong>Role</strong><span>${agent.role}</span></div>
        <div class="summary-line"><strong>Goal</strong><span>${agent.goal}</span></div>
        <div class="summary-line summary-line-block">
          <strong>Constraints</strong>
          <ul class="constraints-list">
            ${(agent.constraints || []).map(c => `<li>${c}</li>`).join('')}
          </ul>
        </div>
      </div>
    `;
  }).join('');
}

/* ============================== Screen 4: Negotiate — Pre-Start ============================== */

function renderNegotiateScreen() {
  const scenario = AppState.getSelectedScenario();
  const { personalities, negotiationStatus } = AppState.getState();
  if (!scenario) return;

  // Populate meta chips
  const metaEl = document.getElementById('neg-start-meta');
  const agentChips = scenario.agents.map(a => {
    const pId = personalities[a.id];
    const pLabel = PERSONALITIES.find(p => p.id === pId)?.label || '—';
    return `<span class="neg-meta-chip">🤖 ${a.name} <span style="opacity:0.6;">·</span> ${pLabel}</span>`;
  }).join('');
  metaEl.innerHTML = `
    <span class="neg-meta-chip">📋 ${scenario.name}</span>
    ${agentChips}
  `;

  // Update subtitle
  document.getElementById('neg-ready-subtitle').textContent =
    `${scenario.name} — ${scenario.agents.length} AI agents are configured and ready. Click below to start the live negotiation.`;

  // Hide backend error banner
  document.getElementById('backend-validation').classList.remove('show');

  if (negotiationStatus === 'idle') {
    // Show start panel, hide live panel
    document.getElementById('neg-start-panel').style.display = 'block';
    document.getElementById('neg-live-panel').style.display = 'none';
    
    // Reset button state
    const btn = document.getElementById('btn-start-negotiation');
    if (btn) {
      btn.disabled = false;
      document.getElementById('btn-start-text').textContent = '🚀 Start Negotiation';
    }
  } else if (negotiationStatus !== 'starting') {
    // For in_progress, completed, failed, stopped, ensure live panel is shown
    document.getElementById('neg-start-panel').style.display = 'none';
    document.getElementById('neg-live-panel').style.display = 'block';
  }
}

/* ============================== Screen 4: Negotiate — Live Chat ============================== */

let thinkingIndicatorId = null;

function showThinkingIndicator(agentName, agentIndex, thinkingPhrase) {
  removeThinkingIndicator();

  const chat = document.getElementById('neg-chat');
  const emptyChatEl = document.getElementById('neg-chat-empty');
  if (emptyChatEl) emptyChatEl.style.display = 'none';

  const alignClass = agentIndex === 0 ? 'agent-left' : 'agent-right';
  const avatarClass = agentIndex === 1 ? 'avatar-alt' : '';

  const div = document.createElement('div');
  div.id = 'thinking-indicator';
  div.className = `neg-thinking ${alignClass}`;
  div.innerHTML = `
    <div class="neg-agent-avatar ${avatarClass}">${initials(agentName)}</div>
    <div class="neg-thinking-bubble">
      <div class="thinking-dots"><span></span><span></span><span></span></div>
      <div class="neg-thinking-text">${thinkingPhrase || 'Thinking...'}</div>
    </div>
  `;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function removeThinkingIndicator() {
  const existing = document.getElementById('thinking-indicator');
  if (existing) existing.remove();
}

function appendChatMessage(data, agentIndex) {
  removeThinkingIndicator();

  const chat = document.getElementById('neg-chat');
  const emptyChatEl = document.getElementById('neg-chat-empty');
  if (emptyChatEl) emptyChatEl.style.display = 'none';

  const alignClass = agentIndex === 0 ? 'agent-left' : 'agent-right';
  const avatarClass = agentIndex === 1 ? 'avatar-alt' : '';

  let offerBadgeHtml = '';
  if (data.offer !== null && data.offer !== undefined) {
    let offerClass = '';
    let offerIcon = '💰';
    if (data.decision === 'accept') { offerClass = 'offer-accept'; offerIcon = '✅'; }
    if (data.decision === 'reject') { offerClass = 'offer-reject'; offerIcon = '❌'; }
    offerBadgeHtml = `<div class="neg-offer-badge ${offerClass}">${offerIcon} Offer: ${formatINR(data.offer)}</div>`;
  } else if (data.decision === 'accept') {
    offerBadgeHtml = `<div class="neg-offer-badge offer-accept">✅ Accepted</div>`;
  } else if (data.decision === 'reject') {
    offerBadgeHtml = `<div class="neg-offer-badge offer-reject">❌ No Deal</div>`;
  }

  const time = new Date(data.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const div = document.createElement('div');
  div.className = `neg-message ${alignClass}`;
  div.innerHTML = `
    <div class="neg-message-meta">
      <div class="neg-agent-avatar ${avatarClass}">${initials(data.agentName)}</div>
      <span>${data.agentName}</span>
      <span style="opacity:0.5;">·</span>
      <span>${data.role}</span>
    </div>
    <div class="neg-message-bubble">
      <div class="neg-message-text">${escapeHtml(data.message)}</div>
      ${offerBadgeHtml}
      <div class="neg-message-footer">
        <span class="neg-round-label">Round ${data.round}</span>
        <span>${time}</span>
      </div>
    </div>
  `;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function updateStatusBar(offers, agents, round, maxRounds) {
  const bar = document.getElementById('neg-status-bar');
  const offersEl = document.getElementById('neg-offers');
  const progressFill = document.getElementById('neg-progress-fill');

  if (!bar) return;

  const offerValues = agents.map((a, i) => ({
    ...a,
    offer: offers[a.id] || null,
    index: i,
  }));

  const offerStats = offerValues.map(a => `
    <div class="neg-offer-stat">
      <div class="neg-offer-stat-label">🤖 ${a.name}</div>
      <div class="neg-offer-stat-value">${formatINR(a.offer)}</div>
    </div>
  `).join('');

  // Compute gap
  const knownOffers = offerValues.map(a => a.offer).filter(o => o !== null && o !== undefined);
  let gapHtml = '';
  if (knownOffers.length >= 2) {
    const gap = Math.abs(knownOffers[0] - knownOffers[1]);
    gapHtml = `
      <div class="neg-offer-stat">
        <div class="neg-offer-stat-label">Gap</div>
        <div class="neg-offer-stat-value gap-value">${formatINR(gap)}</div>
      </div>
    `;
  }

  offersEl.innerHTML = offerStats + gapHtml;

  // Progress bar
  const progress = maxRounds > 0 ? Math.min(100, (round / maxRounds) * 100) : 0;
  progressFill.style.width = `${progress}%`;

  bar.style.display = 'block';
}

function updateNegotiationHeader(status, round, maxRounds, scenarioName) {
  const dot = document.getElementById('neg-status-dot');
  const statusText = document.getElementById('neg-status-text');
  const roundBadge = document.getElementById('neg-round-badge');
  const scenarioEl = document.getElementById('neg-scenario-name');

  if (scenarioEl) scenarioEl.textContent = scenarioName || 'Negotiation';
  if (roundBadge) roundBadge.textContent = `Round ${round} / ${maxRounds}`;

  if (dot) {
    dot.className = 'neg-status-indicator';
    if (status === 'in_progress' || status === 'starting') {
      dot.classList.add('live');
      if (statusText) statusText.textContent = '● LIVE';
    } else if (status === 'completed') {
      dot.classList.add('completed');
      if (statusText) statusText.textContent = 'Completed';
    } else if (status === 'failed') {
      dot.classList.add('failed');
      if (statusText) statusText.textContent = 'Failed';
    } else {
      if (statusText) statusText.textContent = status;
    }
  }
}

function showCompletionPanel(data) {
  const panel = document.getElementById('neg-complete-panel');
  if (!panel) return;

  const { result, finalOffer, reason, rounds, maxRounds, agents, summary } = data;

  let icon = '🤝', iconClass = 'icon-agreement', titleText = '', titleColor = '';
  switch (result) {
    case 'agreement':
      icon = '🤝'; iconClass = 'icon-agreement';
      titleText = 'Agreement Reached!';
      break;
    case 'rejection':
      icon = '❌'; iconClass = 'icon-failed';
      titleText = 'No Agreement Reached';
      break;
    case 'max_rounds':
      icon = '⏱'; iconClass = 'icon-timeout';
      titleText = 'Maximum Rounds Reached';
      break;
    case 'stopped':
      icon = '■'; iconClass = 'icon-timeout';
      titleText = 'Negotiation Stopped';
      break;
    default:
      icon = '⚠'; iconClass = 'icon-failed';
      titleText = 'Negotiation Ended';
  }

  // Agent decisions
  const agentDecisionsHtml = (agents || []).map(a => {
    const decided = a.decision === 'accepted';
    return `
      <div class="neg-agent-decision">
        <span class="neg-decision-icon">${decided ? '✅' : '❌'}</span>
        <div>
          <div class="agent-name">${a.name}</div>
          <div class="agent-role" style="font-size:11px; color:var(--color-text-faint);">${a.decision || '—'}</div>
        </div>
      </div>
    `;
  }).join('');

  // Stats grid
  const statsHtml = [
    { label: 'Result', value: result === 'agreement' ? 'Agreement' : result === 'rejection' ? 'No Deal' : 'Timeout', cls: result === 'agreement' ? 'success' : result === 'rejection' ? 'danger' : 'warning' },
    finalOffer ? { label: 'Final Value', value: formatINR(finalOffer), cls: 'primary' } : null,
    { label: 'Rounds Used', value: `${rounds} / ${maxRounds}` },
    // Initial vs final offers
    ...(agents || []).map(a => a.initialOffer ? ({ label: `${a.name} Start`, value: formatINR(a.initialOffer) }) : null).filter(Boolean),
    ...(agents || []).map(a => a.finalOffer && a.finalOffer !== a.initialOffer ? ({ label: `${a.name} Final`, value: formatINR(a.finalOffer) }) : null).filter(Boolean),
  ].filter(Boolean);

  const statsGridHtml = statsHtml.map(s => `
    <div class="neg-stat-card">
      <div class="neg-stat-label">${s.label}</div>
      <div class="neg-stat-value ${s.cls || ''}">${s.value}</div>
    </div>
  `).join('');

  panel.innerHTML = `
    <div class="neg-complete-icon ${iconClass}">${icon}</div>
    <div class="neg-complete-title">${titleText}</div>
    <p class="neg-complete-subtitle">${reason || ''}</p>

    <div class="neg-agent-decisions">${agentDecisionsHtml}</div>

    <div class="neg-complete-stats">${statsGridHtml}</div>
  `;

  panel.style.display = 'block';

  // Update status bar to show agreement value
  if (result === 'agreement' && finalOffer) {
    const offersEl = document.getElementById('neg-offers');
    if (offersEl) {
      offersEl.innerHTML = `
        <div class="neg-offer-stat">
          <div class="neg-offer-stat-label">✅ Agreed Price</div>
          <div class="neg-offer-stat-value agreement-value">${formatINR(finalOffer)}</div>
        </div>
      `;
    }
  }

  // Scroll to panel
  setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/* ============================== Start Negotiation Handler ============================== */

async function handleStartNegotiation() {
  const state = AppState.getState();
  const scenario = AppState.getSelectedScenario();
  const btn = document.getElementById('btn-start-negotiation');
  const backendValidation = document.getElementById('backend-validation');

  // Hide previous errors
  backendValidation.classList.remove('show');

  // Validate
  if (!state.selectedScenarioId || !scenario) {
    backendValidation.querySelector('#backend-validation-msg').textContent = 'No scenario selected.';
    backendValidation.classList.add('show');
    return;
  }

  if (!AppState.allPersonalitiesSelected()) {
    backendValidation.querySelector('#backend-validation-msg').textContent = 'Please configure all agent personalities first.';
    backendValidation.classList.add('show');
    return;
  }

  // Disable button
  btn.disabled = true;
  document.getElementById('btn-start-text').textContent = '⏳ Starting Negotiation...';

  // Check backend health
  const isHealthy = await window.ApiService.checkHealth();
  if (!isHealthy) {
    document.getElementById('backend-validation-msg').textContent =
      'Cannot connect to backend (localhost:8001). Please run: cd backend && node server.js';
    backendValidation.classList.add('show');
    btn.disabled = false;
    document.getElementById('btn-start-text').textContent = '🚀 Start Negotiation';
    return;
  }
  try {
    // Read maxRounds from input
    const maxRoundsEl = document.getElementById('input-max-rounds');
    const maxRounds = maxRoundsEl ? parseInt(maxRoundsEl.value, 10) : 10;

    // 1. Create negotiation session
    AppState.setNegotiationState({ negotiationStatus: 'starting' });
    const session = await window.ApiService.createNegotiation(
      state.selectedScenarioId,
      state.personalities,
      { maxRounds }
    );

    const negotiationId = session.id;

    // 2. Open new tab instead of continuing inline
    window.open(`?negId=${negotiationId}`, '_blank');
    
    // Reset button so user can start another one
    btn.disabled = false;
    document.getElementById('btn-start-text').textContent = '🚀 Start Another Negotiation';
    AppState.setNegotiationState({ negotiationStatus: 'idle' });

  } catch (err) {

    document.getElementById('backend-validation-msg').textContent =
      `Failed to start negotiation: ${err.message}`;
    backendValidation.classList.add('show');
    btn.disabled = false;
    document.getElementById('btn-start-text').textContent = '🚀 Start Negotiation';

    // Switch back to start panel if live panel was already shown
    document.getElementById('neg-start-panel').style.display = 'block';
    document.getElementById('neg-live-panel').style.display = 'none';
  }
}

/* ============================== WebSocket Event Handler ============================== */

function handleNegotiationEvent(eventName, data, agents) {
  const state = AppState.getState();

  switch (eventName) {

    case 'connection_established': {
      // Replay messages if reconnecting
      if (data.messages && data.messages.length > 0) {
        data.messages.forEach(msg => {
          const agentIndex = agents.findIndex(a => a.id === msg.agentId);
          appendChatMessage(msg, agentIndex >= 0 ? agentIndex : 0);
        });
        if (data.offers) {
          updateStatusBar(data.offers, agents, data.currentRound || 0, state.maxRounds);
        }
      }
      break;
    }

    case 'negotiation_started': {
      AppState.setNegotiationState({ negotiationStatus: 'in_progress' });
      updateNegotiationHeader('in_progress', 0, data.maxRounds || state.maxRounds, data.scenario?.name);
      break;
    }

    case 'round_started': {
      AppState.setNegotiationState({ currentRound: data.round });
      updateNegotiationHeader('in_progress', data.round, data.maxRounds || state.maxRounds, AppState.getSelectedScenario()?.name);
      document.getElementById('neg-round-badge').textContent = `Round ${data.round} / ${data.maxRounds || state.maxRounds}`;
      break;
    }

    case 'agent_thinking': {
      const agentIndex = agents.findIndex(a => a.id === data.agentId);
      showThinkingIndicator(data.agentName, agentIndex >= 0 ? agentIndex : 0, data.thinkingPhrase);
      updateNegotiationHeader('in_progress', state.currentRound, state.maxRounds, AppState.getSelectedScenario()?.name);
      break;
    }

    case 'agent_message': {
      const agentIndex = agents.findIndex(a => a.id === data.agentId);
      appendChatMessage(data, agentIndex >= 0 ? agentIndex : 0);
      AppState.addMessage(data);
      break;
    }

    case 'offer_updated': {
      const freshState = AppState.getState();
      const updatedOffers = { ...freshState.offers, ...(data.offers || { [data.agentId]: data.offer }) };
      AppState.setNegotiationState({ offers: updatedOffers });
      updateStatusBar(updatedOffers, agents, data.round || freshState.currentRound, freshState.maxRounds);
      break;
    }

    case 'negotiation_completed': {
      removeThinkingIndicator();
      AppState.setNegotiationState({
        negotiationStatus: 'completed',
        negotiationResult: data.result,
        negotiationReason: data.reason,
        finalOffer: data.finalOffer,
      });

      const finalStatus = data.result === 'agreement' ? 'completed' : 'failed';
      updateNegotiationHeader(finalStatus, state.currentRound, state.maxRounds, AppState.getSelectedScenario()?.name);

      // Hide stop button
      const stopBtn = document.getElementById('btn-stop-negotiation');
      if (stopBtn) stopBtn.style.display = 'none';

      showCompletionPanel({
        ...data,
        agents: data.agents,
        rounds: data.rounds || state.currentRound,
        maxRounds: state.maxRounds,
      });

      window.ApiService.disconnectWebSocket();
      break;
    }

    case 'negotiation_failed': {
      removeThinkingIndicator();
      AppState.setNegotiationState({ negotiationStatus: 'failed' });
      updateNegotiationHeader('failed', state.currentRound, state.maxRounds, AppState.getSelectedScenario()?.name);

      showCompletionPanel({
        result: 'error',
        reason: data.reason || 'An unexpected error occurred.',
        rounds: state.currentRound,
        maxRounds: state.maxRounds,
        agents: [],
        finalOffer: null,
      });

      window.ApiService.disconnectWebSocket();
      break;
    }
  }
}

/* ============================== Stop Negotiation ============================== */

async function handleStopNegotiation() {
  const { negotiationId } = AppState.getState();
  if (!negotiationId) return;

  const btn = document.getElementById('btn-stop-negotiation');
  if (btn) { btn.disabled = true; btn.textContent = 'Stopping...'; }

  try {
    await window.ApiService.stopNegotiation(negotiationId);
    window.ApiService.disconnectWebSocket();
    AppState.setNegotiationState({ negotiationStatus: 'stopped' });

    removeThinkingIndicator();
    updateNegotiationHeader('stopped', AppState.getState().currentRound, AppState.getState().maxRounds, AppState.getSelectedScenario()?.name);

    showCompletionPanel({
      result: 'stopped',
      reason: 'Negotiation was stopped by you.',
      rounds: AppState.getState().currentRound,
      maxRounds: AppState.getState().maxRounds,
      agents: [],
      finalOffer: null,
    });
  } catch (err) {
    console.error('Failed to stop negotiation:', err);
    if (btn) { btn.disabled = false; btn.textContent = '■ Stop'; }
  }
}

/* ============================== Render / State Machine ============================== */

function render() {
  const { currentStep } = AppState.getState();
  renderScenarioGrid();
  if (currentStep === AppState.STEPS.CONFIGURE) renderAgentGrid();
  if (currentStep === AppState.STEPS.SUMMARY)   renderSummary();
  if (currentStep === AppState.STEPS.NEGOTIATE)  renderNegotiateScreen();
  showScreen(currentStep);
}

/* ============================== Init / Wire Up ============================== */

async function init() {
  AppState.onChange(render);

  const params = new URLSearchParams(window.location.search);
  const negId = params.get('negId');
  let isSpecialBoot = false;

  if (negId) {
    isSpecialBoot = true;
    // Special boot for a fresh tab with an active negotiation
    try {
      const session = await window.ApiService.getNegotiation(negId);
      
      await AppState.loadScenarios();
      await AppState.selectScenario(session.scenarioId);
      
      session.agents.forEach(a => {
        AppState.setPersonality(a.id, a.personality);
      });

      AppState.setNegotiationState({ 
        negotiationId: negId, 
        maxRounds: session.maxRounds || 10,
        negotiationStatus: 'starting'
      });

      AppState.goToStep(AppState.STEPS.NEGOTIATE);
      render(); // Force render to populate dom elements immediately

      const scenario = AppState.getSelectedScenario();
      if (!scenario) throw new Error('Could not load the scenario for this negotiation.');
      const agents = scenario.agents || [];
      
      updateNegotiationHeader('starting', 0, session.maxRounds || 10, scenario.name);

      window.ApiService.connectWebSocket(negId, {
        onOpen: () => {
          console.log('[Negotiation] WebSocket connected');
        },
        onEvent: (eventName, data) => {
          handleNegotiationEvent(eventName, data, agents);
        },
        onClose: (event) => {
          if (AppState.getState().negotiationStatus === 'in_progress') {
            console.warn('[Negotiation] WebSocket closed unexpectedly');
            updateNegotiationHeader('disconnected', AppState.getState().currentRound, AppState.getState().maxRounds, scenario.name);
          }
        },
        onError: (err) => {
          console.error('[Negotiation] WebSocket error:', err);
        },
      });

      if (session.status === 'created' || session.status === 'starting') {
        await window.ApiService.startNegotiation(negId);
      } else {
        AppState.setNegotiationState({ negotiationStatus: session.status });
      }

    } catch (err) {
      console.error('Failed to load negotiation session:', err);
      document.body.innerHTML = `<div style="padding: 40px; text-align: center; font-family: sans-serif; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <h2 style="color:var(--danger)">Failed to load negotiation</h2>
        <p style="color:var(--text-secondary); margin-bottom: 24px;">${err.message}</p>
        <a href="index.html" class="btn btn-primary" style="text-decoration:none;">Return to Home</a>
      </div>`;
    }
  }

  // Normal App Initialization
  // Screen 1
  document.getElementById('btn-scenario-continue').addEventListener('click', handleScenarioContinue);

  // Screen 2
  document.getElementById('btn-configure-back').addEventListener('click', () => AppState.goToStep(AppState.STEPS.SCENARIO));
  document.getElementById('btn-configure-continue').addEventListener('click', handleConfigureContinue);
  document.getElementById('btn-save-config').addEventListener('click', handleSaveConfiguration);

  // Screen 3
  document.getElementById('btn-summary-back').addEventListener('click', () => AppState.goToStep(AppState.STEPS.CONFIGURE));
  document.getElementById('btn-summary-continue').addEventListener('click', () => {
    AppState.resetNegotiation();
    AppState.goToStep(AppState.STEPS.NEGOTIATE);
  });

  // Screen 4 — Start panel
  document.getElementById('btn-start-negotiation').addEventListener('click', handleStartNegotiation);
  document.getElementById('btn-ready-back').addEventListener('click', () => {
    window.ApiService.disconnectWebSocket();
    AppState.resetNegotiation();
    AppState.goToStep(AppState.STEPS.SUMMARY);
  });
  document.getElementById('btn-ready-restart').addEventListener('click', () => {
    window.ApiService.disconnectWebSocket();
    AppState.reset();
    AppState.resetNegotiation();
    window.history.replaceState({}, document.title, window.location.pathname);
  });

  // Screen 4 — Live panel
  document.getElementById('btn-stop-negotiation').addEventListener('click', handleStopNegotiation);
  document.getElementById('btn-negotiation-restart').addEventListener('click', () => {
    window.ApiService.disconnectWebSocket();
    AppState.reset();
    AppState.resetNegotiation();
    window.history.replaceState({}, document.title, window.location.pathname);
  });

  if (!isSpecialBoot) {
    AppState.loadScenarios();
    render();
  }
}

document.addEventListener('DOMContentLoaded', init);
