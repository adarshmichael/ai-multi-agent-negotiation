/**
 * js/screens/history-screen.js
 * Negotiation History UI — list, detail, transcript, and read-only replay.
 *
 * All data is fetched from /api/sessions. No hardcoded values.
 */

const HistoryScreen = (function () {

  let _mounted = false;
  let _sessions = [];
  let _total = 0;
  let _currentPage = 1;
  let _filters = { sort: 'newest' };
  let _activeView = 'list'; // 'list' | 'detail' | 'replay'
  let _activeSession = null;
  let _replayRound = 0;

  function formatINR(amount) {
    if (amount == null || isNaN(amount)) return '—';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency: 'INR', maximumFractionDigits: 0,
    }).format(amount);
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function formatTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }

  function formatDuration(seconds) {
    if (!seconds) return '—';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  /**
   * Mount the history screen.
   */
  async function mount(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    _mounted = true;
    _activeView = 'list';
    _activeSession = null;

    await loadSessions(container);
  }

  function unmount() {
    _mounted = false;
    _sessions = [];
    _activeSession = null;
  }

  async function loadSessions(container) {
    container.innerHTML = `
      <div class="dashboard-loading">
        <div class="dashboard-loading-spinner"></div>
        <div>Loading session history…</div>
      </div>
    `;

    try {
      // Always load from localStorage first
      const localSessions = _getLocalSessionsForHistory();

      // Try API (silent fail with 4s timeout)
      let apiSessions = [];
      try {
        const result = await Promise.race([
          window.SessionService.getSessions({ ...(_filters), page: _currentPage, limit: 20 }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000)),
        ]);
        apiSessions = result.sessions || [];
        _total = result.total || apiSessions.length;
      } catch (_) {
        _total = localSessions.length;
      }

      // Merge: API first (richer data), then local-only
      const apiIds = new Set(apiSessions.map(s => s.sessionId || s._id));
      const localOnly = localSessions.filter(s => !apiIds.has(s.id)).map(s => ({
        ...s,
        sessionId: s.id,
        performanceScore: s.score,
        scenarioName: s.scenarioName !== 'Unknown Scenario' ? s.scenarioName : 'Offline Scenario'
      }));
      _sessions = [...apiSessions, ...localOnly];
      _total = _sessions.length;
      renderList(container);
    } catch (err) {
      console.error('[History] Failed to load:', err);
      container.innerHTML = `
        <div class="dashboard-empty">
          <div class="dashboard-empty-icon">📋</div>
          <div class="dashboard-empty-title">Unable to load history</div>
          <div class="dashboard-empty-sub">${err.message || 'Please check your connection.'}</div>
        </div>
      `;
    }
  }

  function _getLocalSessionsForHistory() {
    try { return JSON.parse(localStorage.getItem('negosim_local_sessions') || '[]'); } catch { return []; }
  }

  function renderList(container) {
    if (_sessions.length === 0) {
      container.innerHTML = `
        <div class="dashboard-empty">
          <div class="dashboard-empty-icon">📋</div>
          <div class="dashboard-empty-title">No sessions yet</div>
          <div class="dashboard-empty-sub">Complete a negotiation to see it here.</div>
          <button class="btn btn-primary" onclick="AppState.goToStep(AppState.STEPS.SCENARIO)" style="margin-top:16px;">Start Negotiating</button>
        </div>
      `;
      return;
    }

    const outcomeIcon = (o) => ({
      agreement: '🤝', rejection: '❌', max_rounds: '⏱', stopped: '⏹', error: '⚠',
    }[o] || '●');

    const outcomeCls = (o) => ({
      agreement: 'outcome-success', rejection: 'outcome-fail', max_rounds: 'outcome-fail',
    }[o] || 'outcome-neutral');

    const modeLabel = (m) => ({
      practice: 'Human vs AI', simulation: 'AI vs AI', gemini: 'AI vs AI (Gemini)',
    }[m] || m);

    container.innerHTML = `
      <div class="history-toolbar">
        <div class="history-search-wrap">
          <input type="text" class="history-search" id="history-search" placeholder="Search scenarios…" value="${escapeHtml(_filters.search || '')}" />
        </div>
        <div class="history-filter-group">
          <select class="history-select" id="history-filter-outcome">
            <option value="">All Outcomes</option>
            <option value="agreement" ${_filters.outcome === 'agreement' ? 'selected' : ''}>Agreement</option>
            <option value="rejection" ${_filters.outcome === 'rejection' ? 'selected' : ''}>Rejection</option>
            <option value="max_rounds" ${_filters.outcome === 'max_rounds' ? 'selected' : ''}>Max Rounds</option>
            <option value="stopped" ${_filters.outcome === 'stopped' ? 'selected' : ''}>Stopped</option>
          </select>
          <select class="history-select" id="history-filter-mode">
            <option value="">All Modes</option>
            <option value="simulation" ${_filters.mode === 'simulation' ? 'selected' : ''}>AI vs AI</option>
            <option value="practice" ${_filters.mode === 'practice' ? 'selected' : ''}>Human vs AI</option>
          </select>
          <select class="history-select" id="history-sort">
            <option value="newest" ${_filters.sort === 'newest' ? 'selected' : ''}>Newest First</option>
            <option value="oldest" ${_filters.sort === 'oldest' ? 'selected' : ''}>Oldest First</option>
            <option value="highest_score" ${_filters.sort === 'highest_score' ? 'selected' : ''}>Highest Score</option>
            <option value="lowest_score" ${_filters.sort === 'lowest_score' ? 'selected' : ''}>Lowest Score</option>
            <option value="most_rounds" ${_filters.sort === 'most_rounds' ? 'selected' : ''}>Most Rounds</option>
            <option value="shortest" ${_filters.sort === 'shortest' ? 'selected' : ''}>Shortest</option>
          </select>
        </div>
      </div>

      <div class="history-list">
        ${_sessions.map(s => `
          <div class="history-card" data-session-id="${s.sessionId}">
            <div class="history-card-main">
              <div class="history-card-top">
                <div class="history-card-title">${escapeHtml(s.scenarioName)}</div>
                <div class="history-card-date">${formatDate(s.completedAt)}</div>
              </div>
              <div class="history-card-stats">
                <span class="history-stat">
                  <span class="history-stat-icon ${outcomeCls(s.outcome)}">${outcomeIcon(s.outcome)}</span>
                  ${(s.outcome || '').replace('_', ' ')}
                </span>
                <span class="history-stat">Score: <strong>${s.performanceScore ?? '—'}</strong></span>
                <span class="history-stat">Rounds: <strong>${s.totalRounds}</strong></span>
                <span class="history-stat history-mode-badge">${modeLabel(s.mode)}</span>
              </div>
            </div>
            <button class="btn btn-ghost history-detail-btn" data-session-id="${s.sessionId}">View Details →</button>
          </div>
        `).join('')}
      </div>

      ${_total > 20 ? `
        <div class="history-pagination">
          <button class="btn btn-ghost" id="history-prev" ${_currentPage <= 1 ? 'disabled' : ''}>← Previous</button>
          <span class="history-page-info">Page ${_currentPage}</span>
          <button class="btn btn-ghost" id="history-next" ${_sessions.length < 20 ? 'disabled' : ''}>Next →</button>
        </div>
      ` : ''}
    `;

    // Wire events
    wireListEvents(container);
  }

  function wireListEvents(container) {
    // Search
    const searchInput = document.getElementById('history-search');
    let searchTimeout;
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          _filters.search = searchInput.value.trim() || undefined;
          _currentPage = 1;
          loadSessions(container);
        }, 400);
      });
    }

    // Filters
    ['history-filter-outcome', 'history-filter-mode', 'history-sort'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', () => {
          if (id === 'history-filter-outcome') _filters.outcome = el.value || undefined;
          if (id === 'history-filter-mode') _filters.mode = el.value || undefined;
          if (id === 'history-sort') _filters.sort = el.value;
          _currentPage = 1;
          loadSessions(container);
        });
      }
    });

    // View Details
    container.querySelectorAll('.history-detail-btn').forEach(btn => {
      btn.addEventListener('click', () => loadDetail(container, btn.dataset.sessionId));
    });
    container.querySelectorAll('.history-card').forEach(card => {
      card.addEventListener('dblclick', () => loadDetail(container, card.dataset.sessionId));
    });

    // Pagination
    const prevBtn = document.getElementById('history-prev');
    const nextBtn = document.getElementById('history-next');
    if (prevBtn) prevBtn.addEventListener('click', () => { _currentPage--; loadSessions(container); });
    if (nextBtn) nextBtn.addEventListener('click', () => { _currentPage++; loadSessions(container); });
  }

  // ==================== Session Detail ====================

  async function loadDetail(container, sessionId) {
    container.innerHTML = `
      <div class="dashboard-loading">
        <div class="dashboard-loading-spinner"></div>
        <div>Loading session details…</div>
      </div>
    `;

    try {
      _activeSession = await window.SessionService.getSession(sessionId);
      _activeView = 'detail';
      renderDetail(container);
    } catch (err) {
      console.error('[History] Failed to load session:', err);
      container.innerHTML = `
        <div class="dashboard-empty">
          <div class="dashboard-empty-icon">⚠</div>
          <div class="dashboard-empty-title">Session not found</div>
          <div class="dashboard-empty-sub">${err.message}</div>
          <button class="btn btn-primary history-back-btn" style="margin-top:16px;">← Back to History</button>
        </div>
      `;
      container.querySelector('.history-back-btn')?.addEventListener('click', () => {
        _activeView = 'list';
        loadSessions(container);
      });
    }
  }

  function renderDetail(container) {
    const s = _activeSession;
    if (!s) return;

    const outcomeLabels = {
      agreement: 'Agreement Reached', rejection: 'No Agreement', max_rounds: 'Max Rounds Reached',
      stopped: 'Stopped', error: 'Error',
    };
    const outcomeIcons = {
      agreement: '🤝', rejection: '❌', max_rounds: '⏱', stopped: '⏹', error: '⚠',
    };

    container.innerHTML = `
      <div class="history-detail">
        <button class="btn btn-ghost history-back-btn">← Back to History</button>

        <!-- Session Header -->
        <div class="hd-header">
          <div class="hd-header-main">
            <div class="hd-icon">${outcomeIcons[s.outcome] || '●'}</div>
            <div>
              <div class="hd-title">${escapeHtml(s.scenarioName)}</div>
              <div class="hd-subtitle">${formatDate(s.completedAt)} · ${formatTime(s.completedAt)}</div>
            </div>
          </div>
          <div class="hd-actions">
            <button class="btn btn-primary btn-sm history-replay-btn">▶ Replay Session</button>
            <button class="btn btn-ghost btn-sm btn-danger history-delete-btn">🗑 Delete</button>
          </div>
        </div>

        <!-- Quick Stats -->
        <div class="hd-stats-grid">
          <div class="hd-stat">
            <div class="hd-stat-label">OUTCOME</div>
            <div class="hd-stat-val">${outcomeLabels[s.outcome] || s.outcome}</div>
          </div>
          <div class="hd-stat">
            <div class="hd-stat-label">SCORE</div>
            <div class="hd-stat-val">${s.performanceScore ?? '—'}</div>
          </div>
          <div class="hd-stat">
            <div class="hd-stat-label">ROUNDS</div>
            <div class="hd-stat-val">${s.totalRounds} / ${s.maxRounds}</div>
          </div>
          <div class="hd-stat">
            <div class="hd-stat-label">FINAL OFFER</div>
            <div class="hd-stat-val">${formatINR(s.finalOffer)}</div>
          </div>
          <div class="hd-stat">
            <div class="hd-stat-label">MODE</div>
            <div class="hd-stat-val">${s.mode === 'practice' ? 'Human vs AI' : 'AI vs AI'}</div>
          </div>
          <div class="hd-stat">
            <div class="hd-stat-label">DURATION</div>
            <div class="hd-stat-val">${formatDuration(s.duration)}</div>
          </div>
        </div>

        <!-- Participants -->
        <div class="hd-section">
          <div class="hd-section-title">Participants</div>
          <div class="hd-participants">
            ${(s.participants || []).map(p => `
              <div class="hd-participant-card">
                <div class="hd-p-header">
                  <div class="hd-p-avatar">${(p.name || '?')[0]}</div>
                  <div>
                    <div class="hd-p-name">${escapeHtml(p.name)}</div>
                    <div class="hd-p-role">${escapeHtml(p.role)}</div>
                  </div>
                  <div class="hd-p-personality">${escapeHtml(p.personality)}</div>
                </div>
                <div class="hd-p-stats">
                  <span>Goals: ${(p.goals || []).join(', ') || '—'}</span>
                  <span>Initial: ${formatINR(p.initialOffer)}</span>
                  <span>Final: ${formatINR(p.finalOffer)}</span>
                  ${p.satisfaction != null ? `<span>Satisfaction: ${p.satisfaction}%</span>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Transcript -->
        <div class="hd-section">
          <div class="hd-section-title">Negotiation Transcript</div>
          <div class="hd-transcript" id="hd-transcript">
            ${renderTranscript(s.messages || [])}
          </div>
        </div>

        <!-- AI Reasoning (expandable) -->
        ${s.report ? `
        <div class="hd-section">
          <div class="hd-section-title hd-expandable" id="hd-reasoning-toggle">
            AI Decision Details
            <span class="hd-expand-icon">▸</span>
          </div>
          <div class="hd-reasoning-body" id="hd-reasoning-body" style="display:none;">
            ${renderReasoningDetails(s.report)}
          </div>
        </div>
        ` : ''}

      </div>
    `;

    // Wire events
    container.querySelector('.history-back-btn')?.addEventListener('click', () => {
      _activeView = 'list';
      loadSessions(container);
    });

    container.querySelector('.history-replay-btn')?.addEventListener('click', () => {
      _activeView = 'replay';
      _replayRound = 0;
      renderReplay(container);
    });

    container.querySelector('.history-delete-btn')?.addEventListener('click', async () => {
      if (!confirm('Delete this session? This cannot be undone.')) return;
      try {
        await window.SessionService.deleteSession(s.sessionId);
        _activeView = 'list';
        loadSessions(container);
      } catch (err) {
        alert('Failed to delete: ' + err.message);
      }
    });

    // Reasoning toggle
    const toggleEl = document.getElementById('hd-reasoning-toggle');
    const bodyEl = document.getElementById('hd-reasoning-body');
    if (toggleEl && bodyEl) {
      toggleEl.addEventListener('click', () => {
        const visible = bodyEl.style.display !== 'none';
        bodyEl.style.display = visible ? 'none' : 'block';
        toggleEl.querySelector('.hd-expand-icon').textContent = visible ? '▸' : '▾';
      });
    }
  }

  function renderTranscript(messages) {
    if (!messages || messages.length === 0) {
      return '<div class="hd-transcript-empty">No messages recorded.</div>';
    }

    let currentRound = 0;
    let html = '';

    for (const msg of messages) {
      if (msg.round && msg.round !== currentRound) {
        currentRound = msg.round;
        html += `<div class="hd-transcript-round-label">ROUND ${currentRound}</div>`;
      }

      const isBuyer = (msg.agentId || '').includes('buyer') || (msg.agentId || '').includes('candidate') || (msg.agentId || '').includes('project');
      const sideClass = isBuyer ? 'hd-msg-buyer' : 'hd-msg-vendor';

      html += `
        <div class="hd-msg ${sideClass}">
          <div class="hd-msg-header">
            <strong>${escapeHtml(msg.agentName)}</strong>
            ${msg.offer != null ? `<span class="hd-msg-offer">${formatINR(msg.offer)}</span>` : ''}
          </div>
          <div class="hd-msg-body">"${escapeHtml(msg.message)}"</div>
        </div>
      `;
    }

    return html;
  }

  function renderReasoningDetails(report) {
    if (!report) return '<div>No reasoning data available.</div>';

    let html = '';

    // Satisfaction
    if (report.satisfactionScores?.length > 0) {
      html += `<div class="hd-reasoning-sub-title">Satisfaction Scores</div>`;
      html += report.satisfactionScores.map(s =>
        `<div class="hd-reasoning-item"><strong>${escapeHtml(s.agentName)}:</strong> ${s.score != null ? s.score + '%' : '—'}</div>`
      ).join('');
    }

    // Concession Summary
    if (report.concessionSummary?.length > 0) {
      html += `<div class="hd-reasoning-sub-title">Concession Summary</div>`;
      html += report.concessionSummary.map(cs =>
        `<div class="hd-reasoning-item"><strong>${escapeHtml(cs.agentName)}:</strong> ${cs.initialFmt} → ${cs.finalFmt} (${cs.concessionPct}% moved)</div>`
      ).join('');
    }

    // Insights
    if (report.insights?.length > 0) {
      html += `<div class="hd-reasoning-sub-title">Insights</div>`;
      html += `<ul class="dash-insights-list">${report.insights.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
    }

    return html || '<div>No detailed reasoning data available.</div>';
  }

  // ==================== Replay ====================

  function renderReplay(container) {
    const s = _activeSession;
    if (!s || !s.messages) return;

    const messages = s.messages || [];
    const maxRound = Math.max(0, ...messages.map(m => m.round || 0));

    // Get messages up to current replay round
    const visibleMessages = _replayRound === 0 ? [] : messages.filter(m => (m.round || 0) <= _replayRound);

    container.innerHTML = `
      <div class="history-detail">
        <button class="btn btn-ghost history-back-detail-btn">← Back to Details</button>

        <div class="hd-header">
          <div class="hd-header-main">
            <div class="hd-icon">▶</div>
            <div>
              <div class="hd-title">Session Replay — ${escapeHtml(s.scenarioName)}</div>
              <div class="hd-subtitle">Read-only replay · ${formatDate(s.completedAt)}</div>
            </div>
          </div>
        </div>

        <div class="replay-controls">
          <button class="btn btn-ghost btn-sm" id="replay-restart" title="Restart">⏮ Restart</button>
          <button class="btn btn-ghost btn-sm" id="replay-prev" ${_replayRound <= 0 ? 'disabled' : ''}>◀ Previous</button>
          <div class="replay-round-indicator">Round ${_replayRound} / ${maxRound}</div>
          <button class="btn btn-ghost btn-sm" id="replay-next" ${_replayRound >= maxRound ? 'disabled' : ''}>Next ▶</button>
          <button class="btn btn-primary btn-sm" id="replay-play">▶ Play</button>
        </div>

        <div class="hd-transcript" id="replay-transcript">
          ${_replayRound === 0
            ? '<div class="hd-transcript-empty">Click Next or Play to start the replay.</div>'
            : renderTranscript(visibleMessages)
          }
        </div>
      </div>
    `;

    // Wire events
    container.querySelector('.history-back-detail-btn')?.addEventListener('click', () => {
      _activeView = 'detail';
      renderDetail(container);
    });

    document.getElementById('replay-restart')?.addEventListener('click', () => {
      _replayRound = 0;
      renderReplay(container);
    });

    document.getElementById('replay-prev')?.addEventListener('click', () => {
      if (_replayRound > 0) { _replayRound--; renderReplay(container); }
    });

    document.getElementById('replay-next')?.addEventListener('click', () => {
      if (_replayRound < maxRound) { _replayRound++; renderReplay(container); }
    });

    document.getElementById('replay-play')?.addEventListener('click', () => {
      autoPlayReplay(container, maxRound);
    });

    // Scroll to latest message
    const transcript = document.getElementById('replay-transcript');
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }

  function autoPlayReplay(container, maxRound) {
    if (_replayRound >= maxRound) return;

    const interval = setInterval(() => {
      if (_replayRound >= maxRound || _activeView !== 'replay') {
        clearInterval(interval);
        return;
      }
      _replayRound++;
      renderReplay(container);
    }, 1500);
  }

  return { mount, unmount };
})();

window.HistoryScreen = HistoryScreen;
