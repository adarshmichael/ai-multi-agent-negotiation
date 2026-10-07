/**
 * js/screens/scenario-builder-screen.js
 * Custom Scenario Builder — create, list, edit, delete, duplicate custom scenarios.
 * Custom scenarios appear in the scenarios list with a "Custom" badge.
 */

const ScenarioBuilderScreen = (function () {
  let _mounted = false;
  let _view = 'list'; // 'list' | 'form'
  let _editId = null;

  const PERSONALITIES = ['aggressive', 'collaborative', 'risk-averse', 'competitive', 'flexible', 'analytical', 'professional'];

  function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = String(s || '');
    return d.innerHTML;
  }

  function renderEmpty() {
    return `
      <div class="screen-empty">
        <div class="screen-empty-icon">🔧</div>
        <div class="screen-empty-title">No custom scenarios yet</div>
        <div class="screen-empty-sub">Build your own negotiation scenario with custom agents, goals, and constraints.</div>
        <button class="btn btn-primary" id="create-first-scenario" style="margin-top:16px;">+ Create Scenario</button>
      </div>
    `;
  }

  function renderScenarioCard(s) {
    const agentNames = (s.agents || []).map(a => `<span class="agent-chip">${escHtml(a.name)}</span>`).join('');
    return `
      <div class="g-card" style="margin-bottom:16px;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px;">
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <div style="font-size:16px;font-weight:700;color:var(--color-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(s.name)}</div>
              <span class="badge-custom">✨ Custom</span>
            </div>
            <div style="font-size:12.5px;color:var(--color-text-muted);margin-bottom:8px;">${escHtml(s.description || 'No description')}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">${agentNames}</div>
          </div>
          <div style="font-size:12px;color:var(--color-text-muted);flex-shrink:0;">${s.maxRounds || 10} rounds</div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-primary btn-sm" data-sb-action="run" data-id="${escHtml(s.id)}">▶ Run</button>
          <button class="btn btn-ghost btn-sm"  data-sb-action="edit" data-id="${escHtml(s.id)}">Edit</button>
          <button class="btn btn-ghost btn-sm"  data-sb-action="duplicate" data-id="${escHtml(s.id)}">Duplicate</button>
          <button class="btn btn-ghost btn-sm"  data-sb-action="delete" data-id="${escHtml(s.id)}" style="color:var(--color-danger);">Delete</button>
        </div>
      </div>
    `;
  }

  function _emptyAgent(idx) {
    return { name: '', role: '', goal: '', personality: 'collaborative', numericType: 'max', numericValue: '', hasNumeric: false };
  }

  function renderAgentBlock(idx, agent) {
    agent = agent || _emptyAgent(idx);
    return `
      <div class="agent-builder-card" id="agent-block-${idx}">
        <div class="agent-builder-header">
          <span class="agent-builder-index">Agent ${idx + 1}</span>
          ${idx >= 2 ? `<button type="button" class="btn btn-ghost btn-sm" data-remove-agent="${idx}" style="color:var(--color-danger);padding:2px 8px;">Remove</button>` : ''}
        </div>
        <div class="form-row">
          <div class="form-field">
            <label class="form-label">Name *</label>
            <input class="form-input" type="text" name="agent_name_${idx}" value="${escHtml(agent.name)}" placeholder="e.g. Buyer" maxlength="60" required>
            <div class="form-error-msg" id="err-agent-name-${idx}"></div>
          </div>
          <div class="form-field">
            <label class="form-label">Role *</label>
            <input class="form-input" type="text" name="agent_role_${idx}" value="${escHtml(agent.role)}" placeholder="e.g. Customer" maxlength="80" required>
            <div class="form-error-msg" id="err-agent-role-${idx}"></div>
          </div>
        </div>
        <div class="form-field">
          <label class="form-label">Primary Goal *</label>
          <input class="form-input" type="text" name="agent_goal_${idx}" value="${escHtml(agent.goal)}" placeholder="e.g. Minimize purchase price" maxlength="120" required>
          <div class="form-error-msg" id="err-agent-goal-${idx}"></div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label class="form-label">Default Personality</label>
            <select class="form-select" name="agent_personality_${idx}">
              ${PERSONALITIES.map(p => `<option value="${p}" ${agent.personality === p ? 'selected' : ''}>${p.charAt(0).toUpperCase() + p.slice(1)}</option>`).join('')}
            </select>
          </div>
          <div class="form-field">
            <label class="form-label">Numeric Constraint</label>
            <select class="form-select" name="agent_nc_type_${idx}" id="nc-type-${idx}">
              <option value="">None</option>
              <option value="max" ${agent.numericType === 'max' ? 'selected' : ''}>Maximum (e.g. budget cap)</option>
              <option value="min" ${agent.numericType === 'min' ? 'selected' : ''}>Minimum (e.g. floor price)</option>
            </select>
          </div>
        </div>
        <div class="form-field" id="nc-value-wrap-${idx}" style="${!agent.numericType || !agent.hasNumeric ? 'display:none' : ''}">
          <label class="form-label">Constraint Value (₹)</label>
          <input class="form-input" type="number" name="agent_nc_value_${idx}" value="${escHtml(String(agent.numericValue || ''))}" placeholder="e.g. 1000000" min="0" step="1000">
          <div class="form-error-msg" id="err-agent-nc-${idx}"></div>
        </div>
      </div>
    `;
  }

  function renderForm(scenario) {
    const isEdit = !!scenario;
    const agents = scenario?.agents || [{}, {}];
    const numAgents = Math.max(2, agents.length);
    const agentBlocks = Array.from({ length: numAgents }, (_, i) => renderAgentBlock(i, agents[i])).join('');

    return `
      <div class="page-content">
        <button class="btn btn-ghost btn-sm" id="sb-back-btn" style="margin-bottom:20px;">← Back to Scenarios</button>
        <div style="font-size:20px;font-weight:800;margin-bottom:24px;color:var(--color-text);">
          ${isEdit ? '✏️ Edit Scenario' : '🔧 Build Custom Scenario'}
        </div>
        <form class="builder-form" id="scenario-builder-form" novalidate>
          <div class="builder-section">
            <div class="builder-section-title">📋 Scenario Details</div>
            <div class="form-field">
              <label class="form-label" for="sb-name">Scenario Name *</label>
              <input class="form-input" type="text" id="sb-name" name="name" value="${escHtml(scenario?.name || '')}" placeholder="e.g. Infrastructure Contract Negotiation" maxlength="100" required>
              <div class="form-error-msg" id="err-name"></div>
            </div>
            <div class="form-field">
              <label class="form-label" for="sb-description">Description</label>
              <textarea class="form-textarea" id="sb-description" name="description" rows="3" maxlength="500" placeholder="Briefly describe the negotiation context…">${escHtml(scenario?.description || '')}</textarea>
            </div>
            <div class="form-field" style="max-width:200px;">
              <label class="form-label" for="sb-max-rounds">Max Rounds (1–50)</label>
              <input class="form-input" type="number" id="sb-max-rounds" name="maxRounds" value="${scenario?.maxRounds || 10}" min="1" max="50">
              <div class="form-error-msg" id="err-max-rounds"></div>
            </div>
          </div>

          <div class="builder-section">
            <div class="builder-section-title">🤖 Agents (2–4 required)</div>
            <div id="sb-agents-container">
              ${agentBlocks}
            </div>
            <div class="form-error-msg" id="err-agents" style="font-size:12px;margin-top:4px;"></div>
            <button type="button" class="btn btn-ghost btn-sm" id="sb-add-agent" style="margin-top:10px;">+ Add Agent</button>
          </div>

          <div style="display:flex;gap:14px;flex-wrap:wrap;">
            <button type="submit" class="btn btn-primary" id="sb-submit-btn">
              <span class="auth-spinner" id="sb-spinner" style="display:none;"></span>
              ${isEdit ? '💾 Save Changes' : '✨ Create Scenario'}
            </button>
            <button type="button" class="btn btn-ghost" id="sb-cancel-btn">Cancel</button>
          </div>
        </form>
      </div>
    `;
  }

  function _getAgentCount() {
    return document.querySelectorAll('[id^="agent-block-"]').length;
  }

  function _addAgent() {
    const container = document.getElementById('sb-agents-container');
    if (!container) return;
    const idx = _getAgentCount();
    if (idx >= 4) return;
    const div = document.createElement('div');
    div.innerHTML = renderAgentBlock(idx);
    container.appendChild(div.firstElementChild);
    _wireNcToggles();
    _wireRemoveAgents();
  }

  function _removeAgent(idx) {
    const block = document.getElementById(`agent-block-${idx}`);
    if (block) block.remove();
    // Re-index remaining blocks
    document.querySelectorAll('[id^="agent-block-"]').forEach((el, i) => {
      el.id = `agent-block-${i}`;
      const title = el.querySelector('.agent-builder-index');
      if (title) title.textContent = `Agent ${i + 1}`;
    });
    _wireNcToggles();
    _wireRemoveAgents();
  }

  function _wireNcToggles() {
    document.querySelectorAll('[id^="nc-type-"]').forEach(sel => {
      const idx = sel.id.replace('nc-type-', '');
      const wrap = document.getElementById(`nc-value-wrap-${idx}`);
      if (!wrap) return;
      sel.onchange = () => { wrap.style.display = sel.value ? '' : 'none'; };
      wrap.style.display = sel.value ? '' : 'none';
    });
  }

  function _wireRemoveAgents() {
    document.querySelectorAll('[data-remove-agent]').forEach(btn => {
      btn.onclick = () => _removeAgent(Number(btn.dataset.removeAgent));
    });
  }

  function _collectFormData() {
    const form = document.getElementById('scenario-builder-form');
    if (!form) return null;

    const name = form.querySelector('[name="name"]')?.value.trim() || '';
    const description = form.querySelector('[name="description"]')?.value.trim() || '';
    const maxRounds = parseInt(form.querySelector('[name="maxRounds"]')?.value) || 10;

    const agentBlocks = document.querySelectorAll('[id^="agent-block-"]');
    const agents = Array.from(agentBlocks).map((_, i) => {
      const nc_type = form.querySelector(`[name="agent_nc_type_${i}"]`)?.value || '';
      const nc_value = parseFloat(form.querySelector(`[name="agent_nc_value_${i}"]`)?.value || '0');
      const agentId = `agent-${i}`;
      return {
        id: agentId,
        name: form.querySelector(`[name="agent_name_${i}"]`)?.value.trim() || '',
        role: form.querySelector(`[name="agent_role_${i}"]`)?.value.trim() || '',
        goal: form.querySelector(`[name="agent_goal_${i}"]`)?.value.trim() || '',
        personality: form.querySelector(`[name="agent_personality_${i}"]`)?.value || 'collaborative',
        numericConstraint: nc_type && nc_value > 0 ? { type: nc_type, value: nc_value } : null,
      };
    });

    return { name, description, maxRounds, agents };
  }

  function _clearErrors() {
    document.querySelectorAll('.form-error-msg').forEach(el => { el.textContent = ''; });
    document.querySelectorAll('.form-input.error,.form-select.error,.form-textarea.error')
      .forEach(el => el.classList.remove('error'));
  }

  function _showErrors(errors) {
    errors.forEach(err => {
      // Map backend error messages to form field IDs heuristically
      const lower = err.toLowerCase();
      if (lower.includes('name') && !lower.includes('agent')) {
        const el = document.getElementById('err-name');
        if (el) el.textContent = err;
        document.querySelector('[name="name"]')?.classList.add('error');
      } else if (lower.includes('agents') && (lower.includes('array') || lower.includes('2-4'))) {
        const el = document.getElementById('err-agents');
        if (el) el.textContent = err;
      } else if (lower.includes('maxrounds') || lower.includes('max rounds')) {
        const el = document.getElementById('err-max-rounds');
        if (el) el.textContent = err;
      }
    });
  }

  async function _handleSubmit(e, isEdit) {
    e.preventDefault();
    _clearErrors();
    const data = _collectFormData();
    if (!data) return;

    const btn = document.getElementById('sb-submit-btn');
    const spinner = document.getElementById('sb-spinner');
    if (btn) btn.disabled = true;
    if (spinner) spinner.style.display = 'inline-block';

    try {
      if (isEdit && _editId) {
        await window.ScenarioService.updateScenario(_editId, data);
      } else {
        await window.ScenarioService.createScenario(data);
      }
      // Reload scenario list in AppState
      if (window.AppState && window.AppState.loadScenarios) {
        await window.AppState.loadScenarios();
      }
      await mount('screen-scenario-builder');
    } catch (err) {
      // Try to parse validation errors
      const msg = err.message || 'An error occurred';
      const errors = msg.split(';').map(e => e.trim()).filter(Boolean);
      _showErrors(errors);
      document.getElementById('err-agents').textContent = errors.find(e => !e.startsWith('agent')) ? '' : msg;
      if (btn) btn.disabled = false;
      if (spinner) spinner.style.display = 'none';
    }
  }

  function _wireFormEvents(isEdit) {
    const form = document.getElementById('scenario-builder-form');
    if (!form) return;

    form.addEventListener('submit', e => _handleSubmit(e, isEdit));
    document.getElementById('sb-back-btn')?.addEventListener('click', () => mount('screen-scenario-builder'));
    document.getElementById('sb-cancel-btn')?.addEventListener('click', () => mount('screen-scenario-builder'));
    document.getElementById('sb-add-agent')?.addEventListener('click', _addAgent);
    _wireNcToggles();
    _wireRemoveAgents();
  }

  async function _showEditForm(id) {
    const container = document.getElementById('screen-scenario-builder');
    if (!container) return;
    _editId = id;
    _view = 'form';

    container.innerHTML = `<div class="page-content"><div class="screen-loading"><div class="screen-loading-spinner"></div><div>Loading…</div></div></div>`;
    try {
      const res = await window.ScenarioService.getScenario(id);
      const s = res.scenario;
      // Convert NC shape for form pre-fill
      const agents = (s.agents || []).map(a => ({
        ...a,
        numericType: a.numericConstraint?.type || '',
        numericValue: a.numericConstraint?.value || '',
        hasNumeric: !!a.numericConstraint,
      }));
      container.innerHTML = renderForm({ ...s, agents });
      _wireFormEvents(true);
    } catch (err) {
      container.innerHTML = `<div class="page-content"><div class="screen-empty"><div class="screen-empty-icon">❌</div><div>${err.message}</div></div></div>`;
    }
  }

  async function mount(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    _mounted = true;
    _view = 'list';
    _editId = null;

    container.innerHTML = `<div class="page-content"><div class="screen-loading"><div class="screen-loading-spinner"></div><div>Loading scenarios…</div></div></div>`;

    try {
      const res = await window.ScenarioService.listScenarios();
      const scenarios = res.scenarios || [];
      if (!_mounted) return;

      container.innerHTML = `
        <div class="page-content">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
            <div>
              <div style="font-size:20px;font-weight:800;color:var(--color-text);">Custom Scenarios</div>
              <div style="font-size:13px;color:var(--color-text-muted);">Build, edit, and run your own negotiation scenarios.</div>
            </div>
            <button class="btn btn-primary" id="sb-create-new">+ New Scenario</button>
          </div>
          ${scenarios.length === 0 ? renderEmpty() : scenarios.map(s => renderScenarioCard(s)).join('')}
        </div>
      `;

      document.getElementById('sb-create-new')?.addEventListener('click', () => {
        _view = 'form';
        _editId = null;
        container.innerHTML = renderForm(null);
        _wireFormEvents(false);
      });

      document.getElementById('create-first-scenario')?.addEventListener('click', () => {
        _view = 'form';
        _editId = null;
        container.innerHTML = renderForm(null);
        _wireFormEvents(false);
      });

      // Wire action buttons
      container.querySelectorAll('[data-sb-action]').forEach(btn => {
        const action = btn.dataset.sbAction;
        const id = btn.dataset.id;
        btn.addEventListener('click', async () => {
          if (action === 'edit') {
            await _showEditForm(id);
          } else if (action === 'delete') {
            if (!confirm('Delete this custom scenario? This cannot be undone.')) return;
            try {
              await window.ScenarioService.deleteScenario(id);
              if (window.AppState?.loadScenarios) await window.AppState.loadScenarios();
              await mount(containerId);
            } catch (err) { alert(err.message); }
          } else if (action === 'duplicate') {
            try {
              await window.ScenarioService.duplicateScenario(id);
              if (window.AppState?.loadScenarios) await window.AppState.loadScenarios();
              await mount(containerId);
            } catch (err) { alert(err.message); }
          } else if (action === 'run') {
            // Navigate to configure screen with this custom scenario pre-selected
            if (window.AppState) {
              // Set default mode (ai-vs-ai) if no mode selected yet
              if (!window.AppState.getMode()) {
                window.AppState.setMode('ai-vs-ai');
              }
              await window.AppState.selectScenario(id);
              window.AppState.goToStep(window.AppState.STEPS.CONFIGURE);
            }
          }
        });
      });

    } catch (err) {
      if (!_mounted) return;
      container.innerHTML = `
        <div class="page-content">
          <div class="screen-empty">
            <div class="screen-empty-icon">🔧</div>
            <div class="screen-empty-title">Could not load scenarios</div>
            <div class="screen-empty-sub">${err.message}</div>
          </div>
        </div>
      `;
    }
  }

  function unmount() { _mounted = false; }

  return { mount, unmount };
})();

window.ScenarioBuilderScreen = ScenarioBuilderScreen;
