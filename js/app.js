/**
 * app.js
 * Handles rendering + wiring for all four screens, driven entirely by AppState.
 * No negotiation/LLM logic lives here — Milestone 1 only.
 */

const ICONS = {
  cart: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
  briefcase: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/></svg>',
  goal: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
};

function initials(name) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/* ============================== Stepper ============================== */

const STEP_ORDER = [
  { id: AppState.STEPS.SCENARIO, label: "Scenario" },
  { id: AppState.STEPS.CONFIGURE, label: "Configure" },
  { id: AppState.STEPS.SUMMARY, label: "Summary" },
  { id: AppState.STEPS.READY, label: "Ready" },
];

function renderStepper() {
  const { currentStep } = AppState.getState();
  const currentIndex = STEP_ORDER.findIndex((s) => s.id === currentStep);
  const el = document.getElementById("stepper");
  el.innerHTML = STEP_ORDER.map((step, i) => {
    const cls = i === currentIndex ? "active" : i < currentIndex ? "done" : "";
    const connector = i < STEP_ORDER.length - 1 ? '<div class="step-connector"></div>' : "";
    return `<div class="step-pill ${cls}"><span class="dot"></span>${step.label}</div>${connector}`;
  }).join("");
}

/* ============================== Screen switching ============================== */

function showScreen(stepId) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  const map = {
    [AppState.STEPS.SCENARIO]: "screen-scenario",
    [AppState.STEPS.CONFIGURE]: "screen-configure",
    [AppState.STEPS.SUMMARY]: "screen-summary",
    [AppState.STEPS.READY]: "screen-ready",
  };
  document.getElementById(map[stepId]).classList.add("active");
  renderStepper();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ============================== 3D tilt interaction ============================== */

function attachTiltEffect(card) {
  const maxTilt = 8;
  card.addEventListener("mousemove", (e) => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const px = x / rect.width;
    const py = y / rect.height;
    const rotateY = (px - 0.5) * maxTilt * 2;
    const rotateX = (0.5 - py) * maxTilt * 2;
    card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;
    card.style.setProperty("--mx", `${px * 100}%`);
    card.style.setProperty("--my", `${py * 100}%`);
  });
  card.addEventListener("mouseleave", () => {
    card.style.transform = "rotateX(0deg) rotateY(0deg) translateY(0)";
  });
}

/* ============================== Screen 1: Scenario selection ============================== */

function renderScenarioGrid() {
  const grid = document.getElementById("scenario-grid");
  const { selectedScenarioId } = AppState.getState();

  grid.innerHTML = SCENARIOS.map((scenario) => {
    const isSelected = scenario.id === selectedScenarioId;
    const agentChips = scenario.agents.map((a) => `<span class="agent-chip">${a.name}</span>`).join("");
    return `
      <div class="scenario-card ${isSelected ? "selected" : ""}" data-scenario-id="${scenario.id}">
        <div class="selected-badge">✓ Selected</div>
        <div class="scenario-card-icon">${ICONS[scenario.icon] || ICONS.goal}</div>
        <div class="scenario-card-body">
          <div class="scenario-card-title">${scenario.name}</div>
          <div class="scenario-card-desc">${scenario.description}</div>
          <div class="scenario-card-agents">${agentChips}</div>
        </div>
        <div class="scenario-card-cta">
          <button class="select-btn" type="button">${isSelected ? "Selected ✓" : "Select Scenario"}</button>
        </div>
      </div>
    `;
  }).join("");

  grid.querySelectorAll(".scenario-card").forEach((card) => {
    attachTiltEffect(card);
    card.addEventListener("click", () => {
      AppState.selectScenario(card.dataset.scenarioId);
      document.getElementById("scenario-validation").classList.remove("show");
    });
  });
}

function handleScenarioContinue() {
  const { selectedScenarioId } = AppState.getState();
  if (!selectedScenarioId) {
    document.getElementById("scenario-validation").classList.add("show");
    return;
  }
  AppState.goToStep(AppState.STEPS.CONFIGURE);
}

/* ============================== Screen 2: Agent configuration ============================== */

function renderAgentGrid() {
  const scenario = AppState.getSelectedScenario();
  if (!scenario) return;

  document.getElementById("configure-title").textContent = `Configure Agents — ${scenario.name}`;

  const grid = document.getElementById("agent-grid");
  grid.innerHTML = scenario.agents.map((agent) => {
    const selectedPersonality = AppState.getPersonality(agent.id);
    const personalityButtons = PERSONALITIES.map((p) => {
      const active = p.id === selectedPersonality ? "active" : "";
      return `<button class="personality-btn ${active}" type="button" data-agent-id="${agent.id}" data-personality-id="${p.id}" title="${p.description}">${p.label}</button>`;
    }).join("");

    return `
      <div class="agent-card" data-agent-id="${agent.id}">
        <div class="agent-card-header">
          <div class="agent-avatar">${initials(agent.name)}</div>
          <div>
            <div class="agent-name">${agent.name}</div>
            <div class="agent-role">${agent.role}</div>
          </div>
        </div>

        <div class="agent-detail-row">
          <div class="agent-detail-icon">${ICONS.goal}</div>
          <div>
            <div class="agent-detail-label">Goal</div>
            <div class="agent-detail-value">${agent.goal}</div>
          </div>
        </div>

        <div class="agent-detail-row">
          <div class="agent-detail-icon">${ICONS.lock}</div>
          <div>
            <div class="agent-detail-label">Constraint</div>
            <div class="agent-detail-value">${agent.constraint}</div>
          </div>
        </div>

        <div class="personality-label">Personality</div>
        <div class="personality-options">${personalityButtons}</div>
      </div>
    `;
  }).join("");

  grid.querySelectorAll(".personality-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      AppState.setPersonality(btn.dataset.agentId, btn.dataset.personalityId);
      document.getElementById("personality-validation").classList.remove("show");
    });
  });
}

function handleConfigureContinue() {
  if (!AppState.allPersonalitiesSelected()) {
    document.getElementById("personality-validation").classList.add("show");
    return;
  }
  AppState.goToStep(AppState.STEPS.SUMMARY);
}

function handleSaveConfiguration() {
  if (!AppState.allPersonalitiesSelected()) {
    document.getElementById("personality-validation").classList.add("show");
    return;
  }
  const btn = document.getElementById("btn-save-config");
  const original = btn.textContent;
  btn.textContent = "Saved ✓";
  setTimeout(() => (btn.textContent = original), 1400);
}

/* ============================== Screen 3: Summary ============================== */

function renderSummary() {
  const scenario = AppState.getSelectedScenario();
  if (!scenario) return;

  const grid = document.getElementById("summary-grid");
  grid.innerHTML = scenario.agents.map((agent) => {
    const personalityId = AppState.getPersonality(agent.id);
    const personality = PERSONALITIES.find((p) => p.id === personalityId);
    return `
      <div class="summary-card">
        <div class="summary-card-top">
          <div class="agent-name">${agent.name}</div>
          <span class="personality-tag">${personality ? personality.label : "—"}</span>
        </div>
        <div class="summary-line"><strong>Role</strong><span>${agent.role}</span></div>
        <div class="summary-line"><strong>Goal</strong><span>${agent.goal}</span></div>
        <div class="summary-line"><strong>Constraint</strong><span>${agent.constraint}</span></div>
      </div>
    `;
  }).join("");
}

/* ============================== Wiring / init ============================== */

function render() {
  const { currentStep } = AppState.getState();
  renderScenarioGrid();
  if (currentStep === AppState.STEPS.CONFIGURE) renderAgentGrid();
  if (currentStep === AppState.STEPS.SUMMARY) renderSummary();
  showScreen(currentStep);
}

function init() {
  AppState.onChange(render);

  document.getElementById("btn-scenario-continue").addEventListener("click", handleScenarioContinue);

  document.getElementById("btn-configure-back").addEventListener("click", () => AppState.goToStep(AppState.STEPS.SCENARIO));
  document.getElementById("btn-configure-continue").addEventListener("click", handleConfigureContinue);
  document.getElementById("btn-save-config").addEventListener("click", handleSaveConfiguration);

  document.getElementById("btn-summary-back").addEventListener("click", () => AppState.goToStep(AppState.STEPS.CONFIGURE));
  document.getElementById("btn-summary-continue").addEventListener("click", () => AppState.goToStep(AppState.STEPS.READY));

  document.getElementById("btn-ready-back").addEventListener("click", () => AppState.goToStep(AppState.STEPS.SUMMARY));
  document.getElementById("btn-ready-restart").addEventListener("click", () => AppState.reset());

  render();
}

document.addEventListener("DOMContentLoaded", init);
