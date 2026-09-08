/**
 * js/data/api.js
 * HTTP + WebSocket client for the NegoSim backend.
 * API key is NEVER accessed here — all LLM calls go through the backend.
 */

const ApiService = (function () {
  const BASE_URL = 'https://negosim-backend.onrender.com/api';
  const WS_URL = 'wss://negosim-backend.onrender.com';

  let activeWs = null;

  // ==================== HTTP Helpers ====================

  async function _post(path, body) {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(err.error?.message || `HTTP ${response.status}`);
    }
    return response.json();
  }

  async function _get(path) {
    const response = await fetch(`${BASE_URL}${path}`);
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(err.error?.message || `HTTP ${response.status}`);
    }
    return response.json();
  }

  // ==================== Scenarios ====================

  async function getScenarios() {
    return _get('/scenarios');
  }

  async function getScenarioById(scenarioId) {
    const scenarios = await getScenarios();
    const scenario = scenarios.find(s => s.id === scenarioId);
    if (!scenario) throw new Error('Scenario not found');
    return scenario;
  }

  // ==================== Negotiation ====================

  async function createNegotiation(scenarioId, personalitiesMap, options = {}) {
    const agents = Object.entries(personalitiesMap).map(([id, personality]) => ({
      id,
      personality,
      goals: window.AppState.getGoals(id),
      constraints: window.AppState.getConstraints(id),
    }));

    return _post('/negotiations', {
      scenario_id: scenarioId,
      agents,
      maximum_rounds: options.maxRounds || 10,
      mode: options.mode || 'simulation',
    });
  }

  async function startNegotiation(negotiationId) {
    return _post(`/negotiations/${negotiationId}/start`);
  }

  async function pauseNegotiation(negotiationId) {
    return _post(`/negotiations/${negotiationId}/pause`);
  }

  async function resumeNegotiation(negotiationId) {
    return _post(`/negotiations/${negotiationId}/resume`);
  }

  async function stopNegotiation(negotiationId) {
    return _post(`/negotiations/${negotiationId}/stop`);
  }

  async function resetNegotiation(negotiationId) {
    return _post(`/negotiations/${negotiationId}/reset`);
  }

  async function getNegotiation(negotiationId) {
    return _get(`/negotiations/${negotiationId}`);
  }

  async function getMessages(negotiationId) {
    return _get(`/negotiations/${negotiationId}/messages`);
  }

  async function getOutcome(negotiationId) {
    return _get(`/negotiations/${negotiationId}/outcome`);
  }

  async function checkHealth() {
    try {
      const response = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(3000) });
      return response.ok;
    } catch {
      return false;
    }
  }

  // ==================== WebSocket ====================

  function connectWebSocket(negotiationId, handlers = {}) {
    disconnectWebSocket();

    const ws = new WebSocket(`${WS_URL}?negotiationId=${negotiationId}`);
    activeWs = ws;

    ws.onopen = () => {
      console.log(`[WS] Connected: ${negotiationId}`);
      if (handlers.onOpen) handlers.onOpen();
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const { event: eventName, data } = payload;
        if (handlers.onEvent) handlers.onEvent(eventName, data);
      } catch (err) {
        console.error('[WS] Parse error:', err);
      }
    };

    ws.onclose = (event) => {
      activeWs = null;
      if (handlers.onClose) handlers.onClose(event);
    };

    ws.onerror = (err) => {
      console.error('[WS] Error:', err);
      if (handlers.onError) handlers.onError(err);
    };

    return ws;
  }

  function disconnectWebSocket() {
    if (activeWs) {
      try { activeWs.close(); } catch (_) { }
      activeWs = null;
    }
  }

  function getWebSocket() { return activeWs; }

  return {
    getScenarios,
    getScenarioById,
    createNegotiation,
    startNegotiation,
    pauseNegotiation,
    resumeNegotiation,
    stopNegotiation,
    resetNegotiation,
    getNegotiation,
    getMessages,
    getOutcome,
    checkHealth,
    connectWebSocket,
    disconnectWebSocket,
    getWebSocket,
  };
})();

window.ApiService = ApiService;
