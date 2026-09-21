/**
 * js/components/charts.js
 * Pure SVG chart rendering for NegoSim — no external dependencies.
 * Renders sparklines, gauges, and outcome charts from existing round data.
 */

const NegCharts = (function () {

  /**
   * Render a small sparkline inside a container.
   * @param {string} containerId  DOM element ID
   * @param {number[]} dataPoints Array of numeric values (e.g. offers per round)
   * @param {string} color        Stroke color (CSS value)
   * @param {object} [opts]       Optional { width, height, fillOpacity }
   */
  function renderSparkline(containerId, dataPoints, color, opts = {}) {
    const container = document.getElementById(containerId);
    if (!container || !dataPoints || dataPoints.length < 2) {
      if (container) container.innerHTML = '';
      return;
    }

    const w = opts.width || container.clientWidth || 200;
    const h = opts.height || 40;
    const padding = 4;
    const fillOpacity = opts.fillOpacity ?? 0.15;

    const min = Math.min(...dataPoints);
    const max = Math.max(...dataPoints);
    const range = max - min || 1;

    const points = dataPoints.map((val, i) => {
      const x = padding + (i / (dataPoints.length - 1)) * (w - padding * 2);
      const y = h - padding - ((val - min) / range) * (h - padding * 2);
      return { x, y };
    });

    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const fillD = pathD + ` L ${points[points.length - 1].x.toFixed(1)} ${h} L ${points[0].x.toFixed(1)} ${h} Z`;

    const lastPoint = points[points.length - 1];

    container.innerHTML = `
      <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;">
        <path d="${fillD}" fill="${color}" opacity="${fillOpacity}" />
        <path d="${pathD}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="${lastPoint.x.toFixed(1)}" cy="${lastPoint.y.toFixed(1)}" r="2.5" fill="${color}" />
      </svg>
    `;
  }

  /**
   * Render a horizontal 3-state risk gauge.
   * @param {string} containerId
   * @param {'Low'|'Medium'|'High'} level
   */
  function renderDeadlockGauge(containerId, level) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const levels = ['Low', 'Medium', 'High'];
    const colors = {
      Low:    'var(--color-success)',
      Medium: 'var(--color-warning)',
      High:   'var(--color-danger)',
    };
    const activeIdx = levels.indexOf(level);

    const segments = levels.map((lbl, i) => {
      const isActive = i <= activeIdx;
      const color = isActive ? colors[level] : 'var(--color-border-strong)';
      return `<div class="gauge-segment" style="flex:1; height:6px; border-radius:3px; background:${color}; transition: background 0.3s;"></div>`;
    }).join('');

    container.innerHTML = `
      <div class="deadlock-gauge" style="display:flex; gap:3px; align-items:center; margin-bottom:4px;">
        ${segments}
      </div>
      <div style="display:flex; justify-content:space-between; font-size:9px; font-family:var(--font-mono); color:var(--color-text-faint); letter-spacing:0.05em;">
        <span>LOW</span><span>MED</span><span>HIGH</span>
      </div>
    `;
  }

  /**
   * Render tiny bar sparkline for gap-between-offers over rounds.
   * @param {string} containerId
   * @param {number[]} gapData   Array of gap values per round
   * @param {string} color
   */
  function renderGapSparkline(containerId, gapData, color) {
    const container = document.getElementById(containerId);
    if (!container || !gapData || gapData.length === 0) {
      if (container) container.innerHTML = '';
      return;
    }

    const w = container.clientWidth || 120;
    const h = 32;
    const max = Math.max(...gapData, 1);
    const barW = Math.max(3, Math.min(8, (w - gapData.length) / gapData.length));
    const gap = 2;

    const bars = gapData.map((val, i) => {
      const barH = Math.max(2, (val / max) * (h - 4));
      const x = i * (barW + gap);
      const y = h - barH;
      return `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="1" fill="${color}" opacity="${i === gapData.length - 1 ? '1' : '0.5'}" />`;
    }).join('');

    container.innerHTML = `
      <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;">
        ${bars}
      </svg>
    `;
  }

  /**
   * Render outcome timeline line chart — two agent lines converging.
   * @param {string} containerId
   * @param {{ round: number, offer: number }[]} buyerData
   * @param {{ round: number, offer: number }[]} vendorData
   * @param {{ buyer: string, vendor: string }} colors
   */
  function renderOutcomeTimeline(containerId, buyerData, vendorData, colors) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if ((!buyerData || buyerData.length === 0) && (!vendorData || vendorData.length === 0)) {
      container.innerHTML = '<div style="color:var(--color-text-faint); font-size:12px; padding:16px; text-align:center;">No offer data to chart.</div>';
      return;
    }

    const w = container.clientWidth || 500;
    const h = 200;
    const padL = 60, padR = 20, padT = 20, padB = 36;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;

    const allOffers = [...(buyerData || []).map(d => d.offer), ...(vendorData || []).map(d => d.offer)].filter(v => v != null);
    const allRounds = [...new Set([...(buyerData || []).map(d => d.round), ...(vendorData || []).map(d => d.round)])].sort((a, b) => a - b);
    if (allOffers.length === 0 || allRounds.length === 0) {
      container.innerHTML = '';
      return;
    }

    const minOffer = Math.min(...allOffers);
    const maxOffer = Math.max(...allOffers);
    const offerRange = maxOffer - minOffer || 1;
    const minRound = allRounds[0];
    const maxRound = allRounds[allRounds.length - 1];
    const roundRange = maxRound - minRound || 1;

    function toX(round) { return padL + ((round - minRound) / roundRange) * chartW; }
    function toY(offer) { return padT + chartH - ((offer - minOffer) / offerRange) * chartH; }

    function makeLine(data, color) {
      if (!data || data.length === 0) return '';
      const pts = data.filter(d => d.offer != null).map(d => ({ x: toX(d.round), y: toY(d.offer) }));
      if (pts.length === 0) return '';
      const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
      const dots = pts.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="${color}" />`).join('');
      return `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" />${dots}`;
    }

    // Grid lines
    const gridCount = 4;
    let gridLines = '';
    for (let i = 0; i <= gridCount; i++) {
      const y = padT + (i / gridCount) * chartH;
      const val = maxOffer - (i / gridCount) * offerRange;
      gridLines += `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="var(--color-border)" stroke-dasharray="2,4" />`;
      gridLines += `<text x="${padL - 8}" y="${y + 4}" fill="var(--color-text-faint)" font-size="9" font-family="var(--font-mono)" text-anchor="end">₹${Math.round(val / 1000)}k</text>`;
    }

    // Round labels
    let roundLabels = '';
    allRounds.forEach(r => {
      const x = toX(r);
      roundLabels += `<text x="${x}" y="${h - 8}" fill="var(--color-text-faint)" font-size="9" font-family="var(--font-mono)" text-anchor="middle">R${r}</text>`;
    });

    container.innerHTML = `
      <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;">
        ${gridLines}
        ${roundLabels}
        ${makeLine(buyerData, colors.buyer)}
        ${makeLine(vendorData, colors.vendor)}
      </svg>
      <div style="display:flex; gap:16px; justify-content:center; margin-top:8px; font-size:11px;">
        <span style="display:flex; align-items:center; gap:4px;">
          <span style="width:10px; height:3px; background:${colors.buyer}; border-radius:2px; display:inline-block;"></span>
          Buyer
        </span>
        <span style="display:flex; align-items:center; gap:4px;">
          <span style="width:10px; height:3px; background:${colors.vendor}; border-radius:2px; display:inline-block;"></span>
          Vendor
        </span>
      </div>
    `;
  }

  /**
   * Render paired horizontal satisfaction bars.
   * @param {string} containerId
   * @param {{ agentName: string, score: number, color: string }[]} scores
   */
  function renderSatisfactionBars(containerId, scores) {
    const container = document.getElementById(containerId);
    if (!container || !scores || scores.length === 0) return;

    const bars = scores.map(s => {
      const pct = Math.max(0, Math.min(100, s.score || 0));
      return `
        <div class="sat-comp-row" style="display:flex; align-items:center; gap:12px; margin-bottom:8px;">
          <div style="width:80px; font-size:12px; font-weight:600; color:var(--color-text-muted); text-align:right; flex-shrink:0;">${s.agentName}</div>
          <div style="flex:1; height:8px; background:var(--color-border-strong); border-radius:4px; overflow:hidden;">
            <div style="width:${pct}%; height:100%; background:${s.color}; border-radius:4px; transition:width 0.5s var(--ease-out);"></div>
          </div>
          <div style="width:40px; font-size:12px; font-family:var(--font-mono); font-weight:600; color:${s.color};">${pct}%</div>
        </div>
      `;
    }).join('');

    container.innerHTML = bars;
  }

  return {
    renderSparkline,
    renderDeadlockGauge,
    renderGapSparkline,
    renderOutcomeTimeline,
    renderSatisfactionBars,
  };
})();

window.NegCharts = NegCharts;
