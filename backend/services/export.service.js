/**
 * services/export.service.js
 * Generates CSV and text-based PDF-summary exports from session data.
 * No heavy PDF library required — outputs a styled UTF-8 text report
 * that clients can save/print as PDF from the browser.
 */

'use strict';

function formatINR(amount) {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Build a CSV string from session messages (per-turn data) plus concession data.
 */
function buildSessionCsv(session) {
  const lines = [];

  // Header row
  lines.push(['Turn', 'Round', 'Agent', 'Role', 'Decision', 'Offer (₹)', 'Message', 'Timestamp'].join(','));

  const messages = session.messages || [];
  messages.forEach((m, i) => {
    lines.push([
      i + 1,
      m.round || '',
      `"${(m.agentName || m.agentId || '').replace(/"/g, '""')}"`,
      `"${(m.role || '').replace(/"/g, '""')}"`,
      m.decision || '',
      m.offer != null ? m.offer : '',
      `"${(m.message || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
      m.timestamp || '',
    ].join(','));
  });

  // Concession section
  lines.push('');
  lines.push('CONCESSION DATA');
  lines.push(['Agent', 'Round', 'Previous Offer (₹)', 'Current Offer (₹)', 'Concession Amount (₹)', 'Concession %', 'Direction', 'Timestamp'].join(','));

  const concessionHistory = session.concessionHistory || {};
  const agentMap = {};
  (session.participants || session.agents || []).forEach(a => { agentMap[a.id] = a.name || a.id; });

  for (const [agentId, records] of Object.entries(concessionHistory)) {
    const agentName = agentMap[agentId] || agentId;
    (records || []).forEach(r => {
      lines.push([
        `"${agentName}"`,
        r.round || '',
        r.previousOffer != null ? r.previousOffer : '',
        r.currentOffer != null ? r.currentOffer : '',
        r.concessionAmount != null ? r.concessionAmount : '',
        r.concessionPercentage != null ? r.concessionPercentage.toFixed(1) : '',
        r.direction || '',
        r.timestamp || '',
      ].join(','));
    });
  }

  return lines.join('\n');
}

/**
 * Build a rich text report suitable for printing as PDF from the browser.
 * Returns HTML string.
 */
function buildPdfHtml(session, coachingReport) {
  const meta = session.report?.meta || {};
  const satisfactionScores = session.report?.satisfactionScores || [];
  const concessionSummary = session.report?.concessionSummary || [];
  const concessionTimeline = session.report?.concessionTimeline || [];
  const insights = session.report?.insights || [];

  const scenarioName = session.scenarioName || meta.scenarioName || 'Negotiation';
  const outcome = session.outcome || meta.result || 'unknown';
  const totalRounds = session.totalRounds || meta.totalRounds || 0;
  const mode = session.mode || meta.mode || 'simulation';
  const completedAt = session.completedAt ? new Date(session.completedAt).toLocaleString('en-IN') : '—';

  const outcomeColors = {
    agreement: '#3FB950',
    rejection: '#F85149',
    max_rounds: '#D29922',
    stopped: '#8B949E',
    error: '#F85149',
  };
  const outcomeColor = outcomeColors[outcome] || '#8B949E';
  const outcomeLabel = {
    agreement: '✓ Agreement Reached',
    rejection: '✗ Rejected',
    max_rounds: '⏱ Max Rounds Reached',
    stopped: '■ Stopped',
    error: '⚠ Error',
  }[outcome] || outcome;

  let satRows = satisfactionScores.map(s => `
    <tr>
      <td>${escHtml(s.agentName)}</td>
      <td>${escHtml(s.role)}</td>
      <td>${s.targetFmt || '—'}</td>
      <td>${s.finalOfferFmt || '—'}</td>
      <td style="color:${s.score >= 70 ? '#3FB950' : s.score >= 40 ? '#D29922' : '#F85149'}">
        <b>${s.score != null ? s.score + '%' : '—'}</b>
      </td>
    </tr>
  `).join('');

  let concRows = concessionSummary.map(cs => `
    <tr>
      <td>${escHtml(cs.agentName)}</td>
      <td>${cs.initialFmt || '—'}</td>
      <td>${cs.finalFmt || '—'}</td>
      <td>${cs.totalFmt || '—'} (${cs.concessionPct || 0}%)</td>
      <td>${cs.concessionCount || 0}</td>
    </tr>
  `).join('');

  let coachHtml = '';
  if (coachingReport) {
    const tips = (coachingReport.actionableTips || []).map(t => `<li>${escHtml(t)}</li>`).join('');
    const strengths = (coachingReport.strengths || []).map(s => `<li>${escHtml(s)}</li>`).join('');
    coachHtml = `
      <h2 style="margin-top:32px;color:#6E7BFA;">🎯 AI Coach Feedback</h2>
      <p><b>Overall Score: <span style="color:#6E7BFA;font-size:1.2em;">${coachingReport.overallScore ?? '—'}/100</span></b></p>
      ${strengths ? `<h3>Strengths</h3><ul>${strengths}</ul>` : ''}
      ${tips ? `<h3>Actionable Tips</h3><ul>${tips}</ul>` : ''}
    `;
  }

  const timelineHtml = concessionTimeline.slice(0, 20).map(t => `
    <div style="margin-bottom:8px;">
      <b>Round ${t.round}:</b>
      ${(t.entries || []).map(e => `${escHtml(e.agentName)}: <b>${e.action || ''}</b> ${e.offerFmt || '—'}`).join(' | ')}
    </div>
  `).join('');

  const insightsHtml = insights.map(i => `<li>${escHtml(i)}</li>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>NegoSim — ${escHtml(scenarioName)} Report</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a2e; margin: 0; padding: 40px; font-size: 13px; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  h2 { font-size: 16px; margin-top: 24px; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
  h3 { font-size: 13px; margin: 12px 0 6px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 12px; }
  th { background: #f5f7fa; text-align: left; padding: 6px 8px; font-weight: 600; }
  td { padding: 5px 8px; border-bottom: 1px solid #eee; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-weight: 700; font-size: 12px; }
  ul { margin: 4px 0; padding-left: 20px; }
  li { margin-bottom: 4px; }
  .meta { color: #555; font-size: 12px; margin-bottom: 16px; }
  @media print { body { padding: 20px; } }
</style>
</head>
<body>
  <h1>NegoSim — Negotiation Report</h1>
  <div class="meta">
    <b>Scenario:</b> ${escHtml(scenarioName)} &nbsp;|&nbsp;
    <b>Mode:</b> ${escHtml(mode)} &nbsp;|&nbsp;
    <b>Rounds:</b> ${totalRounds} &nbsp;|&nbsp;
    <b>Date:</b> ${completedAt}
  </div>
  <p><b>Outcome:</b> <span class="badge" style="background:${outcomeColor};color:#fff;">${outcomeLabel}</span></p>
  ${session.finalOffer != null ? `<p><b>Final Agreed Amount:</b> ${formatINR(session.finalOffer)}</p>` : ''}

  <h2>📊 Satisfaction Scores</h2>
  <table>
    <tr><th>Agent</th><th>Role</th><th>Target</th><th>Final Offer</th><th>Score</th></tr>
    ${satRows || '<tr><td colspan="5">No data</td></tr>'}
  </table>

  <h2>📉 Concession Summary</h2>
  <table>
    <tr><th>Agent</th><th>Opening</th><th>Closing</th><th>Total Moved</th><th>Concessions</th></tr>
    ${concRows || '<tr><td colspan="5">No data</td></tr>'}
  </table>

  ${concessionTimeline.length > 0 ? `<h2>📋 Concession Timeline</h2>${timelineHtml}` : ''}
  ${insights.length > 0 ? `<h2>💡 Key Insights</h2><ul>${insightsHtml}</ul>` : ''}
  ${coachHtml}

  <p style="margin-top:40px;color:#999;font-size:11px;">Generated by NegoSim — AI Multi-Agent Negotiation Platform</p>
</body>
</html>`;
}

function escHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { buildSessionCsv, buildPdfHtml };
