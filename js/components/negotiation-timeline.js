/**
 * js/components/negotiation-timeline.js
 * Offer / Counteroffer Timeline — chronological log of all monetary moves.
 * Mounts into #ln-timeline.
 *
 * Public API:
 *   NegotiationTimeline.mount(containerId?)
 *   NegotiationTimeline.addEntry(entry)
 *   NegotiationTimeline.reset()
 *
 * Entry shape:
 *   { round, agentId, agentName, offer, decision, message, timestamp? }
 */

const NegotiationTimeline = (function () {

  let _container   = null;
  let _listEl      = null;
  let _emptyEl     = null;
  let _countEl     = null;
  let _entries     = [];
  let _isCollapsed = false;

  const DECISION_META = {
    offer:         { icon: '💰', label: 'OFFER',        cls: 'nt-decision-offer' },
    counteroffer:  { icon: '↩', label: 'COUNTER',       cls: 'nt-decision-counter' },
    accept:        { icon: '✅', label: 'ACCEPTED',      cls: 'nt-decision-accept' },
    reject:        { icon: '❌', label: 'REJECTED',      cls: 'nt-decision-reject' },
  };

  function _formatINR(amount) {
    if (amount === null || amount === undefined) return '—';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency: 'INR', maximumFractionDigits: 0,
    }).format(amount);
  }

  function _formatTime(ts) {
    return new Date(ts || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function mount(containerId = 'ln-timeline') {
    _container = document.getElementById(containerId);
    if (!_container) return;

    _container.innerHTML = `
      <div class="nt-root">
        <div class="nt-header">
          <div class="nt-header-left">
            <div class="nt-header-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            </div>
            <div>
              <div class="nt-header-title">OFFER / COUNTEROFFER TIMELINE</div>
              <div class="nt-header-sub">All monetary moves — routed through orchestrator</div>
            </div>
          </div>
          <div class="nt-header-right">
            <span class="nt-count-badge" id="nt-count">0 entries</span>
            <button class="nt-toggle-btn" id="nt-toggle" aria-expanded="true" title="Collapse timeline">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="18 15 12 9 6 15"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="nt-body" id="nt-body">
          <div class="nt-empty" id="nt-empty">
            <div class="nt-empty-icon">📊</div>
            <div class="nt-empty-text">No offers yet — waiting for round 1 to begin</div>
          </div>
          <div class="nt-list" id="nt-list"></div>
        </div>
      </div>
    `;

    _listEl  = _container.querySelector('#nt-list');
    _emptyEl = _container.querySelector('#nt-empty');
    _countEl = _container.querySelector('#nt-count');

    // Toggle
    const toggleBtn = _container.querySelector('#nt-toggle');
    const body      = _container.querySelector('#nt-body');
    if (toggleBtn && body) {
      toggleBtn.addEventListener('click', () => {
        _isCollapsed = !_isCollapsed;
        body.classList.toggle('nt-body-collapsed', _isCollapsed);
        toggleBtn.setAttribute('aria-expanded', String(!_isCollapsed));
        toggleBtn.querySelector('svg').style.transform = _isCollapsed ? 'rotate(180deg)' : '';
      });
    }
  }

  function addEntry(entry) {
    if (!_listEl) return;
    _entries.push(entry);

    // Hide empty state
    if (_emptyEl) _emptyEl.style.display = 'none';

    // Update count badge
    if (_countEl) {
      _countEl.textContent = `${_entries.length} entr${_entries.length === 1 ? 'y' : 'ies'}`;
    }

    const meta     = DECISION_META[entry.decision] || DECISION_META.offer;
    const isAccept = entry.decision === 'accept';
    const isReject = entry.decision === 'reject';
    const isBuyer  = entry.agentId === 'buyer' || entry.agentId === 'candidate' || entry.agentId === 'project-manager';

    const agentColorClass = isBuyer ? 'nt-agent-buyer' : 'nt-agent-vendor';

    const div = document.createElement('div');
    div.className = `nt-entry ${isAccept ? 'nt-entry-accept' : isReject ? 'nt-entry-reject' : ''} nt-entry-new`;
    div.innerHTML = `
      <div class="nt-entry-left">
        <div class="nt-entry-connector-line"></div>
        <div class="nt-entry-dot ${agentColorClass}"></div>
      </div>
      <div class="nt-entry-body">
        <div class="nt-entry-header">
          <div class="nt-entry-meta">
            <span class="nt-entry-agent ${agentColorClass}">${entry.agentName}</span>
            <span class="nt-entry-round">R${entry.round}</span>
            <span class="nt-decision-tag ${meta.cls}">${meta.icon} ${meta.label}</span>
          </div>
          <span class="nt-entry-time">${_formatTime(entry.timestamp)}</span>
        </div>

        ${entry.offer !== null && entry.offer !== undefined ? `
          <div class="nt-entry-offer-row">
            <div class="nt-offer-amount ${isAccept ? 'nt-offer-final' : ''}">${_formatINR(entry.offer)}</div>
            ${isAccept ? '<span class="nt-offer-final-tag">FINAL AGREED PRICE</span>' : ''}
          </div>
        ` : ''}

        ${entry.message ? `
          <div class="nt-entry-message">${_escapeHtml(entry.message)}</div>
        ` : ''}

        <div class="nt-entry-orch-note">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="10" height="10">
            <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/>
          </svg>
          Via orchestrator — state recorded
        </div>
      </div>
    `;

    _listEl.appendChild(div);
    _listEl.scrollTop = _listEl.scrollHeight;

    // Remove animation class after it plays
    setTimeout(() => div.classList.remove('nt-entry-new'), 600);
  }

  function _escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  function reset() {
    _entries = [];
    if (_listEl)  _listEl.innerHTML = '';
    if (_emptyEl) _emptyEl.style.display = 'flex';
    if (_countEl) _countEl.textContent = '0 entries';
  }

  return { mount, addEntry, reset };
})();

window.NegotiationTimeline = NegotiationTimeline;
