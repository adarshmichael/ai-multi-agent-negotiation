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
    scenarios: [],
    isLoading: false,
    error: null,
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
    return state.scenarios.find((s) => s.id === state.selectedScenarioId) || null;
  }

  async function loadScenarios() {
    state.isLoading = true;
    state.error = null;
    notify();

    try {
      state.scenarios = await window.ApiService.getScenarios();
    } catch (err) {
      state.error = "Unable to load scenarios. Please try again.";
    } finally {
      state.isLoading = false;
      notify();
    }
  }

  async function selectScenario(scenarioId) {
    state.selectedScenarioId = scenarioId;
    state.personalities = {};
    state.isLoading = true;
    state.error = null;
    notify();

    try {
      // Simulate fetching details for the selected scenario
      const scenario = await window.ApiService.getScenarioById(scenarioId);
      // Ensure the selected scenario is updated in the state in case it has more details
      const index = state.scenarios.findIndex((s) => s.id === scenarioId);
      if (index !== -1) {
        state.scenarios[index] = scenario;
      } else {
        state.scenarios.push(scenario);
      }
    } catch (err) {
      state.error = "Unable to load agent configuration. Please try again.";
    } finally {
      state.isLoading = false;
      notify();
    }
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
      ...state,
      currentStep: STEPS.SCENARIO,
      selectedScenarioId: null,
      personalities: {},
      error: null,
    };
    notify();
  }

  return {
    loadScenarios,
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
