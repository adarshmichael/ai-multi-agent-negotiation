/**
 * js/state/appState.js
 * Centralized application state.
 * Any module can read from this; only the functions below should write to it.
 */

const AppState = (function () {
  const STEPS = {
    SCENARIO:  'scenario',
    CONFIGURE: 'configure',
    SUMMARY:   'summary',
    READY:     'ready',
    NEGOTIATE: 'negotiate',
  };

  let state = {
    currentStep:        STEPS.SCENARIO,
    selectedScenarioId: null,

    // Per-agent configuration — keyed by agentId
    personalities:  {},   // { [agentId]: personalityId }
    agentGoals:     {},   // { [agentId]: string[] }
    agentConstraints: {}, // { [agentId]: { selected: string[], numericMax: number|null, numericMin: number|null } }
    agentConfigTab:  {},  // { [agentId]: 'goals' | 'constraints' | 'personality' }

    // Scenario data
    scenarios:  [],
    isLoading:  false,
    error:      null,

    // Negotiation runtime state
    negotiationId:      null,
    negotiationStatus:  'idle',  // idle | starting | in_progress | completed | failed | stopped
    messages:           [],
    currentRound:       0,
    maxRounds:          10,
    offers:             {},      // { agentId: latestOffer }
    initialOffers:      {},      // { agentId: firstOffer }
    negotiationResult:  null,    // agreement | rejection | max_rounds | stopped
    negotiationReason:  null,
    finalOffer:         null,
    negotiationSummary: null,
  };

  const listeners = [];

  function onChange(fn) { listeners.push(fn); }
  function notify()     { listeners.forEach(fn => fn(state)); }
  function getState()   { return state; }

  function getSelectedScenario() {
    if (!state.selectedScenarioId) return null;
    return state.scenarios.find(s => s.id === state.selectedScenarioId) || null;
  }

  // ==================== Scenarios ====================

  async function loadScenarios() {
    state.isLoading = true;
    state.error     = null;
    notify();
    try {
      state.scenarios = await window.ApiService.getScenarios();
    } catch (err) {
      state.error = 'Unable to load scenarios. Please try again.';
    } finally {
      state.isLoading = false;
      notify();
    }
  }

  async function selectScenario(scenarioId) {
    state.selectedScenarioId = scenarioId;
    state.personalities      = {};
    state.agentGoals         = {};
    state.agentConstraints   = {};
    state.agentConfigTab     = {};
    state.isLoading          = true;
    state.error              = null;
    notify();
    try {
      const scenario = await window.ApiService.getScenarioById(scenarioId);
      const index    = state.scenarios.findIndex(s => s.id === scenarioId);
      if (index !== -1) state.scenarios[index] = scenario;
      else              state.scenarios.push(scenario);
    } catch (err) {
      state.error = 'Unable to load agent configuration. Please try again.';
    } finally {
      state.isLoading = false;
      notify();
    }
  }

  // ==================== Personality ====================

  function setPersonality(agentId, personalityId) {
    state.personalities = { ...state.personalities, [agentId]: personalityId };
    notify();
  }

  function getPersonality(agentId) {
    return state.personalities[agentId] || null;
  }

  function allPersonalitiesSelected() {
    const scenario = getSelectedScenario();
    if (!scenario) return false;
    return scenario.agents.every(agent => !!state.personalities[agent.id]);
  }

  // ==================== Goals ====================

  function setGoals(agentId, goals) {
    state.agentGoals = { ...state.agentGoals, [agentId]: goals };
    notify();
  }

  function getGoals(agentId) {
    return state.agentGoals[agentId] || [];
  }

  function allGoalsConfigured() {
    const scenario = getSelectedScenario();
    if (!scenario) return false;
    return scenario.agents.every(agent => {
      const goals = state.agentGoals[agent.id];
      return goals && goals.length > 0;
    });
  }

  // ==================== Constraints ====================

  function setConstraints(agentId, constraints) {
    // constraints: { selected: string[], numericMax: number|null, numericMin: number|null }
    state.agentConstraints = { ...state.agentConstraints, [agentId]: constraints };
    notify();
  }

  function getConstraints(agentId) {
    return state.agentConstraints[agentId] || { selected: [], numericMax: null, numericMin: null };
  }

  function allConstraintsConfigured() {
    const scenario = getSelectedScenario();
    if (!scenario) return false;
    return scenario.agents.every(agent => {
      const c = state.agentConstraints[agent.id];
      return c && c.selected && c.selected.length > 0;
    });
  }

  // ==================== Config Tab ====================

  function setAgentConfigTab(agentId, tab) {
    state.agentConfigTab = { ...state.agentConfigTab, [agentId]: tab };
    notify();
  }

  function getAgentConfigTab(agentId) {
    return state.agentConfigTab[agentId] || 'goals';
  }

  // ==================== Full validation ====================

  /** Returns true only when goals + constraints + personality are all done for all agents. */
  function allAgentsFullyConfigured() {
    return allGoalsConfigured() && allConstraintsConfigured() && allPersonalitiesSelected();
  }

  // ==================== Navigation ====================

  function goToStep(step) {
    state.currentStep = step;
    notify();
  }

  // ==================== Negotiation ====================

  function setNegotiationState(updates) {
    Object.assign(state, updates);
    notify();
  }

  function addMessage(message) {
    state.messages = [...state.messages, message];
    notify();
  }

  function resetNegotiation() {
    state.negotiationId      = null;
    state.negotiationStatus  = 'idle';
    state.messages           = [];
    state.currentRound       = 0;
    state.maxRounds          = 10;
    state.offers             = {};
    state.initialOffers      = {};
    state.negotiationResult  = null;
    state.negotiationReason  = null;
    state.finalOffer         = null;
    state.negotiationSummary = null;
    notify();
  }

  function reset() {
    state = {
      ...state,
      currentStep:         STEPS.SCENARIO,
      selectedScenarioId:  null,
      personalities:       {},
      agentGoals:          {},
      agentConstraints:    {},
      agentConfigTab:      {},
      error:               null,
    };
    notify();
  }

  return {
    STEPS,
    onChange,
    getState,
    getSelectedScenario,
    // Scenarios
    loadScenarios,
    selectScenario,
    // Personality
    setPersonality,
    getPersonality,
    allPersonalitiesSelected,
    // Goals
    setGoals,
    getGoals,
    allGoalsConfigured,
    // Constraints
    setConstraints,
    getConstraints,
    allConstraintsConfigured,
    // Config tab
    setAgentConfigTab,
    getAgentConfigTab,
    // Validation
    allAgentsFullyConfigured,
    // Navigation
    goToStep,
    // Negotiation
    setNegotiationState,
    addMessage,
    resetNegotiation,
    reset,
  };
})();

window.AppState = AppState;
