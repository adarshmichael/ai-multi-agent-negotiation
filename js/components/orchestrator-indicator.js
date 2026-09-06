/**
 * js/components/orchestrator-indicator.js
 * Orchestrator Activity Indicator — hexagonal element that shows the orchestrator
 * mediating each turn transition: STATE PASS → AGENT TURN → STATE UPDATED.
 * Geometry is CSS clip-path hexagon (distinct from agent dodecahedrons in 3D scene).
 * All offer/counteroffer motion visually routes through this node.
 *
 * Public API:
 *   OrchestratorIndicator.mount(containerId?)
 *   OrchestratorIndicator.setPhase(phase, label?)
 *   OrchestratorIndicator.reset()
 *
 * Phases: 'idle' | 'state_pass' | 'agent_turn' | 'state_updated' | 'termination_check' | 'complete'
 */

const OrchestratorIndicator = (function () {

  const PHASES = {
    idle: {
      label:     'ORCHESTRATOR — READY',
      sublabel:  'Awaiting negotiation start',
      cls:       'oi-phase-idle',
      pulsing:   false,
    },
    state_pass: {
      label:     'STATE PASS',
      sublabel:  'Distributing state to agents',
      cls:       'oi-phase-state-pass',
      pulsing:   true,
    },
    agent_turn: {
      label:     'AGENT TURN',
      sublabel:  'Agent processing…',
      cls:       'oi-phase-agent-turn',
      pulsing:   true,
    },
    state_updated: {
      label:     'STATE UPDATED',
      sublabel:  'Offer recorded in negotiation state',
      cls:       'oi-phase-state-updated',
      pulsing:   false,
    },
    termination_check: {
      label:     'TERMINATION CHECK',
      sublabel:  'Evaluating exit conditions',
      cls:       'oi-phase-termination',
      pulsing:   true,
    },
    complete: {
      label:     'SESSION COMPLETE',
      sublabel:  'Orchestrator closed',
      cls:       'oi-phase-complete',
      pulsing:   false,
    },
  };

  // Pipeline steps always shown; we highlight the active one
  const PIPELINE = [
    { id: 'state_pass',         label: 'STATE PASS' },
    { id: 'agent_turn',         label: 'AGENT TURN' },
    { id: 'state_updated',      label: 'STATE UPDATED' },
    { id: 'termination_check',  label: 'TERMINATION CHECK' },
  ];

  let _container  = null;
  let _currentPhase = 'idle';
  let _customLabel  = null;
  let _history      = []; // last N phase transitions

  function mount(containerId = 'ln-orch-indicator') {
    _container = document.getElementById(containerId);
    if (!_container) return;

    _container.innerHTML = `
      <div class="oi-root">
        <div class="oi-header">
          <div class="oi-header-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/>
            </svg>
          </div>
          <div>
            <div class="oi-header-title">ORCHESTRATOR ACTIVITY</div>
            <div class="oi-header-sub">Turn-by-turn mediation pipeline</div>
          </div>
        </div>

        <div class="oi-body">
          <!-- Left: Hexagonal node -->
          <div class="oi-node-wrap">
            <div class="oi-node-pulse-ring" id="oi-pulse-ring"></div>
            <div class="oi-hex-node" id="oi-hex-node">
              <svg class="oi-hex-svg" viewBox="0 0 60 60" fill="none">
                <!-- Hexagon outline -->
                <polygon points="30,3 57,18 57,42 30,57 3,42 3,18"
                         stroke="currentColor" stroke-width="1.5" fill="none" opacity="0.3"/>
                <!-- Inner gear-like hex -->
                <polygon points="30,10 50,21 50,39 30,50 10,39 10,21"
                         stroke="currentColor" stroke-width="1" fill="currentColor" fill-opacity="0.06"/>
                <!-- Center mark -->
                <circle cx="30" cy="30" r="5" fill="currentColor" opacity="0.7"/>
                <circle cx="30" cy="30" r="2" fill="currentColor"/>
              </svg>
              <div class="oi-node-label" id="oi-node-label">ORCH</div>
            </div>
            <div class="oi-node-phase-label" id="oi-phase-label">ORCHESTRATOR — READY</div>
          </div>

          <!-- Right: Pipeline steps -->
          <div class="oi-pipeline">
            ${PIPELINE.map(p => `
              <div class="oi-pipe-step" id="oi-step-${p.id}">
                <div class="oi-pipe-dot" id="oi-dot-${p.id}"></div>
                <div class="oi-pipe-content">
                  <div class="oi-pipe-label">${p.label}</div>
                  <div class="oi-pipe-time" id="oi-time-${p.id}"></div>
                </div>
                <div class="oi-pipe-connector" aria-hidden="true"></div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Recent activity log -->
        <div class="oi-activity-log" id="oi-activity-log"></div>
      </div>
    `;

    _render();
  }

  function setPhase(phase, label) {
    _currentPhase = phase;
    _customLabel  = label || null;

    // Log to activity history
    const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    _history.push({ phase, label: label || PHASES[phase]?.label || phase, ts });
    if (_history.length > 8) _history = _history.slice(-8);

    _render();
    _appendActivityLog(phase, label, ts);
  }

  function _render() {
    if (!_container) return;
    const phaseInfo = PHASES[_currentPhase] || PHASES.idle;

    // Hex node
    const hexNode   = _container.querySelector('#oi-hex-node');
    const pulseRing = _container.querySelector('#oi-pulse-ring');
    const phaseLabel = _container.querySelector('#oi-phase-label');

    if (hexNode) {
      hexNode.className = `oi-hex-node ${phaseInfo.cls}`;
    }
    if (pulseRing) {
      pulseRing.classList.toggle('oi-pulsing', phaseInfo.pulsing);
    }
    if (phaseLabel) {
      phaseLabel.textContent = _customLabel || phaseInfo.label;
      phaseLabel.classList.toggle('oi-label-active', phaseInfo.pulsing);
    }

    // Pipeline steps
    const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    PIPELINE.forEach((p, idx) => {
      const stepEl = _container.querySelector(`#oi-step-${p.id}`);
      const dotEl  = _container.querySelector(`#oi-dot-${p.id}`);
      const timeEl = _container.querySelector(`#oi-time-${p.id}`);

      if (!stepEl || !dotEl) return;

      const pipelineOrder   = PIPELINE.map(x => x.id);
      const currentIdx      = pipelineOrder.indexOf(_currentPhase);
      const stepIdx         = idx;

      let stepState = 'pending';
      if (_currentPhase === 'idle' || _currentPhase === 'complete') {
        stepState = _currentPhase === 'complete' ? 'done' : 'pending';
      } else if (stepIdx < currentIdx) {
        stepState = 'done';
      } else if (stepIdx === currentIdx) {
        stepState = 'active';
      }

      stepEl.className = `oi-pipe-step oi-step-${stepState}`;
      dotEl.className  = `oi-pipe-dot oi-dot-${stepState}`;
      if (dotEl) dotEl.textContent = stepState === 'done' ? '✓' : stepState === 'active' ? '●' : '';
      if (timeEl && stepState === 'active') timeEl.textContent = ts;
      if (timeEl && stepState === 'done' && !timeEl.textContent) timeEl.textContent = ts;
    });
  }

  function _appendActivityLog(phase, label, ts) {
    const log = _container ? _container.querySelector('#oi-activity-log') : null;
    if (!log) return;

    const phaseInfo = PHASES[phase] || {};
    const icon = phase === 'state_updated' || phase === 'complete' ? '✓'
               : phase === 'termination_check' ? '◆'
               : '●';

    const entry = document.createElement('div');
    entry.className = `oi-log-entry oi-log-${phase}`;
    entry.innerHTML = `
      <span class="oi-log-icon">${icon}</span>
      <span class="oi-log-ts">${ts}</span>
      <span class="oi-log-msg">${label || phaseInfo.label || phase}</span>
    `;
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;

    // Keep max 10 entries
    while (log.children.length > 10) {
      log.removeChild(log.firstChild);
    }
  }

  function reset() {
    _currentPhase = 'idle';
    _customLabel  = null;
    _history      = [];
    const log = _container ? _container.querySelector('#oi-activity-log') : null;
    if (log) log.innerHTML = '';
    _render();
  }

  return { mount, setPhase, reset };
})();

window.OrchestratorIndicator = OrchestratorIndicator;
