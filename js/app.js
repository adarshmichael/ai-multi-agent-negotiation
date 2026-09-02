/**
 * app.js
 * Full negotiation flow — config wizard + live negotiation (inline).
 * All rendering is driven by AppState. Backend API handles LLM/rule-based logic.
 *
 * Screen Flow:
 *   1. Scenario Selection
 *   2. Configure Agents  (Goals → Constraints → Personality per agent)
 *   3. Summary           (Goals, Constraints, Personality review + max rounds)
 *   4. Negotiate         (Pre-start panel → Inline live negotiation)
 */

/* ============================== Icons ============================== */

const ICONS = {
  cart: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
  briefcase: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/></svg>',
  goal: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
};

/* ============================== Utilities ============================== */

function initials(name) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function formatINR(amount) {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(amount);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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
  const currentIndex    = STEP_ORDER.findIndex(s => s.id === currentStep);
  const el = document.getElementById('stepper');
  el.innerHTML = STEP_ORDER.map((step, i) => {
    const cls       = i === currentIndex ? 'active' : i < currentIndex ? 'done' : '';
    const connector = i < STEP_ORDER.length - 1 ? '<div class="step-connector"></div>' : '';
    return `<div class="step-pill ${cls}"><span class="dot"></span>${step.label}</div>${connector}`;
  }).join('');
}

/* ============================== Screen switching ============================== */

let lastRenderedStep = null;

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
  
  if (lastRenderedStep !== stepId) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    lastRenderedStep = stepId;
  }
}

/* ============================== 3D tilt interaction ============================== */

function attachTiltEffect(card) {
  const maxTilt = 8;
  card.addEventListener('mousemove', e => {
    const rect    = card.getBoundingClientRect();
    const px      = (e.clientX - rect.left) / rect.width;
    const py      = (e.clientY - rect.top) / rect.height;
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

/* ============================== Screen 1: Scenario Selection ============================== */

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
    const isSelected  = scenario.id === selectedScenarioId;
    const agentChips  = scenario.agents.map(a => `<span class="agent-chip">${a.name}</span>`).join('');
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

/* ============================== Screen 2: Agent Configuration ============================== */

/**
 * Render the agent grid with a 3-tab UI per agent:
 *   Tab 1 — Goals (must be done first)
 *   Tab 2 — Constraints (unlocked after goals)
 *   Tab 3 — Personality (unlocked after goals + constraints)
 */
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

  grid.innerHTML = scenario.agents.map(agent => renderAgentCard(agent)).join('');

  // Wire up interactions for all agent cards
  scenario.agents.forEach(agent => wireAgentCard(agent));
}

function renderAgentCard(agent) {
  const goalsConfigured      = AppState.getGoals(agent.id).length > 0;
  const constraintState      = AppState.getConstraints(agent.id);
  const constraintsConfigured = constraintState.selected && constraintState.selected.length > 0;
  const personalityConfigured = !!AppState.getPersonality(agent.id);
  const currentTab           = AppState.getAgentConfigTab(agent.id) || 'goals';

  const tabGoalsClass       = currentTab === 'goals'       ? 'active' : goalsConfigured ? 'done' : '';
  const tabConstraintsClass = currentTab === 'constraints' ? 'active'
    : !goalsConfigured ? 'locked'
    : constraintsConfigured ? 'done' : '';
  const tabPersonalityClass = currentTab === 'personality' ? 'active'
    : (!goalsConfigured || !constraintsConfigured) ? 'locked'
    : personalityConfigured ? 'done' : '';

  // Progress dots
  const dot1 = goalsConfigured ? 'done' : currentTab === 'goals' ? 'active' : '';
  const dot2 = constraintsConfigured ? 'done' : currentTab === 'constraints' ? 'active' : '';
  const dot3 = personalityConfigured ? 'done' : currentTab === 'personality' ? 'active' : '';

  const selectedPersonality = AppState.getPersonality(agent.id);
  const personalityButtons  = PERSONALITIES.map(p => {
    const active = p.id === selectedPersonality ? 'active' : '';
    return `<button class="personality-btn ${active}" type="button" data-agent-id="${agent.id}" data-personality-id="${p.id}" title="${p.description}">${p.label}</button>`;
  }).join('');

  // Goals panel content
  const selectedGoals = AppState.getGoals(agent.id);
  const goalChips = (agent.goalOptions || []).map(goal => {
    const selected = selectedGoals.includes(goal) ? 'selected' : '';
    return `<div class="goal-chip ${selected}" data-goal="${escapeHtml(goal)}" data-agent-id="${agent.id}">${escapeHtml(goal)}</div>`;
  }).join('');

  const selectedGoalTags = selectedGoals.map(goal =>
    `<span class="selected-goal-tag">${escapeHtml(goal)}<button class="remove-goal-btn" data-agent-id="${agent.id}" data-goal="${escapeHtml(goal)}">✕</button></span>`
  ).join('');

  // Constraints panel content
  const constraintOpts = (agent.constraintOptions || []).map(opt => {
    const isSelected = (constraintState.selected || []).includes(opt.label);
    const numericVal = opt.numericType === 'max'
      ? (constraintState.numericMax || opt.defaultValue || '')
      : (constraintState.numericMin || opt.defaultValue || '');

    const numericSection = opt.hasNumeric ? `
      <div class="constraint-numeric-wrap">
        <div class="constraint-numeric-label">${opt.numericLabel}</div>
        <input
          type="number"
          class="constraint-numeric-input"
          data-agent-id="${agent.id}"
          data-constraint-id="${opt.id}"
          data-numeric-type="${opt.numericType}"
          value="${isSelected ? numericVal : ''}"
          placeholder="${opt.placeholder || ''}"
          min="0"
          step="1000"
        >
      </div>
    ` : '';

    return `
      <div class="constraint-option-row ${isSelected ? 'selected' : ''}"
           data-agent-id="${agent.id}"
           data-constraint-id="${opt.id}"
           data-constraint-label="${escapeHtml(opt.label)}">
        <div class="constraint-option-top">
          <div class="constraint-checkbox"></div>
          <div class="constraint-option-label">${escapeHtml(opt.label)}</div>
        </div>
        ${numericSection}
      </div>
    `;
  }).join('');

  return `
    <div class="agent-card" data-agent-id="${agent.id}" id="agent-card-${agent.id}">

      <!-- Tab bar -->
      <div class="agent-config-tabs">
        <button class="agent-config-tab-btn ${tabGoalsClass}" data-agent-id="${agent.id}" data-tab="goals">
          🎯 Goals
        </button>
        <button class="agent-config-tab-btn ${tabConstraintsClass}" data-agent-id="${agent.id}" data-tab="constraints"
                ${!goalsConfigured ? 'disabled' : ''}>
          🔒 Constraints
        </button>
        <button class="agent-config-tab-btn ${tabPersonalityClass}" data-agent-id="${agent.id}" data-tab="personality"
                ${(!goalsConfigured || !constraintsConfigured) ? 'disabled' : ''}>
          🎭 Personality
        </button>
      </div>

      <!-- Agent Header -->
      <div class="agent-card-header">
        <div class="agent-avatar">${initials(agent.name)}</div>
        <div>
          <div class="agent-name">${agent.name}</div>
          <div class="agent-role">${agent.role}</div>
          <div class="agent-config-progress">
            <div class="config-step-dot ${dot1}" title="Goals"></div>
            <div class="config-step-dot ${dot2}" title="Constraints"></div>
            <div class="config-step-dot ${dot3}" title="Personality"></div>
            <span class="config-progress-label">
              ${personalityConfigured ? 'Fully configured ✓' :
                constraintsConfigured ? 'Select personality' :
                goalsConfigured ? 'Add constraints' : 'Start with goals'}
            </span>
          </div>
        </div>
      </div>

      <!-- TAB 1: Goals -->
      <div class="tab-panel ${currentTab === 'goals' ? 'active' : ''}" data-panel="goals" data-agent-id="${agent.id}">
        <div class="goals-section-label">Select one or more goals</div>
        <div class="goals-grid">
          ${goalChips}
        </div>
        <div class="custom-goal-row">
          <input type="text" class="custom-goal-input" id="custom-goal-input-${agent.id}"
                 placeholder="Add a custom goal..." maxlength="80">
          <button class="btn-add-goal" data-agent-id="${agent.id}" title="Add goal">+</button>
        </div>
        ${selectedGoalTags ? `
          <div class="selected-goals-list" id="selected-goals-${agent.id}" style="margin-top:12px;">
            ${selectedGoalTags}
          </div>` : `<div class="selected-goals-list" id="selected-goals-${agent.id}"></div>`}
        <div class="goals-validation-hint" id="goals-hint-${agent.id}">
          ${selectedGoals.length === 0 ? 'Select at least one goal to continue.' : `${selectedGoals.length} goal${selectedGoals.length > 1 ? 's' : ''} selected.`}
        </div>
        <button class="tab-next-btn" data-agent-id="${agent.id}" data-next-tab="constraints"
                ${selectedGoals.length === 0 ? 'disabled' : ''}>
          Next: Constraints →
        </button>
      </div>

      <!-- TAB 2: Constraints -->
      <div class="tab-panel ${currentTab === 'constraints' ? 'active' : ''}" data-panel="constraints" data-agent-id="${agent.id}">
        <div class="goals-section-label">Configure constraints</div>
        <div class="constraint-options-list">
          ${constraintOpts}
        </div>
        <div class="goals-validation-hint" id="constraints-hint-${agent.id}">
          ${constraintsConfigured
            ? `${constraintState.selected.length} constraint${constraintState.selected.length > 1 ? 's' : ''} selected.`
            : 'Select at least one constraint to continue.'}
        </div>
        <button class="tab-next-btn" data-agent-id="${agent.id}" data-next-tab="personality"
                ${!constraintsConfigured ? 'disabled' : ''}>
          Next: Personality →
        </button>
      </div>

      <!-- TAB 3: Personality -->
      <div class="tab-panel ${currentTab === 'personality' ? 'active' : ''}" data-panel="personality" data-agent-id="${agent.id}">
        <div class="personality-label">Select negotiation personality</div>
        <div class="personality-options">${personalityButtons}</div>
        ${!personalityConfigured ? `<div class="goals-validation-hint">Select a personality to complete configuration.</div>` : ''}
      </div>

    </div>
  `;
}

function wireAgentCard(agent) {
  const card = document.getElementById(`agent-card-${agent.id}`);
  if (!card) return;

  // ---- Tab switching ----
  card.querySelectorAll('.agent-config-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled || btn.classList.contains('locked')) return;
      AppState.setAgentConfigTab(btn.dataset.agentId, btn.dataset.tab);
    });
  });

  // ---- Goal chips (multi-select toggle) ----
  card.querySelectorAll('.goal-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const goal    = chip.dataset.goal;
      const agentId = chip.dataset.agentId;
      const current = [...AppState.getGoals(agentId)];
      const idx     = current.indexOf(goal);
      if (idx >= 0) current.splice(idx, 1);
      else          current.push(goal);
      AppState.setGoals(agentId, current);
    });
  });

  // ---- Add custom goal ----
  const customInput = document.getElementById(`custom-goal-input-${agent.id}`);
  const addBtn      = card.querySelector('.btn-add-goal');
  if (customInput && addBtn) {
    const addCustomGoal = () => {
      const val = customInput.value.trim();
      if (!val) return;
      const current = [...AppState.getGoals(agent.id)];
      if (!current.includes(val)) current.push(val);
      AppState.setGoals(agent.id, current);
      customInput.value = '';
    };
    addBtn.addEventListener('click', addCustomGoal);
    customInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); addCustomGoal(); }
    });
  }

  // ---- Remove goal tags ----
  card.querySelectorAll('.remove-goal-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const goal    = btn.dataset.goal;
      const agentId = btn.dataset.agentId;
      const current = AppState.getGoals(agentId).filter(g => g !== goal);
      AppState.setGoals(agentId, current);
    });
  });

  // ---- Constraint option rows (toggle + numeric) ----
  card.querySelectorAll('.constraint-option-row').forEach(row => {
    row.addEventListener('click', e => {
      // Don't toggle if clicking inside the numeric input
      if (e.target.classList.contains('constraint-numeric-input')) return;

      const agentId = row.dataset.agentId;
      const label   = row.dataset.constraintLabel;
      const current = AppState.getConstraints(agentId);
      const selected = [...(current.selected || [])];
      const idx = selected.indexOf(label);

      if (idx >= 0) selected.splice(idx, 1);
      else          selected.push(label);

      AppState.setConstraints(agentId, { ...current, selected });
    });
  });

  // ---- Numeric constraint inputs ----
  card.querySelectorAll('.constraint-numeric-input').forEach(input => {
    input.addEventListener('change', () => {
      const agentId     = input.dataset.agentId;
      const numericType = input.dataset.numericType;
      const val         = parseFloat(input.value) || null;
      const current     = AppState.getConstraints(agentId);

      if (numericType === 'max') {
        AppState.setConstraints(agentId, { ...current, numericMax: val });
      } else if (numericType === 'min') {
        AppState.setConstraints(agentId, { ...current, numericMin: val });
      }
    });
    // Prevent row click propagation from numeric input
    input.addEventListener('click', e => e.stopPropagation());
  });

  // ---- "Next" tab buttons ----
  card.querySelectorAll('.tab-next-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      AppState.setAgentConfigTab(btn.dataset.agentId, btn.dataset.nextTab);
    });
  });

  // ---- Personality buttons ----
  card.querySelectorAll('.personality-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      AppState.setPersonality(btn.dataset.agentId, btn.dataset.personalityId);
      document.getElementById('personality-validation').classList.remove('show');
    });
  });
}

function handleConfigureContinue() {
  const scenario = AppState.getSelectedScenario();
  if (!scenario) return;

  // Validate all agents have goals, constraints, and personality
  const unfinished = scenario.agents.find(a => {
    const goals = AppState.getGoals(a.id);
    const c     = AppState.getConstraints(a.id);
    const p     = AppState.getPersonality(a.id);
    return goals.length === 0 || !c.selected || c.selected.length === 0 || !p;
  });

  if (unfinished) {
    const banner = document.getElementById('personality-validation');
    banner.querySelector('span:last-child').textContent =
      `Please complete Goals → Constraints → Personality for all agents. "${unfinished.name}" is not fully configured.`;
    banner.classList.add('show');
    // Scroll to the incomplete agent card
    const el = document.getElementById(`agent-card-${unfinished.id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  document.getElementById('personality-validation').classList.remove('show');
  AppState.goToStep(AppState.STEPS.SUMMARY);
}

function handleSaveConfiguration() {
  if (!AppState.allAgentsFullyConfigured()) {
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
    const personality   = PERSONALITIES.find(p => p.id === personalityId);
    const goals         = AppState.getGoals(agent.id);
    const constraintState = AppState.getConstraints(agent.id);
    const constraints   = constraintState.selected || [];

    const numericLabel = agent.numericConstraint?.type === 'max'
      ? (constraintState.numericMax ? `Budget limit: ${formatINR(constraintState.numericMax)}` : '')
      : (constraintState.numericMin ? `Minimum: ${formatINR(constraintState.numericMin)}` : '');

    return `
      <div class="summary-card">
        <div class="summary-card-top">
          <div class="agent-name">${agent.name}</div>
          <span class="personality-tag">${personality ? personality.label : '—'}</span>
        </div>
        <div class="summary-line"><strong>Role</strong><span>${agent.role}</span></div>
        <div class="summary-line summary-line-block">
          <strong>Goals</strong>
          <ul class="summary-goals-list">
            ${goals.map(g => `<li>${escapeHtml(g)}</li>`).join('')}
          </ul>
        </div>
        <div class="summary-line summary-line-block">
          <strong>Constraints</strong>
          <ul class="constraints-list">
            ${constraints.map(c => `<li>${escapeHtml(c)}</li>`).join('')}
            ${numericLabel ? `<li><em>${numericLabel}</em></li>` : ''}
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

  const metaEl     = document.getElementById('neg-start-meta');
  const agentChips = scenario.agents.map(a => {
    const pId    = personalities[a.id];
    const pLabel = PERSONALITIES.find(p => p.id === pId)?.label || '—';
    return `<span class="neg-meta-chip">🤖 ${a.name} <span style="opacity:0.6;">·</span> ${pLabel}</span>`;
  }).join('');
  metaEl.innerHTML = `<span class="neg-meta-chip">📋 ${scenario.name}</span>${agentChips}`;

  document.getElementById('neg-ready-subtitle').textContent =
    `${scenario.name} — ${scenario.agents.length} AI agents are configured and ready. Click below to start the live negotiation.`;

  document.getElementById('backend-validation').classList.remove('show');

  if (negotiationStatus === 'idle') {
    document.getElementById('neg-start-panel').style.display = 'block';
    document.getElementById('neg-live-panel').style.display  = 'none';
    const btn = document.getElementById('btn-start-negotiation');
    if (btn) {
      btn.disabled = false;
      document.getElementById('btn-start-text').textContent = '🚀 Start Negotiation';
    }
  } else if (negotiationStatus !== 'starting') {
    document.getElementById('neg-start-panel').style.display = 'none';
    document.getElementById('neg-live-panel').style.display  = 'block';
  }
}

/* ============================== Screen 4: Live Chat ============================== */

function showThinkingIndicator(agentName, agentIndex, thinkingPhrase) {
  removeThinkingIndicator();
  const chat = document.getElementById('neg-chat');
  const emptyEl = document.getElementById('neg-chat-empty');
  if (emptyEl) emptyEl.style.display = 'none';

  const alignClass  = agentIndex === 0 ? 'agent-left' : 'agent-right';
  const avatarClass = agentIndex === 1 ? 'avatar-alt' : '';

  const div = document.createElement('div');
  div.id        = 'thinking-indicator';
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
  const chat  = document.getElementById('neg-chat');
  const emptyEl = document.getElementById('neg-chat-empty');
  if (emptyEl) emptyEl.style.display = 'none';

  const alignClass  = agentIndex === 0 ? 'agent-left' : 'agent-right';
  const avatarClass = agentIndex === 1 ? 'avatar-alt' : '';

  let offerBadgeHtml = '';
  if (data.offer !== null && data.offer !== undefined) {
    let offerClass = '', offerIcon = '💰';
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
  const bar         = document.getElementById('neg-status-bar');
  const offersEl    = document.getElementById('neg-offers');
  const progressFill = document.getElementById('neg-progress-fill');
  if (!bar) return;

  const offerValues = agents.map((a, i) => ({ ...a, offer: offers[a.id] || null, index: i }));
  const offerStats  = offerValues.map(a => `
    <div class="neg-offer-stat">
      <div class="neg-offer-stat-label">🤖 ${a.name}</div>
      <div class="neg-offer-stat-value">${formatINR(a.offer)}</div>
    </div>
  `).join('');

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
  const progress = maxRounds > 0 ? Math.min(100, (round / maxRounds) * 100) : 0;
  progressFill.style.width = `${progress}%`;
  bar.style.display = 'block';
}

function updateNegotiationHeader(status, round, maxRounds, scenarioName) {
  const dot        = document.getElementById('neg-status-dot');
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

  const { result, finalOffer, reason, rounds, maxRounds, agents } = data;

  let icon = '🤝', iconClass = 'icon-agreement', titleText = '';
  switch (result) {
    case 'agreement':  icon = '🤝'; iconClass = 'icon-agreement'; titleText = 'Agreement Reached!';   break;
    case 'rejection':  icon = '❌'; iconClass = 'icon-failed';    titleText = 'No Agreement Reached'; break;
    case 'max_rounds': icon = '⏱'; iconClass = 'icon-timeout';   titleText = 'Maximum Rounds Reached'; break;
    case 'stopped':    icon = '■'; iconClass = 'icon-timeout';   titleText = 'Negotiation Stopped';   break;
    default:           icon = '⚠'; iconClass = 'icon-failed';    titleText = 'Negotiation Ended';
  }

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

  const statsHtml = [
    { label: 'Result', value: result === 'agreement' ? 'Agreement' : result === 'rejection' ? 'No Deal' : 'Timeout', cls: result === 'agreement' ? 'success' : result === 'rejection' ? 'danger' : 'warning' },
    finalOffer ? { label: 'Final Value', value: formatINR(finalOffer), cls: 'primary' } : null,
    { label: 'Rounds Used', value: `${rounds} / ${maxRounds}` },
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
  setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
}

/* ============================== Start Negotiation ============================== */

/**
 * Launch negotiation INLINE (no new tab).
 * Creates session → shows live panel → connects WS → starts engine.
 */
async function handleStartNegotiation() {
  const state    = AppState.getState();
  const scenario = AppState.getSelectedScenario();
  const btn      = document.getElementById('btn-start-negotiation');
  const backendValidation = document.getElementById('backend-validation');

  backendValidation.classList.remove('show');

  // Validate
  if (!state.selectedScenarioId || !scenario) {
    document.getElementById('backend-validation-msg').textContent = 'No scenario selected.';
    backendValidation.classList.add('show');
    return;
  }
  if (!AppState.allAgentsFullyConfigured()) {
    document.getElementById('backend-validation-msg').textContent =
      'Please complete Goals → Constraints → Personality for all agents first.';
    backendValidation.classList.add('show');
    return;
  }

  btn.disabled = true;
  document.getElementById('btn-start-text').textContent = '⏳ Starting Negotiation...';

  // Check backend health
  const isHealthy = await window.ApiService.checkHealth();
  if (!isHealthy) {
    document.getElementById('backend-validation-msg').textContent =
      'Cannot connect to backend (localhost:8001). Please run: cd backend && npm run dev';
    backendValidation.classList.add('show');
    btn.disabled = false;
    document.getElementById('btn-start-text').textContent = '🚀 Start Negotiation';
    return;
  }

  try {
    const maxRoundsEl = document.getElementById('input-max-rounds');
    const maxRounds   = maxRoundsEl ? parseInt(maxRoundsEl.value, 10) || 10 : 10;

    // 1. Create negotiation session (sends goals + constraints per agent)
    AppState.setNegotiationState({ negotiationStatus: 'starting' });
    const session = await window.ApiService.createNegotiation(
      state.selectedScenarioId,
      state.personalities,
      { maxRounds }
    );

    const negotiationId = session.id;

    // 2. Update state and switch to live panel
    AppState.setNegotiationState({
      negotiationId,
      maxRounds: session.maxRounds || maxRounds,
      negotiationStatus: 'starting',
    });

    document.getElementById('neg-start-panel').style.display = 'none';
    document.getElementById('neg-live-panel').style.display  = 'block';

    const agents = scenario.agents || [];
    updateNegotiationHeader('starting', 0, session.maxRounds || maxRounds, scenario.name);

    // 3. Connect WebSocket
    window.ApiService.connectWebSocket(negotiationId, {
      onOpen: () => {
        console.log('[Negotiation] WebSocket connected');
      },
      onEvent: (eventName, data) => {
        handleNegotiationEvent(eventName, data, agents);
      },
      onClose: (event) => {
        const status = AppState.getState().negotiationStatus;
        if (status === 'in_progress') {
          console.warn('[Negotiation] WebSocket closed unexpectedly');
          updateNegotiationHeader('disconnected', AppState.getState().currentRound, AppState.getState().maxRounds, scenario.name);
        }
      },
      onError: (err) => {
        console.error('[Negotiation] WebSocket error:', err);
      },
    });

    // 4. Start the negotiation engine
    await window.ApiService.startNegotiation(negotiationId);

  } catch (err) {
    document.getElementById('backend-validation-msg').textContent =
      `Failed to start negotiation: ${err.message}`;
    backendValidation.classList.add('show');
    btn.disabled = false;
    document.getElementById('btn-start-text').textContent = '🚀 Start Negotiation';
    AppState.setNegotiationState({ negotiationStatus: 'idle' });
    document.getElementById('neg-start-panel').style.display = 'block';
    document.getElementById('neg-live-panel').style.display  = 'none';
  }
}

/* ============================== WebSocket Event Handler ============================== */

function handleNegotiationEvent(eventName, data, agents) {
  const state = AppState.getState();

  switch (eventName) {

    case 'connection_established': {
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
      break;
    }

    case 'agent_message': {
      const agentIndex = agents.findIndex(a => a.id === data.agentId);
      appendChatMessage(data, agentIndex >= 0 ? agentIndex : 0);
      AppState.addMessage(data);
      break;
    }

    case 'offer_updated': {
      const freshState   = AppState.getState();
      const updatedOffers = { ...freshState.offers, ...(data.offers || { [data.agentId]: data.offer }) };
      AppState.setNegotiationState({ offers: updatedOffers });
      updateStatusBar(updatedOffers, agents, data.round || freshState.currentRound, freshState.maxRounds);
      break;
    }

    case 'negotiation_completed': {
      removeThinkingIndicator();
      AppState.setNegotiationState({
        negotiationStatus:  'completed',
        negotiationResult:  data.result,
        negotiationReason:  data.reason,
        finalOffer:         data.finalOffer,
      });

      const finalStatus = data.result === 'agreement' ? 'completed' : 'failed';
      updateNegotiationHeader(finalStatus, state.currentRound, state.maxRounds, AppState.getSelectedScenario()?.name);

      const stopBtn = document.getElementById('btn-stop-negotiation');
      if (stopBtn) stopBtn.style.display = 'none';

      showCompletionPanel({
        ...data,
        agents:    data.agents,
        rounds:    data.rounds || state.currentRound,
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
        result:    'error',
        reason:    data.reason || 'An unexpected error occurred.',
        rounds:    state.currentRound,
        maxRounds: state.maxRounds,
        agents:    [],
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
      result:    'stopped',
      reason:    'Negotiation was stopped by you.',
      rounds:    AppState.getState().currentRound,
      maxRounds: AppState.getState().maxRounds,
      agents:    [],
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
  const negId  = params.get('negId');
  let isSpecialBoot = false;

  // Special boot: URL has ?negId= (e.g. bookmarked negotiation or legacy link)
  if (negId) {
    isSpecialBoot = true;
    try {
      const session = await window.ApiService.getNegotiation(negId);

      await AppState.loadScenarios();
      await AppState.selectScenario(session.scenarioId);

      session.agents.forEach(a => AppState.setPersonality(a.id, a.personality));

      AppState.setNegotiationState({
        negotiationId:     negId,
        maxRounds:         session.maxRounds || 10,
        negotiationStatus: 'starting',
      });
      AppState.goToStep(AppState.STEPS.NEGOTIATE);
      render();

      const scenario = AppState.getSelectedScenario();
      if (!scenario) throw new Error('Could not load the scenario for this negotiation.');
      const agents = scenario.agents || [];

      updateNegotiationHeader('starting', 0, session.maxRounds || 10, scenario.name);

      window.ApiService.connectWebSocket(negId, {
        onOpen: () => console.log('[Negotiation] WebSocket connected'),
        onEvent: (eventName, data) => handleNegotiationEvent(eventName, data, agents),
        onClose: (event) => {
          if (AppState.getState().negotiationStatus === 'in_progress') {
            console.warn('[Negotiation] WebSocket closed unexpectedly');
            updateNegotiationHeader('disconnected', AppState.getState().currentRound, AppState.getState().maxRounds, scenario.name);
          }
        },
        onError: (err) => console.error('[Negotiation] WebSocket error:', err),
      });

      if (session.status === 'created' || session.status === 'starting') {
        await window.ApiService.startNegotiation(negId);
      } else {
        AppState.setNegotiationState({ negotiationStatus: session.status });
      }

    } catch (err) {
      console.error('Failed to load negotiation session:', err);
      document.body.innerHTML = `
        <div style="padding: 40px; text-align: center; font-family: sans-serif; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center;">
          <h2 style="color:var(--danger)">Failed to load negotiation</h2>
          <p style="color:var(--text-secondary); margin-bottom: 24px;">${err.message}</p>
          <a href="index.html" class="btn btn-primary" style="text-decoration:none;">Return to Home</a>
        </div>`;
    }
  }

  // ---- Normal app event wiring ----

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
    const chat = document.getElementById('neg-chat');
    if (chat) chat.innerHTML = '<div class="neg-chat-empty" id="neg-chat-empty"><div class="thinking-dots"><span></span><span></span><span></span></div><p>Initializing agents...</p></div>';
    const offersEl = document.getElementById('neg-offers');
    if (offersEl) offersEl.innerHTML = '';
    const progressFill = document.getElementById('neg-progress-fill');
    if (progressFill) progressFill.style.width = '0%';
    const statusBar = document.getElementById('neg-status-bar');
    if (statusBar) statusBar.style.display = 'none';
    const completePanel = document.getElementById('neg-complete-panel');
    if (completePanel) completePanel.style.display = 'none';
    window.history.replaceState({}, document.title, window.location.pathname);
  });

  // Screen 4 — Live panel
  document.getElementById('btn-stop-negotiation').addEventListener('click', handleStopNegotiation);
  document.getElementById('btn-negotiation-restart').addEventListener('click', () => {
    window.ApiService.disconnectWebSocket();
    AppState.reset();
    AppState.resetNegotiation();
    const chat = document.getElementById('neg-chat');
    if (chat) chat.innerHTML = '<div class="neg-chat-empty" id="neg-chat-empty"><div class="thinking-dots"><span></span><span></span><span></span></div><p>Initializing agents...</p></div>';
    const offersEl = document.getElementById('neg-offers');
    if (offersEl) offersEl.innerHTML = '';
    const progressFill = document.getElementById('neg-progress-fill');
    if (progressFill) progressFill.style.width = '0%';
    const statusBar = document.getElementById('neg-status-bar');
    if (statusBar) statusBar.style.display = 'none';
    const completePanel = document.getElementById('neg-complete-panel');
    if (completePanel) completePanel.style.display = 'none';
    window.history.replaceState({}, document.title, window.location.pathname);
  });

  if (!isSpecialBoot) {
    AppState.loadScenarios();
    render();
  }
}

document.addEventListener('DOMContentLoaded', init);
