/**
 * js/components/human-input.js
 * Practice Mode — Human Participant Input Panel.
 *
 * Shows when it's your turn to negotiate. Type a message, set your offer,
 * then Send, Accept, or Reject. The AI will respond on the next round.
 *
 * Public API:
 *   HumanInput.show(containerId, context)  — mount the panel
 *   HumanInput.hide(containerId)           — remove the panel
 */

const HumanInput = (function () {

  const PANEL_ID = 'human-input-panel';

  // ── Scenario-aware placeholder prompts ─────────────────────────────────────
  const PLACEHOLDERS = {
    'vendor-pricing': [
      "e.g. 'I can meet at ₹7,50,000 if you include a 3-month warranty.'",
      "e.g. 'Given current market rates, ₹7,20,000 seems fair to both sides.'",
      "e.g. 'I'm flexible on payment terms if we can close at ₹7,40,000.'",
    ],
    'job-offer': [
      "e.g. 'A CTC of ₹15,00,000 reflects my experience and the market benchmark.'",
      "e.g. 'I'd be happy to join sooner if we can agree on ₹14,50,000 + benefits.'",
      "e.g. 'I'm open to a performance review in 6 months if we start at ₹15,00,000.'",
    ],
    'budget-allocation': [
      "e.g. 'We need at least ₹25,00,000 to deliver the core features on time.'",
      "e.g. 'A 10% contingency buffer ensures we won't exceed this allocation.'",
      "e.g. 'I can phase the spending quarterly if ₹22,00,000 is approved now.'",
    ],
    default: [
      "Describe your position clearly and briefly. Keep it respectful and professional.",
      "e.g. 'I think ₹X is fair because…' — explain your reasoning in 1–2 sentences.",
      "Tip: A concession with a clear reason is more persuasive than a bare number.",
    ],
  };

  function _getPlaceholder(scenarioId) {
    const pool = PLACEHOLDERS[scenarioId] || PLACEHOLDERS.default;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ── Scenario-aware constraint label ────────────────────────────────────────
  function _getConstraintLabel(constraint, scenarioId) {
    if (!constraint) return '';
    const val = `₹${Number(constraint.value).toLocaleString('en-IN')}`;
    if (constraint.type === 'max') {
      return scenarioId === 'job-offer'
        ? `Budget ceiling: ${val}`
        : scenarioId === 'budget-allocation'
          ? `Max approved: ${val}`
          : `Your max budget: ${val}`;
    }
    if (constraint.type === 'min') {
      return scenarioId === 'job-offer'
        ? `Min acceptable CTC: ${val}`
        : scenarioId === 'budget-allocation'
          ? `Min required: ${val}`
          : `Your floor price: ${val}`;
    }
    return '';
  }

  // ── Etiquette tip (rotates per show) ───────────────────────────────────────
  const ETIQUETTE_TIPS = [
    '💡 Keep your message brief and professional — one clear point lands better.',
    '💡 A small concession with a reason is more effective than a stubborn position.',
    '💡 Asking a question (e.g. "What if we…?") can unlock creative solutions.',
    '💡 Accepting wins the round — use it when the offer is within your comfort zone.',
    '💡 Stay constructive. The AI adapts to your reasoning, not just your number.',
  ];
  let _tipIndex = 0;

  /**
   * Show the human input panel.
   * @param {string} containerId — parent element ID
   * @param {object} context     — { agentName, opponentName, opponentOffer, round,
   *                                 maxRounds, numericConstraint, scenarioId }
   */
  function show(containerId, context = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    hide(); // remove any previous panel

    const sid = context.scenarioId || 'default';
    const opponentOfferText = context.opponentOffer != null
      ? `₹${Number(context.opponentOffer).toLocaleString('en-IN')}`
      : 'None yet';
    const constraintLabel = _getConstraintLabel(context.numericConstraint, sid);
    const placeholder     = _getPlaceholder(sid);
    const tip             = ETIQUETTE_TIPS[_tipIndex++ % ETIQUETTE_TIPS.length];
    const opName          = context.opponentName || 'AI Agent';
    const agName          = context.agentName    || 'You';

    const panel = document.createElement('div');
    panel.id        = PANEL_ID;
    panel.className = 'human-input-panel';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Your negotiation turn');

    panel.innerHTML = `
      <!-- Header -->
      <div class="human-input-header">
        <div class="human-input-header-left">
          <span class="human-input-badge">YOUR TURN</span>
          <span class="human-input-title">You are negotiating as <strong>${escapeHtml(agName)}</strong></span>
        </div>
        <span class="human-input-round">Round ${context.round || '—'} / ${context.maxRounds || '—'}</span>
      </div>

      <!-- Purpose + context bar -->
      <div class="human-input-info-bar">
        <div class="human-input-info-item">
          <span class="human-input-info-label">What to do:</span>
          <span class="human-input-info-value">Type a brief message and set your offer below, then click <em>Send Offer</em>. Or use <em>Accept</em> / <em>Reject</em> for a quick decision.</span>
        </div>
        <div class="human-input-info-item">
          <span class="human-input-info-label">${escapeHtml(opName)}'s last offer:</span>
          <span class="human-input-context-offer">${opponentOfferText}</span>
        </div>
      </div>

      <!-- Message -->
      <div class="human-input-field-group">
        <label for="hip-message" class="human-input-label">Your message <span class="human-input-label-hint">(optional but recommended)</span></label>
        <textarea
          id="hip-message"
          class="human-input-textarea"
          placeholder="${placeholder}"
          rows="2"
          maxlength="400"
          aria-label="Your negotiation message"
        ></textarea>
        <div class="human-input-char-hint" id="hip-char-count">400 characters remaining</div>
      </div>

      <!-- Offer + actions -->
      <div class="human-input-row">
        <div class="human-input-offer-wrap">
          <label for="hip-offer" class="human-input-label">
            Your offer (₹)
            ${constraintLabel ? `<span class="human-input-constraint">${constraintLabel}</span>` : ''}
          </label>
          <input
            type="number"
            id="hip-offer"
            class="human-input-offer"
            placeholder="Enter amount"
            min="0"
            step="1000"
            aria-label="Your offer amount in rupees"
          />
        </div>
        <div class="human-input-actions">
          <button id="hip-btn-offer"  class="btn btn-primary human-input-btn" title="Send your counter-offer">
            ↗ Send Offer
          </button>
          <button id="hip-btn-accept" class="btn human-input-btn human-input-btn-accept" title="Accept the opponent's last offer">
            ✓ Accept
          </button>
          <button id="hip-btn-reject" class="btn human-input-btn human-input-btn-reject" title="Walk away from the current offer">
            ✗ Reject
          </button>
        </div>
      </div>

      <!-- Etiquette tip -->
      <div class="human-input-tip">${tip}</div>
    `;

    container.appendChild(panel);

    // ── Wire buttons ──────────────────────────────────────────────────────────
    document.getElementById('hip-btn-offer') .addEventListener('click', () => _submit('counter_offer', context));
    document.getElementById('hip-btn-accept').addEventListener('click', () => _submit('accept',        context));
    document.getElementById('hip-btn-reject').addEventListener('click', () => _submit('reject',        context));

    // ── Character counter ─────────────────────────────────────────────────────
    const textarea  = document.getElementById('hip-message');
    const charCount = document.getElementById('hip-char-count');
    if (textarea && charCount) {
      textarea.addEventListener('input', () => {
        const remaining = 400 - textarea.value.length;
        charCount.textContent = `${remaining} character${remaining !== 1 ? 's' : ''} remaining`;
        charCount.style.color = remaining < 50 ? '#f59e0b' : '';
      });
    }

    // ── Auto-focus textarea ───────────────────────────────────────────────────
    setTimeout(() => { if (textarea) textarea.focus(); }, 120);

    // ── Scroll into view ──────────────────────────────────────────────────────
    setTimeout(() => { panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 180);
  }

  /**
   * Remove the panel.
   */
  function hide() {
    const el = document.getElementById(PANEL_ID);
    if (el) el.remove();
  }

  /**
   * Submit the human turn via ApiService WebSocket.
   * @param {'counter_offer'|'accept'|'reject'} decision
   * @param {object} context
   */
  function _submit(decision, context = {}) {
    const msgEl   = document.getElementById('hip-message');
    const offerEl = document.getElementById('hip-offer');

    const message = msgEl   ? msgEl.value.trim()        : '';
    const offer   = offerEl ? parseFloat(offerEl.value) : NaN;

    // Validate: message is required
    if (!message) {
      if (msgEl) {
        msgEl.classList.add('input-error-flash');
        msgEl.focus();
        setTimeout(() => msgEl.classList.remove('input-error-flash'), 800);
      }
      _showFieldError(msgEl, 'Please enter a message before sending.');
      return;
    }

    // Validate: offer required for counter_offer
    if (decision === 'counter_offer' && (isNaN(offer) || offer <= 0)) {
      if (offerEl) {
        offerEl.classList.add('input-error-flash');
        offerEl.focus();
        setTimeout(() => offerEl.classList.remove('input-error-flash'), 800);
      }
      _showFieldError(offerEl, 'Please enter a valid offer amount before sending.');
      return;
    }

    // Warn if accepting without any prior offer shown
    if (decision === 'accept' && context.opponentOffer == null) {
      // Proceed anyway — engine will handle
    }

    const turnData = {
      message,
      offer:    decision === 'counter_offer' ? Math.round(offer) : null,
      decision,
      reason:   message || null,
    };

    if (window.ApiService && typeof window.ApiService.sendHumanTurn === 'function') {
      window.ApiService.sendHumanTurn(turnData);
    }

    // Freeze panel with "Processing…" overlay while engine responds
    _setSubmitted();
  }

  function _showFieldError(el, msg) {
    if (!el) return;
    const existing = document.getElementById('hip-field-error');
    if (existing) existing.remove();
    const err = document.createElement('div');
    err.id        = 'hip-field-error';
    err.className = 'human-input-field-error';
    err.textContent = msg;
    el.parentNode.appendChild(err);
    setTimeout(() => { if (err.parentNode) err.remove(); }, 2500);
  }

  function _setSubmitted() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    panel.classList.add('human-input-submitted');
    panel.querySelectorAll('button, textarea, input').forEach(el => { el.disabled = true; });
    // Replace tip with status
    const tip = panel.querySelector('.human-input-tip');
    if (tip) { tip.textContent = '⏳ Submitted — waiting for the AI to respond…'; }
  }

  return { show, hide };

})();

window.HumanInput = HumanInput;

// ── escapeHtml (local, avoids dependency on app.js) ────────────────────────
function _hipEscapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
// Patch in case app.js escapeHtml isn't available yet
if (typeof escapeHtml === 'undefined') {
  window.escapeHtml = _hipEscapeHtml;
}
