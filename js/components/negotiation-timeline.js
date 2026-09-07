/**
 * js/components/negotiation-timeline.js
 * Expandable Round Timeline (Concept C) — horizontal row of hexagon/dot nodes.
 * Each node represents one round. Clicking expands to show offers, counteroffers, and decisions.
 * Mounts into #ln-timeline.
 *
 * Public API:
 *   NegotiationTimeline.mount(containerId?)
 *   NegotiationTimeline.addEntry(entry)
 *   NegotiationTimeline.reset()
 *
 * Entry shape:
 *   { round, agentId, agentName, offer, decision, message, timestamp?, source? }
 */

const NegotiationTimeline = (function () {

  let _container   = null;
  let _nodesEl     = null;
  let _expandedEl  = null;
  let _emptyEl     = null;
  let _countEl     = null;
  let _entries     = [];
  let _expandedRound = null;
  let _maxRound      = 0;

  const DECISION_META = {
    offer:        { label: 'OFFER',    cls: 'offer' },
    counteroffer: { label: 'COUNTER',  cls: 'counteroffer' },
    accept:       { label: 'ACCEPTED', cls: 'accept' },
    reject:       { label: 'REJECTED', cls: 'reject' },
  };

  function _formatINR(amount) {
    if (amount === null || amount === undefined) return '—';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency: 'INR', maximumFractionDigits: 0,
    }).format(amount);
  }

  function _escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  function mount(containerId = 'ln-timeline') {
    _container = document.getElementById(containerId);
    if (!_container) return;

    _container.innerHTML = `
      <div class="rt-root">
        <div class="rt-header">
          <div class="rt-header-left">
            <div class="rt-header-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/>
              </svg>
            </div>
            <div>
              <div class="rt-header-title">ROUND TIMELINE</div>
              <div class="rt-header-sub">Click a round to expand details — routed through orchestrator</div>
            </div>
          </div>
          <span class="rt-count-badge" id="rt-count">0 rounds</span>
        </div>

        <div class="rt-nodes" id="rt-nodes"></div>

        <div class="rt-empty" id="rt-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/></svg>
          Round timeline will populate as offers are exchanged.
        </div>

        <div class="rt-expanded" id="rt-expanded"></div>
      </div>
    `;

    _nodesEl    = _container.querySelector('#rt-nodes');
    _expandedEl = _container.querySelector('#rt-expanded');
    _emptyEl    = _container.querySelector('#rt-empty');
    _countEl    = _container.querySelector('#rt-count');
  }

  function addEntry(entry) {
    if (!_container) return;
    _entries.push(entry);

    // Track max round
    if (entry.round > _maxRound) _maxRound = entry.round;

    // Hide empty state
    if (_emptyEl) _emptyEl.style.display = 'none';

    // Update count
    if (_countEl) {
      const uniqueRounds = new Set(_entries.map(e => e.round));
      _countEl.textContent = `${uniqueRounds.size} round${uniqueRounds.size !== 1 ? 's' : ''}`;
    }

    _renderNodes();

    // If the expanded panel is showing this round, refresh it
    if (_expandedRound === entry.round) {
      _showExpanded(entry.round);
    }
  }

  function _renderNodes() {
    if (!_nodesEl) return;

    const roundNumbers = [...new Set(_entries.map(e => e.round))].sort((a, b) => a - b);
    if (roundNumbers.length === 0) return;

    // Determine current active round (the latest with entries)
    const activeRound = Math.max(...roundNumbers);

    // Check if round is "complete" (has entries from both agents)
    function isRoundComplete(r) {
      const rEntries = _entries.filter(e => e.round === r);
      const uniqueAgents = new Set(rEntries.map(e => e.agentId));
      return uniqueAgents.size >= 2;
    }

    let html = '';
    roundNumbers.forEach((round, idx) => {
      const complete = isRoundComplete(round);
      const isActive = round === activeRound && !complete;
      const state = complete ? 'done' : isActive ? 'active' : 'pending';
      const isSelected = _expandedRound === round;

      html += `
        <div class="rt-node" data-round="${round}" data-state="${state}" ${isSelected ? 'style="transform: scale(1.1);"' : ''}>
          <div class="rt-node-hex">
            <svg viewBox="0 0 34 34" fill="none">
              <polygon points="17,2 31,9.5 31,24.5 17,32 3,24.5 3,9.5"
                       stroke="currentColor" stroke-width="1.5"
                       fill="currentColor" fill-opacity="${state === 'done' ? '0.12' : state === 'active' ? '0.08' : '0.04'}"/>
            </svg>
            <span class="rt-node-num">${state === 'done' ? '✓' : round}</span>
          </div>
          <div class="rt-node-label">R${round}</div>
        </div>
      `;

      // Add connector between nodes
      if (idx < roundNumbers.length - 1) {
        const nextComplete = isRoundComplete(roundNumbers[idx + 1]);
        const connState = complete ? (nextComplete ? 'done' : 'active') : '';
        html += `<div class="rt-connector ${connState}"></div>`;
      }
    });

    _nodesEl.innerHTML = html;

    // Bind click events
    _nodesEl.querySelectorAll('.rt-node').forEach(node => {
      node.addEventListener('click', () => {
        const round = parseInt(node.dataset.round, 10);
        if (_expandedRound === round) {
          _hideExpanded();
        } else {
          _showExpanded(round);
        }
      });
    });
  }

  function _showExpanded(round) {
    if (!_expandedEl) return;
    _expandedRound = round;

    const roundEntries = _entries.filter(e => e.round === round);
    if (roundEntries.length === 0) {
      _hideExpanded();
      return;
    }

    const entriesHtml = roundEntries.map(entry => {
      const meta = DECISION_META[entry.decision] || DECISION_META.offer;
      const isBuyer = entry.agentId === 'buyer' || entry.agentId === 'candidate' || entry.agentId === 'project-manager';
      const dotCls = isBuyer ? 'buyer' : 'vendor';

      return `
        <div class="rt-expanded-entry">
          <div class="rt-expanded-entry-dot ${dotCls}"></div>
          <div class="rt-expanded-entry-body">
            <div class="rt-expanded-entry-meta">
              <span>${_escapeHtml(entry.agentName)}</span>
              <span class="rt-expanded-entry-decision ${meta.cls}">${meta.label}</span>
            </div>
            ${entry.offer !== null && entry.offer !== undefined
              ? `<div class="rt-expanded-entry-amount">${_formatINR(entry.offer)}</div>`
              : ''}
            ${entry.message
              ? `<div class="rt-expanded-entry-msg">${_escapeHtml(entry.message)}</div>`
              : ''}
          </div>
        </div>
      `;
    }).join('');

    _expandedEl.innerHTML = `
      <div class="rt-expanded-header">
        <span class="rt-expanded-round">ROUND ${round} DETAILS</span>
        <button class="rt-expanded-close" id="rt-close-expanded" title="Close">✕</button>
      </div>
      <div class="rt-expanded-entries">
        ${entriesHtml}
      </div>
    `;

    _expandedEl.classList.add('visible');

    // Close button
    const closeBtn = _expandedEl.querySelector('#rt-close-expanded');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        _hideExpanded();
      });
    }

    // Re-render nodes to update selected state
    _renderNodes();
  }

  function _hideExpanded() {
    _expandedRound = null;
    if (_expandedEl) {
      _expandedEl.classList.remove('visible');
      _expandedEl.innerHTML = '';
    }
    _renderNodes();
  }

  function reset() {
    _entries = [];
    _maxRound = 0;
    _expandedRound = null;
    if (_nodesEl)    _nodesEl.innerHTML = '';
    if (_expandedEl) { _expandedEl.classList.remove('visible'); _expandedEl.innerHTML = ''; }
    if (_emptyEl)    _emptyEl.style.display = 'flex';
    if (_countEl)    _countEl.textContent = '0 rounds';
  }

  return { mount, addEntry, reset };
})();

window.NegotiationTimeline = NegotiationTimeline;
