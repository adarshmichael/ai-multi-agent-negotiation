/**
 * Simulated API service for fetching scenario and agent data.
 * Ready to be replaced by actual fetch/axios calls to a real backend.
 */

const ApiService = (function () {
  const DELAY_MS = 600; // Simulated network delay

  function simulateNetwork() {
    return new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }

  async function getScenarios() {
    await simulateNetwork();
    // SCENARIOS is loaded globally from scenarios.js in this prototype
    if (!window.SCENARIOS) throw new Error("Scenarios data missing");
    return window.SCENARIOS;
  }

  async function getScenarioById(scenarioId) {
    await simulateNetwork();
    if (!window.SCENARIOS) throw new Error("Scenarios data missing");
    const scenario = window.SCENARIOS.find((s) => s.id === scenarioId);
    if (!scenario) throw new Error("Scenario not found");
    return scenario;
  }

  return {
    getScenarios,
    getScenarioById,
  };
})();

window.ApiService = ApiService;
