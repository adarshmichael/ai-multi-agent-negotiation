/**
 * js/components/conversation-log.js
 * Conversation History Log — scrollable, collapsible panel showing
 * raw agent input/output pairs from the full negotiation history.
 * Mounts into #ln-conv-log.
 *
 * Public API:
 *   ConversationLog.mount(containerId?)
 *   ConversationLog.addEntry(agentName, agentId, input, output, round)
 *   ConversationLog.reset()
 */

const ConversationLog = (function () {

  let _container   = null;
  let _bodyEl      = null;
  let _countEl     = null;
  let _emptyEl     = null;
  let _entries     = [];
  let _isCollapsed = true; // collapsed by default

  function _escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  function _formatTime(ts) {
    return new Date(ts || Date.now()).toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
  }

  function mount(containerId = 'ln-conv-log') {
    _container = document.getElementById(containerId);
    if (!_container) return;

    _container.innerHTML = `
      <div class="cl-root">
        <div class="cl-header" id="cl-header">
          <div class="cl-header-left">
            <div class="cl-header-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <div>
              <div class="cl-header-title">CONVERSATION HISTORY</div>
              <div class="cl-header-sub">Full agent input / output pairs</div>
            </div>
          </div>
          <div class="cl-header-right">
            <span class="cl-count-badge" id="cl-count">0 entries</span>
            <button class="cl-toggle-btn" id="cl-toggle" aria-expanded="false" title="Expand history">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="cl-body cl-body-collapsed" id="cl-body">
          <div class="cl-empty" id="cl-empty">
            <span class="cl-empty-icon">💬</span>
            <span>Conversation history will appear here once the negotiation begins</span>
          </div>
          <div class="cl-list" id="cl-list"></div>
        </div>
      </div>
    `;

    _bodyEl  = _container.querySelector('#cl-body');
    _countEl = _container.querySelector('#cl-count');
    _emptyEl = _container.querySelector('#cl-empty');

    // Toggle collapse/expand
    const toggleBtn = _container.querySelector('#cl-toggle');
    if (toggleBtn && _bodyEl) {
      toggleBtn.addEventListener('click', () => {
        _isCollapsed = !_isCollapsed;
        _bodyEl.classList.toggle('cl-body-collapsed', _isCollapsed);
        toggleBtn.setAttribute('aria-expanded', String(!_isCollapsed));
        toggleBtn.querySelector('svg').style.transform = _isCollapsed ? '' : 'rotate(180deg)';
      });
    }
  }

  /**
   * @param {string} agentName
   * @param {string} agentId
   * @param {string} input    — The prompt / state context sent to the agent
   * @param {string} output   — The agent's raw response
   * @param {number} round
   * @param {number} [timestamp]
   */
  function addEntry(agentName, agentId, input, output, round, timestamp) {
    if (!_container) return;
    _entries.push({ agentName, agentId, input, output, round, timestamp });

    const listEl = _container.querySelector('#cl-list');
    if (!listEl) return;

    if (_emptyEl) _emptyEl.style.display = 'none';
    if (_countEl) {
      _countEl.textContent = `${_entries.length} entr${_entries.length === 1 ? 'y' : 'ies'}`;
    }

    const ts = _formatTime(timestamp);
    const isBuyer = agentId === 'buyer' || agentId === 'candidate' || agentId === 'project-manager';
    const agentCls = isBuyer ? 'cl-agent-buyer' : 'cl-agent-vendor';

    const entryEl = document.createElement('div');
    entryEl.className = 'cl-entry cl-entry-new';
    entryEl.innerHTML = `
      <div class="cl-entry-header">
        <div class="cl-entry-agent">
          <div class="cl-agent-dot ${agentCls}"></div>
          <span class="cl-agent-name ${agentCls}">${_escapeHtml(agentName)}</span>
          <span class="cl-entry-round">Round ${round}</span>
        </div>
        <span class="cl-entry-ts">${ts}</span>
      </div>

      <div class="cl-io-block">
        <div class="cl-io-row">
          <div class="cl-io-label cl-io-label-in">INPUT</div>
          <div class="cl-io-text cl-io-in">${_escapeHtml(input)}</div>
        </div>
        <div class="cl-io-divider" aria-hidden="true">↓</div>
        <div class="cl-io-row">
          <div class="cl-io-label cl-io-label-out">OUTPUT</div>
          <div class="cl-io-text cl-io-out">${_escapeHtml(output)}</div>
        </div>
      </div>
    `;

    listEl.appendChild(entryEl);
    listEl.scrollTop = listEl.scrollHeight;

    // Animate in
    setTimeout(() => entryEl.classList.remove('cl-entry-new'), 400);
  }

  function reset() {
    _entries = [];
    const listEl = _container ? _container.querySelector('#cl-list') : null;
    if (listEl)  listEl.innerHTML  = '';
    if (_emptyEl) _emptyEl.style.display = 'flex';
    if (_countEl) _countEl.textContent   = '0 entries';
  }

  return { mount, addEntry, reset };
})();

window.ConversationLog = ConversationLog;
