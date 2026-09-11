/**
 * js/data/api.js
 * HTTP + WebSocket client for the NegoSim backend.
 * API key is NEVER accessed here — all LLM calls go through the backend.
 */

const ApiService = (function () {
  const RENDER_HOST = 'negosim-backend.onrender.com';

  const hostname = window.location.hostname || 'localhost';
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  const isRenderHost = hostname.includes('onrender.com');

  // Allow switching via ?backend=local or ?backend=render, or localStorage
  const urlParams = typeof window !== 'undefined' && window.location ? new URLSearchParams(window.location.search) : null;
  const forced = urlParams ? urlParams.get('backend') : null;
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('negosim_backend') : null;
  const useLocal = (forced === 'local' || saved === 'local') && isLocal;

  let backendHost;
  let protocol;
  let wsProtocol;

  if (useLocal) {
    // Explicit local server on port 8001
    backendHost = `${hostname === '127.0.0.1' ? '127.0.0.1' : 'localhost'}:8001`;
    protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  } else if (isRenderHost) {
    // Hosted directly on the Render backend
    backendHost = window.location.host;
    protocol = 'https:';
    wsProtocol = 'wss:';
  } else {
    // Running on GitHub Pages (*.github.io), VS Code Live Server, or other static hosts:
    // Route all API and WebSocket requests to the live Render cloud backend!
    backendHost = RENDER_HOST;
    protocol = 'https:';
    wsProtocol = 'wss:';
  }

  const BASE_URL = `${protocol}//${backendHost}/api`;
  const WS_URL = `${wsProtocol}//${backendHost}`;

  console.log(`[ApiService] Connected to Backend: ${BASE_URL} (WS: ${WS_URL})`);

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
    try {
      return await _get('/scenarios');
    } catch (err) {
      console.warn('[ApiService] Backend /scenarios call failed, using fallback data:', err);
      if (typeof window !== 'undefined' && Array.isArray(window.SCENARIOS) && window.SCENARIOS.length > 0) {
        return window.SCENARIOS;
      }
      throw err;
    }
  }

  async function getScenarioById(scenarioId) {
    try {
      const scenarios = await getScenarios();
      const scenario = scenarios.find(s => s.id === scenarioId);
      if (scenario) return scenario;
    } catch (_) { }

    if (typeof window !== 'undefined' && Array.isArray(window.SCENARIOS)) {
      const fallback = window.SCENARIOS.find(s => s.id === scenarioId);
      if (fallback) return fallback;
    }
    throw new Error('Scenario not found');
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

  function setBackend(target) {
    if (target === 'local') {
      localStorage.setItem('negosim_backend', 'local');
    } else {
      localStorage.setItem('negosim_backend', 'render');
    }
    window.location.reload();
  }

  function getBackendInfo() {
    return { baseUrl: BASE_URL, wsUrl: WS_URL, isLocal, useLocal };
  }

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
    setBackend,
    getBackendInfo,
  };
})();

window.ApiService = ApiService;
