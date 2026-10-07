/**
 * js/screens/coach-screen.js
 * AI Coach Page — lists coaching reports per negotiation, shows score trend.
 */

const CoachScreen = (function () {
  let _mounted = false;

  function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = String(s || '');
    return d.innerHTML;
  }

  function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function renderScoreRing(score) {
    const pct = score != null ? Math.round(score) : 0;
    const color = pct >= 70 ? '#3FB950' : pct >= 45 ? '#D29922' : '#F85149';
    return `
      <div class="coach-score-ring" style="--pct:${pct};background:conic-gradient(${color} calc(${pct} * 1%),var(--color-surface) 0%);">
        <div class="coach-score-value" style="color:${color};">${pct}</div>
      </div>
    `;
  }

  function renderTrend(reports) {
    if (reports.length < 2) return '';
    const scores = reports.map(r => r.overallScore != null ? r.overallScore : 50).reverse();
    const max = Math.max(...scores, 1);
    const points = scores.map((s, i) => {
      const x = (i / (scores.length - 1)) * 260;
      const y = 60 - Math.round((s / 100) * 55);
      return `${x},${y}`;
    }).join(' ');
    return `
      <div class="chart-card" style="margin-bottom:24px;">
        <div class="chart-card-title">📈 Score Trend (latest ${scores.length})</div>
        <svg viewBox="0 0 260 65" width="100%" height="65" style="overflow:visible;">
          <defs>
            <linearGradient id="trend-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--color-coach)" stop-opacity="0.3"/>
              <stop offset="100%" stop-color="var(--color-coach)" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <polyline points="${points}" fill="none" stroke="var(--color-coach)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
          ${scores.map((s, i) => {
            const x = (i / (scores.length - 1)) * 260;
            const y = 60 - Math.round((s / 100) * 55);
            return `<circle cx="${x}" cy="${y}" r="3" fill="var(--color-coach)"/>`;
          }).join('')}
        </svg>
      </div>
    `;
  }

  function renderEmpty() {
    return `
      <div class="screen-empty">
        <div class="screen-empty-icon">🎯</div>
        <div class="screen-empty-title">No coaching reports yet</div>
        <div class="screen-empty-sub">Complete a Practice Mode negotiation and generate coaching feedback to see your reports here.</div>
      </div>
    `;
  }

  function renderReportCard(report) {
    const score = report.overallScore != null ? report.overallScore : '—';
    const status = report.generationStatus === 'fallback' ? ' (estimate)' : '';
    return `
      <div class="g-card stagger-1" style="display:flex;align-items:flex-start;gap:20px;">
        ${renderScoreRing(report.overallScore)}
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <div style="font-size:15px;font-weight:700;color:var(--color-text);">Score: ${score}/100${status}</div>
            <div style="font-size:11px;color:var(--color-text-muted);">${formatDate(report.createdAt)}</div>
          </div>
          <div style="font-size:11px;color:var(--color-text-faint);font-family:var(--font-mono);margin-bottom:12px;">
            Session: ${escHtml(report.sessionId?.slice(0, 12) || '—')}...
          </div>
          <button class="btn btn-ghost btn-sm" data-session-id="${escHtml(report.sessionId)}" onclick="CoachScreen._openDetail('${escHtml(report.sessionId)}')">
            View Report →
          </button>
        </div>
      </div>
    `;
  }

  async function _openDetail(sessionId) {
    const container = document.getElementById('screen-coach');
    if (!container) return;

    container.innerHTML = `
      <div class="page-content">
        <button class="btn btn-ghost btn-sm" id="coach-back-btn" style="margin-bottom:20px;">← Back</button>
        <div class="screen-loading"><div class="screen-loading-spinner"></div><div>Loading coaching report…</div></div>
      </div>
    `;

    document.getElementById('coach-back-btn').addEventListener('click', () => mount('screen-coach'));

    try {
      const res = await window.CoachService.getCoaching(sessionId);
      const coaching = res.coaching;
      if (!coaching) throw new Error('Report not found');

      const mistakesHtml = (coaching.mistakes || []).map(m =>
        `<li>Turn ${m.turn}: ${escHtml(m.description)}</li>`
      ).join('');

      const opportunitiesHtml = (coaching.missedOpportunities || []).map(o =>
        `<li>${escHtml(o)}</li>`
      ).join('');

      const strengthsHtml = (coaching.strengths || []).map(s =>
        `<li>${escHtml(s)}</li>`
      ).join('');

      const tipsHtml = (coaching.actionableTips || []).map((t, i) =>
        `<div class="g-card" style="margin-bottom:10px;display:flex;gap:14px;align-items:flex-start;">
          <div style="width:28px;height:28px;border-radius:50%;background:rgba(163,113,247,0.2);color:var(--color-coach);font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${i + 1}</div>
          <div style="font-size:13.5px;color:var(--color-text);">${escHtml(t)}</div>
        </div>`
      ).join('');

      container.innerHTML = `
        <div class="page-content">
          <button class="btn btn-ghost btn-sm" id="coach-back-btn2" style="margin-bottom:20px;">← All Reports</button>
          <div class="coach-card" style="margin-bottom:24px;">
            <div style="display:flex;align-items:center;gap:20px;margin-bottom:20px;">
              ${renderScoreRing(coaching.overallScore)}
              <div>
                <div style="font-size:20px;font-weight:800;color:var(--color-text);">AI Coach Feedback</div>
                <div style="font-size:13px;color:var(--color-text-muted);">${formatDate(coaching.createdAt)}</div>
                <div style="font-size:13px;color:var(--color-text-muted);">Overall Score: <b style="color:var(--color-coach);">${coaching.overallScore ?? '—'}/100</b></div>
              </div>
            </div>
          </div>

          ${strengthsHtml ? `
            <div class="builder-section stagger-1" style="margin-bottom:16px;">
              <div class="builder-section-title">✅ Strengths</div>
              <ul style="margin:0;padding-left:20px;color:var(--color-text);line-height:1.7;">${strengthsHtml}</ul>
            </div>
          ` : ''}

          ${mistakesHtml ? `
            <div class="builder-section stagger-2" style="margin-bottom:16px;border-color:rgba(248,81,73,0.2);">
              <div class="builder-section-title">⚠️ Mistakes</div>
              <ul style="margin:0;padding-left:20px;color:var(--color-text);line-height:1.7;">${mistakesHtml}</ul>
            </div>
          ` : ''}

          ${opportunitiesHtml ? `
            <div class="builder-section stagger-3" style="margin-bottom:16px;border-color:rgba(210,153,34,0.2);">
              <div class="builder-section-title">💡 Missed Opportunities</div>
              <ul style="margin:0;padding-left:20px;color:var(--color-text);line-height:1.7;">${opportunitiesHtml}</ul>
            </div>
          ` : ''}

          ${tipsHtml ? `
            <div style="margin-bottom:24px;">
              <div class="builder-section-title" style="margin-bottom:12px;">🚀 Actionable Tips</div>
              ${tipsHtml}
            </div>
          ` : ''}
        </div>
      `;
      document.getElementById('coach-back-btn2').addEventListener('click', () => mount('screen-coach'));
    } catch (err) {
      container.innerHTML = `
        <div class="page-content">
          <button class="btn btn-ghost btn-sm" id="coach-back-btn3" style="margin-bottom:20px;">← Back</button>
          <div class="screen-empty">
            <div class="screen-empty-icon">❌</div>
            <div class="screen-empty-title">Could not load report</div>
            <div class="screen-empty-sub">${err.message}</div>
          </div>
        </div>
      `;
      document.getElementById('coach-back-btn3').addEventListener('click', () => mount('screen-coach'));
    }
  }

  async function mount(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    _mounted = true;

    container.innerHTML = `
      <div class="page-content">
        <div class="screen-loading"><div class="screen-loading-spinner"></div><div>Loading coaching reports…</div></div>
      </div>
    `;

    try {
      const res = await window.CoachService.listCoaching();
      const reports = res.reports || [];
      if (!_mounted) return;

      if (reports.length === 0) {
        container.innerHTML = `<div class="page-content">${renderEmpty()}</div>`;
        return;
      }

      container.innerHTML = `
        <div class="page-content">
          ${renderTrend(reports)}
          <div style="display:flex;flex-direction:column;gap:16px;">
            ${reports.map(r => renderReportCard(r)).join('')}
          </div>
        </div>
      `;
    } catch (err) {
      if (!_mounted) return;
      container.innerHTML = `
        <div class="page-content">
          <div class="screen-empty">
            <div class="screen-empty-icon">🎯</div>
            <div class="screen-empty-title">Could not load coaching reports</div>
            <div class="screen-empty-sub">${err.message}</div>
          </div>
        </div>
      `;
    }
  }

  function unmount() { _mounted = false; }

  return { mount, unmount, _openDetail };
})();

window.CoachScreen = CoachScreen;
