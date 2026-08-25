/**
 * Centralized application state.
 * Any module can read from this; only the functions below should write to it.
 */

const AppState = (function () {
  const STEPS = {
    SCENARIO: "scenario",
    CONFIGURE: "configure",
    SUMMARY: "summary",
    READY: "ready",
  };

  let state = {
    currentStep: STEPS.SCENARIO,
    selectedScenarioId: null,
    // personalities keyed by agentId, scoped per scenario so switching
    // scenarios doesn't leak selections between agents.
    personalities: {},
  };

  const listeners = [];

  function onChange(fn) {
    listeners.push(fn);
  }

  function notify() {
    listeners.forEach((fn) => fn(state));
  }

  function getState() {
    return state;
  }

  function getSelectedScenario() {
    if (!state.selectedScenarioId) return null;
    return SCENARIOS.find((s) => s.id === state.selectedScenarioId) || null;
  }

  function selectScenario(scenarioId) {
    state.selectedScenarioId = scenarioId;
    state.personalities = {};
    notify();
  }

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
    return scenario.agents.every((agent) => !!state.personalities[agent.id]);
  }

  function goToStep(step) {
    state.currentStep = step;
    notify();
  }

  function reset() {
    state = {
      currentStep: STEPS.SCENARIO,
      selectedScenarioId: null,
      personalities: {},
    };
    notify();
  }

  return {
    STEPS,
    onChange,
    getState,
    getSelectedScenario,
    selectScenario,
    setPersonality,
    getPersonality,
    allPersonalitiesSelected,
    goToStep,
    reset,
  };
})();

window.AppState = AppState;
