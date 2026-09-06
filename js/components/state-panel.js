/**
 * js/components/state-panel.js
 * Negotiation State Panel — round tracking, turn order, negotiation status.
 * Mounts into #ln-state-panel.
 *
 * Public API:
 *   StatePanel.mount(containerId?)
 *   StatePanel.update(round, maxRounds, activeTurnName, status)
 *   StatePanel.setActiveTurn(agentName)
 *   StatePanel.updateStatus(status)
 *   StatePanel.reset()
 */

const StatePanel = (function () {

  const STATUS_MAP = {
    idle:        { label: 'IDLE',        cls: 'sp-status-idle' },
    starting:    { label: 'INITIALIZING',cls: 'sp-status-starting' },
    in_progress: { label: 'IN PROGRESS', cls: 'sp-status-live' },
    completed:   { label: 'ACCEPTED',    cls: 'sp-status-accepted' },
    agreement:   { label: 'ACCEPTED',    cls: 'sp-status-accepted' },
    failed:      { label: 'TERMINATED',  cls: 'sp-status-terminated' },
    stopped:     { label: 'TERMINATED',  cls: 'sp-status-terminated' },
    rejection:   { label: 'TERMINATED',  cls: 'sp-status-terminated' },
    max_rounds:  { label: 'TIMED OUT',   cls: 'sp-status-timeout' },
    error:       { label: 'ERROR',       cls: 'sp-status-terminated' },
  };

  let _container = null;
  let _state = {
    round: 0,
    maxRounds: 10,
    activeTurn: '—',
    status: 'idle',
  };

  function _el(id) {
    return _container ? _container.querySelector(`#${id}`) : null;
  }

  function mount(containerId = 'ln-state-panel') {
    _container = document.getElementById(containerId);
    if (!_container) return;

    _container.innerHTML = `
      <div class="sp-root">
        <div class="sp-header">
          <div class="sp-header-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </div>
          <div class="sp-header-text">
            <div class="sp-header-title">NEGOTIATION STATE</div>
            <div class="sp-header-sub" id="sp-orch-label">ORCHESTRATOR — READY</div>
          </div>
          <div class="sp-status-badge" id="sp-status-badge">
            <span class="sp-status-dot" id="sp-status-dot"></span>
            <span id="sp-status-text">IDLE</span>
          </div>
        </div>

        <div class="sp-metrics">
          <div class="sp-metric-block">
            <div class="sp-metric-label">CURRENT ROUND</div>
            <div class="sp-metric-value" id="sp-round">— / —</div>
            <div class="sp-metric-bar-wrap">
              <div class="sp-metric-bar-track">
                <div class="sp-metric-bar-fill" id="sp-round-bar" style="width: 0%"></div>
              </div>
            </div>
          </div>

          <div class="sp-metric-sep" aria-hidden="true"></div>

          <div class="sp-metric-block">
            <div class="sp-metric-label">ACTIVE TURN</div>
            <div class="sp-metric-value sp-turn-value" id="sp-turn">—</div>
            <div class="sp-metric-hint" id="sp-turn-hint">Awaiting round start</div>
          </div>

          <div class="sp-metric-sep" aria-hidden="true"></div>

          <div class="sp-metric-block">
            <div class="sp-metric-label">NEGOTIATION STATUS</div>
            <div class="sp-metric-value" id="sp-status-value">—</div>
            <div class="sp-metric-hint" id="sp-status-hint">Not started</div>
          </div>
        </div>
      </div>
    `;

    _render();
  }

  function _render() {
    if (!_container) return;
    const { round, maxRounds, activeTurn, status } = _state;
    const statusInfo = STATUS_MAP[status] || { label: status.toUpperCase(), cls: 'sp-status-idle' };

    // Round
    const roundEl = _el('sp-round');
    if (roundEl) roundEl.textContent = round > 0 ? `${round} / ${maxRounds}` : `— / ${maxRounds}`;
    const barEl = _el('sp-round-bar');
    if (barEl) barEl.style.width = maxRounds > 0 ? `${Math.min(100, (round / maxRounds) * 100)}%` : '0%';

    // Active turn
    const turnEl = _el('sp-turn');
    if (turnEl) turnEl.textContent = activeTurn || '—';
    const turnHint = _el('sp-turn-hint');
    if (turnHint) {
      turnHint.textContent = activeTurn && activeTurn !== '—'
        ? `${activeTurn} is responding`
        : round > 0 ? 'Turn complete' : 'Awaiting round start';
    }

    // Status
    const statusBadge = _el('sp-status-badge');
    const statusDot   = _el('sp-status-dot');
    const statusText  = _el('sp-status-text');
    const statusVal   = _el('sp-status-value');
    const statusHint  = _el('sp-status-hint');
    const orchLabel   = _el('sp-orch-label');

    if (statusBadge) {
      statusBadge.className = `sp-status-badge ${statusInfo.cls}`;
    }
    if (statusDot) {
      statusDot.className = 'sp-status-dot';
      if (status === 'in_progress' || status === 'starting') statusDot.classList.add('sp-dot-live');
    }
    if (statusText)  statusText.textContent  = statusInfo.label;
    if (statusVal)   statusVal.textContent   = statusInfo.label;

    if (statusHint) {
      const hints = {
        idle:        'No negotiation active',
        starting:    'Initializing agents…',
        in_progress: round > 0 ? `Round ${round} of ${maxRounds} underway` : 'Negotiation running…',
        completed:   'Agreement reached',
        agreement:   'Agreement reached',
        failed:      'No agreement reached',
        stopped:     'Stopped by user',
        rejection:   'Offer rejected — no deal',
        max_rounds:  'Maximum rounds exhausted',
        error:       'An error occurred',
      };
      statusHint.textContent = hints[status] || '';
    }

    if (orchLabel) {
      const orchLabels = {
        idle:        'ORCHESTRATOR — READY',
        starting:    'ORCHESTRATOR — INITIALIZING',
        in_progress: activeTurn && activeTurn !== '—'
          ? `ROUND ${round} — AWAITING ${activeTurn.toUpperCase()}`
          : round > 0 ? `ROUND ${round} — STATE UPDATED` : 'ORCHESTRATOR — RUNNING',
        completed:   'ORCHESTRATOR — AGREEMENT CONFIRMED',
        agreement:   'ORCHESTRATOR — AGREEMENT CONFIRMED',
        failed:      'ORCHESTRATOR — TERMINATION CHECK COMPLETE',
        stopped:     'ORCHESTRATOR — SESSION TERMINATED',
        rejection:   'ORCHESTRATOR — TERMINATION CHECK COMPLETE',
        max_rounds:  'ORCHESTRATOR — MAX ROUNDS REACHED',
        error:       'ORCHESTRATOR — ERROR STATE',
      };
      orchLabel.textContent = orchLabels[status] || 'ORCHESTRATOR';
    }
  }

  function update(round, maxRounds, activeTurnName, status) {
    _state = { round, maxRounds, activeTurn: activeTurnName, status };
    _render();
    _flash();
  }

  function setActiveTurn(agentName) {
    _state.activeTurn = agentName;
    _render();
  }

  function updateStatus(status) {
    _state.status = status;
    if (status === 'completed' || status === 'agreement' || status === 'failed' || status === 'stopped') {
      _state.activeTurn = '—';
    }
    _render();
    _flash();
  }

  function _flash() {
    if (!_container) return;
    const root = _container.querySelector('.sp-root');
    if (!root) return;
    root.classList.remove('sp-flash');
    void root.offsetWidth;
    root.classList.add('sp-flash');
  }

  function reset() {
    _state = { round: 0, maxRounds: 10, activeTurn: '—', status: 'idle' };
    _render();
  }

  return { mount, update, setActiveTurn, updateStatus, reset };
})();

window.StatePanel = StatePanel;
