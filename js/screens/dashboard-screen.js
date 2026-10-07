/**
 * js/screens/dashboard-screen.js
 * Performance Dashboard UI — renders metrics from actual saved sessions.
 *
 * All data is fetched from /api/dashboard. No hardcoded values.
 * Charts use lightweight SVG/CSS. No external chart libraries.
 */

const DashboardScreen = (function () {

  let _mounted = false;
  let _data = null;
  let _trendFilter = 'all'; // 'last7' | 'last30' | 'all'

  function formatINR(amount) {
    if (amount == null || isNaN(amount)) return '—';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency: 'INR', maximumFractionDigits: 0,
    }).format(amount);
  }

  /**
   * Mount and render the dashboard.
   * Reads from localStorage (always available) and merges with API if reachable.
   */
  async function mount(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="dashboard-loading">
        <div class="dashboard-loading-spinner"></div>
        <div>Loading performance data…</div>
      </div>
    `;

    // Always read localStorage sessions first
    const localSessions = _getLocalSessions();

    // Try to merge with API sessions (optional, silent fail)
    let apiSessions = [];
    try {
      const result = await Promise.race([
        window.SessionService.getSessions({ limit: 50 }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000)),
      ]);
      apiSessions = result.sessions || [];
    } catch (_) { /* offline or no DB — use only localStorage */ }

    // Merge: prefer API sessions (they have more data), add any local-only ones
    const apiIds = new Set(apiSessions.map(s => s.sessionId || s.id));
    const localOnly = localSessions.filter(s => !apiIds.has(s.id));
    const allSessions = [...apiSessions, ...localOnly];

    // Compute dashboard metrics locally
    _data = _computeDashboard(allSessions);
    render(container);
    _mounted = true;
  }

  function _getLocalSessions() {
    try { return JSON.parse(localStorage.getItem('negosim_local_sessions') || '[]'); } catch { return []; }
  }

  function _computeDashboard(sessions) {
    const total = sessions.length;
    if (total === 0) return { totalSessions: 0, successfulSessions: 0, failedSessions: 0, successRate: 0, averageScore: 0, scoreTrend: 0, averageRounds: 0, scenarioBreakdown: [], recentSessions: [] };

    const successful = sessions.filter(s => (s.outcome || s.successStatus) === 'agreement' || s.successStatus === true).length;
    const failed = total - successful;
    const scores = sessions.map(s => s.score || s.performanceScore || 0).filter(Boolean);
    const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    // Trend: compare last 5 vs previous 5
    const sorted = [...sessions].sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
    const recent5 = sorted.slice(0, 5).map(s => s.score || s.performanceScore || 0).filter(Boolean);
    const prev5   = sorted.slice(5, 10).map(s => s.score || s.performanceScore || 0).filter(Boolean);
    const recentAvg = recent5.length ? recent5.reduce((a, b) => a + b, 0) / recent5.length : avgScore;
    const prevAvg   = prev5.length   ? prev5.reduce((a, b) => a + b, 0)   / prev5.length   : avgScore;
    const trend = prev5.length ? Math.round(recentAvg - prevAvg) : 0;

    // Scenario breakdown
    const scenarioMap = {};
    sessions.forEach(s => {
      const k = s.scenarioName || s.scenarioId || 'Unknown';
      if (!scenarioMap[k]) scenarioMap[k] = { name: k, count: 0, wins: 0 };
      scenarioMap[k].count++;
      if ((s.outcome || '') === 'agreement' || s.successStatus === true) scenarioMap[k].wins++;
    });

    const avgRounds = Math.round(sessions.reduce((a, s) => a + (s.totalRounds || 0), 0) / total);

    return {
      totalSessions: total,
      successfulSessions: successful,
      failedSessions: failed,
      successRate: Math.round((successful / total) * 100),
      averageScore: avgScore,
      scoreTrend: trend,
      averageRounds: avgRounds,
      scenarioBreakdown: Object.values(scenarioMap),
      recentSessions: sorted.slice(0, 5),
    };
  }

  function unmount() {
    _mounted = false;
    _data = null;
  }

  function render(container) {
    if (!_data) return;

    const d = _data;

    // Empty state
    if (d.totalSessions === 0) {
      container.innerHTML = `
        <div class="dashboard-empty">
          <div class="dashboard-empty-icon">🎯</div>
          <div class="dashboard-empty-title">No negotiations yet</div>
          <div class="dashboard-empty-sub">Complete your first negotiation to start building your performance profile.</div>
          <button class="btn btn-primary" onclick="AppState.goToStep(AppState.STEPS.SCENARIO)" style="margin-top:16px;">Start Negotiating</button>
        </div>
      `;
      return;
    }

    const trendSign = d.scoreTrend > 0 ? '↑' : d.scoreTrend < 0 ? '↓' : '→';
    const trendCls = d.scoreTrend > 0 ? 'trend-up' : d.scoreTrend < 0 ? 'trend-down' : 'trend-flat';

    container.innerHTML = `
      <div class="dashboard-grid">

        <!-- Overall Performance Score -->
        <div class="dash-card dash-card-hero">
          <div class="dash-card-label">OVERALL PERFORMANCE</div>
          <div class="dash-score-ring-wrap">
            ${renderScoreRing(d.averageScore)}
          </div>
          <div class="dash-score-meta">
            <span class="dash-trend ${trendCls}">${trendSign} ${Math.abs(d.scoreTrend)}% ${d.scoreTrend >= 0 ? 'improvement' : 'decline'}</span>
            <span class="dash-meta-sub">Based on ${d.totalSessions} negotiation${d.totalSessions !== 1 ? 's' : ''}</span>
          </div>
        </div>

        <!-- Success / Failure Rate -->
        <div class="dash-card">
          <div class="dash-card-label">SUCCESS RATE</div>
          <div class="dash-success-stats">
            <div class="dash-stat-block dash-stat-success">
              <div class="dash-stat-val">${d.successfulSessions}</div>
              <div class="dash-stat-label">Successful</div>
            </div>
            <div class="dash-stat-block dash-stat-fail">
              <div class="dash-stat-val">${d.failedSessions}</div>
              <div class="dash-stat-label">Failed</div>
            </div>
          </div>
          <div class="dash-progress-bar">
            <div class="dash-progress-fill" style="width:${d.successRate}%"></div>
          </div>
          <div class="dash-stat-pct">${d.successRate}% Success Rate</div>
        </div>

        <!-- Average Rounds -->
        <div class="dash-card">
          <div class="dash-card-label">AVERAGE ROUNDS</div>
          <div class="dash-big-num">${d.averageRounds}</div>
          <div class="dash-big-sub">per negotiation</div>
        </div>

        <!-- Concession Analysis -->
        <div class="dash-card dash-card-wide">
          <div class="dash-card-label">CONCESSION ANALYSIS</div>
          <div class="dash-concession-grid">
            <div class="dash-con-item">
              <div class="dash-con-val">${d.concessionStats.averagePercentage}%</div>
              <div class="dash-con-label">Avg. Concession</div>
            </div>
            <div class="dash-con-item">
              <div class="dash-con-val">${d.concessionStats.totalConcessions}</div>
              <div class="dash-con-label">Total Concessions</div>
            </div>
            <div class="dash-con-item">
              <div class="dash-con-val">${formatINR(d.concessionStats.averageOfferMovement)}</div>
              <div class="dash-con-label">Avg. Offer Movement</div>
            </div>
            <div class="dash-con-item">
              <div class="dash-con-val">${formatINR(d.concessionStats.largestConcession)}</div>
              <div class="dash-con-label">Largest Concession</div>
            </div>
          </div>
        </div>

        <!-- Performance Trend -->
        <div class="dash-card dash-card-wide">
          <div class="dash-card-header-row">
            <div class="dash-card-label">PERFORMANCE TREND</div>
            <div class="dash-trend-filters">
              <button class="dash-filter-btn ${_trendFilter === 'last7' ? 'active' : ''}" data-filter="last7">Last 7</button>
              <button class="dash-filter-btn ${_trendFilter === 'last30' ? 'active' : ''}" data-filter="last30">Last 30 days</button>
              <button class="dash-filter-btn ${_trendFilter === 'all' ? 'active' : ''}" data-filter="all">All time</button>
            </div>
          </div>
          <div class="dash-trend-chart" id="dash-trend-chart"></div>
        </div>

        <!-- Scenario Performance -->
        ${d.scenarioStats.length > 0 ? `
        <div class="dash-card dash-card-wide">
          <div class="dash-card-label">SCENARIO PERFORMANCE</div>
          <div class="dash-scenario-grid">
            ${d.scenarioStats.map(s => `
              <div class="dash-scenario-item">
                <div class="dash-scenario-name">${escapeHtml(s.scenarioName)}</div>
                <div class="dash-scenario-stats">
                  <span class="dash-scenario-score">Score: ${s.averageScore}</span>
                  <span class="dash-scenario-rate">Success: ${s.successRate}%</span>
                  <span class="dash-scenario-count">${s.totalSessions} session${s.totalSessions !== 1 ? 's' : ''}</span>
                </div>
                <div class="dash-progress-bar dash-progress-sm">
                  <div class="dash-progress-fill" style="width:${s.averageScore}%"></div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}

        <!-- Personal Insights -->
        ${d.insights.length > 0 ? `
        <div class="dash-card dash-card-wide">
          <div class="dash-card-label">YOUR NEGOTIATION INSIGHTS</div>
          <ul class="dash-insights-list">
            ${d.insights.map(i => `<li>${escapeHtml(i)}</li>`).join('')}
          </ul>
        </div>
        ` : ''}

      </div>
    `;

    // Render trend chart
    renderTrendChart(d.performanceTrend);

    // Wire filter buttons
    container.querySelectorAll('.dash-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _trendFilter = btn.dataset.filter;
        render(container);
      });
    });
  }

  /**
   * Render SVG score ring.
   */
  function renderScoreRing(score) {
    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;
    const color = score >= 70 ? '#3FB950' : score >= 40 ? '#D29922' : '#F85149';

    return `
      <svg class="dash-score-ring" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="${radius}" fill="none" stroke="var(--color-border)" stroke-width="8" />
        <circle cx="60" cy="60" r="${radius}" fill="none" stroke="${color}" stroke-width="8"
          stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
          stroke-linecap="round" transform="rotate(-90 60 60)"
          style="transition: stroke-dashoffset 1s ease-out;" />
        <text x="60" y="55" text-anchor="middle" fill="var(--color-text)" font-size="28" font-weight="700">${score}</text>
        <text x="60" y="75" text-anchor="middle" fill="var(--color-text-muted)" font-size="12">/ 100</text>
      </svg>
    `;
  }

  /**
   * Render SVG line chart for performance trend.
   */
  function renderTrendChart(trendData) {
    const chartEl = document.getElementById('dash-trend-chart');
    if (!chartEl || !trendData || trendData.length === 0) {
      if (chartEl) chartEl.innerHTML = '<div class="dash-chart-empty">Not enough data for trend chart.</div>';
      return;
    }

    let filtered = trendData;
    if (_trendFilter === 'last7') {
      filtered = trendData.slice(-7);
    } else if (_trendFilter === 'last30') {
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      filtered = trendData.filter(p => new Date(p.date).getTime() > thirtyDaysAgo);
    }

    if (filtered.length === 0) {
      chartEl.innerHTML = '<div class="dash-chart-empty">No data in this time range.</div>';
      return;
    }

    const width = 600;
    const height = 180;
    const padLeft = 40;
    const padRight = 16;
    const padTop = 16;
    const padBottom = 30;

    const chartW = width - padLeft - padRight;
    const chartH = height - padTop - padBottom;

    const maxScore = Math.max(100, ...filtered.map(p => p.score));
    const minScore = Math.min(0, ...filtered.map(p => p.score));
    const range = maxScore - minScore || 1;

    const xStep = filtered.length > 1 ? chartW / (filtered.length - 1) : chartW;

    const points = filtered.map((p, i) => {
      const x = padLeft + (filtered.length > 1 ? i * xStep : chartW / 2);
      const y = padTop + chartH - ((p.score - minScore) / range) * chartH;
      return { x, y, ...p };
    });

    const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

    // Y-axis labels
    const yLabels = [0, 25, 50, 75, 100].map(v => {
      const y = padTop + chartH - ((v - minScore) / range) * chartH;
      return `<text x="${padLeft - 8}" y="${y + 4}" fill="var(--color-text-faint)" font-size="10" text-anchor="end">${v}</text>
              <line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" stroke="var(--color-border)" stroke-dasharray="3,3" />`;
    }).join('');

    // X-axis labels
    const xLabels = points.map((p, i) => {
      if (filtered.length > 12 && i % 3 !== 0) return '';
      return `<text x="${p.x}" y="${height - 6}" fill="var(--color-text-faint)" font-size="9" text-anchor="middle">${i + 1}</text>`;
    }).join('');

    // Dots
    const dots = points.map(p => {
      const col = p.outcome === 'agreement' ? '#3FB950' : '#F85149';
      return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="${col}" stroke="var(--color-bg)" stroke-width="2" />`;
    }).join('');

    chartEl.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" class="dash-trend-svg">
        ${yLabels}
        ${xLabels}
        <path d="${pathData}" fill="none" stroke="var(--color-primary)" stroke-width="2.5" stroke-linejoin="round" />
        ${dots}
      </svg>
    `;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  return { mount, unmount };
})();

window.DashboardScreen = DashboardScreen;
