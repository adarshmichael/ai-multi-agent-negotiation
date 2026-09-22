/**
 * js/data/api.js
 * HTTP + WebSocket client for the NegoSim backend.
 * API key is NEVER accessed here — all LLM calls go through the backend.
 */

const ApiService = (function () {
  const RENDER_HOST = 'negosim-backend.onrender.com';

  const hostname = window.location.hostname || 'localhost';
  const port     = window.location.port;
  const isLocal  = hostname === 'localhost' || hostname === '127.0.0.1';
  const isRenderHost = hostname.includes('onrender.com');

  // Allow switching via ?backend=local or ?backend=render, or localStorage
  const urlParams = typeof window !== 'undefined' && window.location ? new URLSearchParams(window.location.search) : null;
  const forced = urlParams ? urlParams.get('backend') : null;
  const saved  = typeof localStorage !== 'undefined' ? localStorage.getItem('negosim_backend') : null;

  // When served directly from localhost:8001, the backend is this same host
  const isServedFromBackend = isLocal && port === '8001';
  const useLocal = isServedFromBackend || (forced === 'local' || saved === 'local');

  let backendHost;
  let protocol;
  let wsProtocol;

  if (useLocal || isLocal) {
    // Local backend on port 8001 (either served from it, or explicitly requested)
    backendHost = `${hostname === '127.0.0.1' ? '127.0.0.1' : 'localhost'}:8001`;
    protocol    = 'http:';
    wsProtocol  = 'ws:';
  } else if (isRenderHost) {
    // Hosted directly on the Render backend
    backendHost = window.location.host;
    protocol    = 'https:';
    wsProtocol  = 'wss:';
  } else {
    // Running on GitHub Pages (*.github.io) or other static hosts:
    // Route to the live Render cloud backend
    backendHost = RENDER_HOST;
    protocol    = 'https:';
    wsProtocol  = 'wss:';
  }

  const BASE_URL = `${protocol}//${backendHost}/api`;
  const WS_URL   = `${wsProtocol}//${backendHost}`;

  const _backendMode = isServedFromBackend ? '🟢 LOCAL (port 8001)'
    : useLocal ? '🟡 LOCAL (forced)'
    : isRenderHost ? '🔵 RENDER (same host)'
    : '🌐 RENDER (cloud)';
  console.log(`[ApiService] Backend: ${_backendMode}  →  ${BASE_URL}`);

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
      practice_mode: options.practiceMode || false,
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

  async function getReport(negotiationId) {
    return _get(`/negotiations/${negotiationId}/report`);
  }

  /** Returns the full URL for transcript download (used with window.open or <a href>) */
  function getTranscriptUrl(negotiationId, format = 'txt') {
    return `${BASE_URL}/negotiations/${negotiationId}/transcript?format=${format}`;
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

  /**
   * Send a human participant's turn over the active WebSocket.
   * Used by Practice Mode human input panel.
   * @param {object} turnData — { message, offer, decision, reason }
   */
  function sendHumanTurn(turnData) {
    if (!activeWs || activeWs.readyState !== 1) {
      console.warn('[ApiService] sendHumanTurn: No active WebSocket connection.');
      return;
    }
    activeWs.send(JSON.stringify({ event: 'human_input', data: turnData }));
    console.log('[ApiService] Human turn sent:', turnData);
  }

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
    getReport,
    getTranscriptUrl,
    checkHealth,
    connectWebSocket,
    disconnectWebSocket,
    getWebSocket,
    sendHumanTurn,
    setBackend,
    getBackendInfo,
  };
})();

window.ApiService = ApiService;
