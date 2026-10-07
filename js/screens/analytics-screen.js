/**
 * js/screens/analytics-screen.js
 * Analytics Dashboard — KPIs, inline SVG/CSS charts, empty states.
 * Fetches data from /api/analytics.
 */

const AnalyticsScreen = (function () {
  let _mounted = false;

  function formatPct(v) { return (v != null ? Math.round(v) : 0) + '%'; }
  function formatNum(v) { return v != null ? Number(v).toLocaleString('en-IN') : '0'; }

  function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = String(s || '');
    return d.innerHTML;
  }

  function renderKpis(kpis) {
    return `
      <div class="kpi-grid">
        <div class="kpi-tile stagger-1">
          <div class="kpi-tile-icon">📊</div>
          <div class="kpi-tile-label">Total Negotiations</div>
          <div class="kpi-tile-value">${formatNum(kpis.total)}</div>
        </div>
        <div class="kpi-tile stagger-2">
          <div class="kpi-tile-icon">🏆</div>
          <div class="kpi-tile-label">Agreement Rate</div>
          <div class="kpi-tile-value">${formatPct(kpis.agreementRate)}</div>
          <div class="kpi-tile-sub">of all negotiations</div>
        </div>
        <div class="kpi-tile stagger-3">
          <div class="kpi-tile-icon">🔄</div>
          <div class="kpi-tile-label">Avg Rounds</div>
          <div class="kpi-tile-value">${formatNum(kpis.avgRounds)}</div>
          <div class="kpi-tile-sub">per negotiation</div>
        </div>
        <div class="kpi-tile stagger-4">
          <div class="kpi-tile-icon">⭐</div>
          <div class="kpi-tile-label">Avg Score</div>
          <div class="kpi-tile-value">${formatNum(kpis.avgScore)}</div>
          <div class="kpi-tile-sub">out of 100</div>
        </div>
      </div>
    `;
  }

  function renderOutcomesChart(data) {
    if (!data || data.length === 0) {
      return `<div class="screen-empty"><div class="screen-empty-icon">📈</div><div class="screen-empty-title">No data yet</div></div>`;
    }
    const maxTotal = Math.max(...data.map(d => Number(d.agreement || 0) + Number(d.rejection || 0) + Number(d.max_rounds || 0) + Number(d.stopped || 0) + Number(d.other || 0)), 1);
    const bars = data.slice(-12).map(d => {
      const agreement = Number(d.agreement || 0);
      const rejection = Number(d.rejection || 0);
      const max_rounds = Number(d.max_rounds || 0);
      const stopped = Number(d.stopped || 0);
      const other = Number(d.other || 0);
      const total = agreement + rejection + max_rounds + stopped + other;
      
      const agPct = total > 0 ? Math.round(agreement / total * 100) : 0;
      const rePct = total > 0 ? Math.round(rejection / total * 100) : 0;
      const mrPct = total > 0 ? Math.round(max_rounds / total * 100) : 0;
      const h = Math.round((total / maxTotal) * 80);
      
      return `
        <div style="display:flex;flex-direction:column;justify-content:flex-end;align-items:center;flex:1;min-width:20px;max-width:40px;height:100%;">
          <div style="font-size:10px;color:var(--color-text-muted);font-family:var(--font-mono);margin-bottom:4px;">${total}</div>
          <div style="width:100%;height:${h}px;min-height:4px;border-radius:4px 4px 0 0;overflow:hidden;display:flex;flex-direction:column-reverse;">
            <div style="width:100%;height:${agPct}%;background:var(--color-success);"></div>
            <div style="width:100%;height:${rePct}%;background:var(--color-danger);"></div>
            <div style="width:100%;height:${mrPct}%;background:var(--color-warning);"></div>
          </div>
          <div style="font-size:9px;color:var(--color-text-faint);margin-top:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;text-align:center;">${escHtml(d.week || '')}</div>
        </div>
      `;
    }).join('');

    return `
      <div style="display:flex;align-items:flex-end;gap:6px;height:120px;padding-bottom:28px;">
        ${bars}
      </div>
      <div style="display:flex;gap:16px;margin-top:8px;font-size:11px;">
        <span><span style="display:inline-block;width:10px;height:10px;background:var(--color-success);border-radius:2px;margin-right:4px;"></span>Agreement</span>
        <span><span style="display:inline-block;width:10px;height:10px;background:var(--color-danger);border-radius:2px;margin-right:4px;"></span>Rejected</span>
        <span><span style="display:inline-block;width:10px;height:10px;background:var(--color-warning);border-radius:2px;margin-right:4px;"></span>Max Rounds</span>
      </div>
    `;
  }

  function renderSatisfactionPerScenario(data) {
    if (!data || data.length === 0) {
      return `<div class="screen-empty"><div class="screen-empty-icon">🎯</div><div class="screen-empty-title">No data yet</div></div>`;
    }
    const max = Math.max(...data.map(d => d.avgScore), 1);
    return `<div class="inline-bar-chart">
      ${data.map(d => `
        <div class="inline-bar-row">
          <div class="inline-bar-label" title="${escHtml(d.scenario)}">${escHtml(d.scenario)}</div>
          <div class="inline-bar-track">
            <div class="inline-bar-fill" style="width:${Math.round(d.avgScore / max * 100)}%;background:var(--gradient-primary);"></div>
          </div>
          <div class="inline-bar-val">${d.avgScore}</div>
        </div>
      `).join('')}
    </div>`;
  }

  function renderConcessionsPerRound(data) {
    if (!data || data.length === 0) {
      return `<div class="screen-empty"><div class="screen-empty-icon">📉</div><div class="screen-empty-title">No data yet</div></div>`;
    }
    const max = Math.max(...data.map(d => d.avgConcession), 1);
    return `<div class="inline-bar-chart">
      ${data.map(d => `
        <div class="inline-bar-row">
          <div class="inline-bar-label">Round ${d.round}</div>
          <div class="inline-bar-track">
            <div class="inline-bar-fill" style="width:${Math.round(d.avgConcession / max * 100)}%;background:linear-gradient(90deg,var(--color-buyer),var(--color-vendor));"></div>
          </div>
          <div class="inline-bar-val">${Number(d.avgConcession).toLocaleString('en-IN')}</div>
        </div>
      `).join('')}
    </div>`;
  }

  function renderPersonalityResults(data) {
    if (!data || data.length === 0) {
      return `<div class="screen-empty"><div class="screen-empty-icon">🎭</div><div class="screen-empty-title">No data yet</div></div>`;
    }
    const max = Math.max(...data.map(d => d.agreementRate), 1);
    return `<div class="inline-bar-chart">
      ${data.map(d => `
        <div class="inline-bar-row">
          <div class="inline-bar-label" style="text-transform:capitalize;">${escHtml(d.personality)}</div>
          <div class="inline-bar-track">
            <div class="inline-bar-fill" style="width:${Math.round(d.agreementRate / max * 100)}%;"></div>
          </div>
          <div class="inline-bar-val">${d.agreementRate}%</div>
        </div>
      `).join('')}
    </div>`;
  }

  async function mount(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    _mounted = true;

    container.innerHTML = `
      <div class="page-content">
        <div class="screen-loading" id="analytics-loading">
          <div class="screen-loading-spinner"></div>
          <div>Loading analytics…</div>
        </div>
      </div>
    `;

    try {
      const BASE = window.ApiService.getBackendInfo().baseUrl;
      const userId = (() => { try { return JSON.parse(localStorage.getItem('negosim_user') || '{}').id || 'anonymous'; } catch { return 'anonymous'; } })();
      const token = localStorage.getItem('negosim_token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch(`${BASE}/analytics?userId=${encodeURIComponent(userId)}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (!_mounted) return;

      container.innerHTML = `
        <div class="page-content">
          ${renderKpis(data.kpis || {})}
          <div class="analytics-grid">
            <div class="chart-card stagger-1">
              <div class="chart-card-title">📈 Outcomes Over Time</div>
              ${renderOutcomesChart(data.outcomesOverTime)}
            </div>
            <div class="chart-card stagger-2">
              <div class="chart-card-title">🎯 Avg Score Per Scenario</div>
              ${renderSatisfactionPerScenario(data.satisfactionPerScenario)}
            </div>
            <div class="chart-card stagger-3">
              <div class="chart-card-title">📉 Avg Concession Per Round</div>
              ${renderConcessionsPerRound(data.concessionsPerRound)}
            </div>
            <div class="chart-card stagger-4">
              <div class="chart-card-title">🎭 Agreement Rate by Personality</div>
              ${renderPersonalityResults(data.resultsPerPersonality)}
            </div>
          </div>
        </div>
      `;
    } catch (err) {
      if (!_mounted) return;
      container.innerHTML = `
        <div class="page-content">
          <div class="screen-empty">
            <div class="screen-empty-icon">📊</div>
            <div class="screen-empty-title">Analytics unavailable</div>
            <div class="screen-empty-sub">${err.message}</div>
          </div>
        </div>
      `;
    }
  }

  function unmount() {
    _mounted = false;
  }

  return { mount, unmount };
})();

window.AnalyticsScreen = AnalyticsScreen;
