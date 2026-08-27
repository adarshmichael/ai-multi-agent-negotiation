/**
 * js/data/api.js
 * HTTP + WebSocket client for the NegoSim backend.
 * API key is NEVER accessed here — all LLM calls go through the backend.
 */

const ApiService = (function () {
  const BASE_URL = "http://localhost:8001/api";
  const WS_URL = "ws://localhost:8001";

  // Active WebSocket connection
  let activeWs = null;
  let reconnectTimer = null;

  // ==================== HTTP Methods ====================

  async function getScenarios() {
    const response = await fetch(`${BASE_URL}/scenarios`);
    if (!response.ok) throw new Error("Failed to fetch scenarios");
    return response.json();
  }

  async function getScenarioById(scenarioId) {
    const response = await fetch(`${BASE_URL}/scenarios`);
    const scenarios = await response.json();
    const scenario = scenarios.find((s) => s.id === scenarioId);
    if (!scenario) throw new Error("Scenario not found");
    return scenario;
  }

  async function createNegotiation(scenarioId, personalitiesMap, options = {}) {
    const agents = Object.entries(personalitiesMap).map(([id, personality]) => ({
      id,
      personality,
    }));

    const body = {
      scenario_id: scenarioId,
      agents,
      maximum_rounds: options.maxRounds || 10,
      mode: options.mode || "simulation",
    };

    const response = await fetch(`${BASE_URL}/negotiations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: { message: "Unknown error" } }));
      throw new Error(err.error?.message || "Failed to create negotiation");
    }
    return response.json();
  }

  async function startNegotiation(negotiationId) {
    const response = await fetch(`${BASE_URL}/negotiations/${negotiationId}/start`, {
      method: "POST",
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: { message: "Unknown error" } }));
      throw new Error(err.error?.message || "Failed to start negotiation");
    }
    return response.json();
  }

  async function getNegotiation(negotiationId) {
    const response = await fetch(`${BASE_URL}/negotiations/${negotiationId}`);
    if (!response.ok) throw new Error("Failed to fetch negotiation");
    return response.json();
  }

  async function getMessages(negotiationId) {
    const response = await fetch(`${BASE_URL}/negotiations/${negotiationId}/messages`);
    if (!response.ok) throw new Error("Failed to fetch messages");
    return response.json();
  }

  async function stopNegotiation(negotiationId) {
    const response = await fetch(`${BASE_URL}/negotiations/${negotiationId}/stop`, {
      method: "POST",
    });
    if (!response.ok) throw new Error("Failed to stop negotiation");
    return response.json();
  }

  async function getOutcome(negotiationId) {
    const response = await fetch(`${BASE_URL}/negotiations/${negotiationId}/outcome`);
    if (!response.ok) throw new Error("Failed to fetch outcome");
    return response.json();
  }

  async function checkHealth() {
    try {
      const response = await fetch(`${BASE_URL}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  // ==================== WebSocket ====================

  /**
   * Connect to the backend WebSocket for a specific negotiation.
   * @param {string} negotiationId
   * @param {object} handlers — { onOpen, onMessage, onEvent, onClose, onError }
   * @returns {WebSocket}
   */
  function connectWebSocket(negotiationId, handlers = {}) {
    // Close any existing connection
    disconnectWebSocket();

    const wsUrl = `${WS_URL}?negotiationId=${negotiationId}`;
    const ws = new WebSocket(wsUrl);
    activeWs = ws;

    ws.onopen = () => {
      console.log(`[WS] Connected to negotiation: ${negotiationId}`);
      if (handlers.onOpen) handlers.onOpen();
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const { event: eventName, data } = payload;

        console.log(`[WS] Event: ${eventName}`, data);

        // Call generic message handler
        if (handlers.onMessage) handlers.onMessage(payload);

        // Call specific event handler if provided
        if (handlers.onEvent) handlers.onEvent(eventName, data);

      } catch (err) {
        console.error("[WS] Failed to parse message:", err);
      }
    };

    ws.onclose = (event) => {
      console.log(`[WS] Connection closed (code: ${event.code})`);
      activeWs = null;
      if (handlers.onClose) handlers.onClose(event);
    };

    ws.onerror = (err) => {
      console.error("[WS] Error:", err);
      if (handlers.onError) handlers.onError(err);
    };

    return ws;
  }

  function disconnectWebSocket() {
    if (activeWs) {
      activeWs.close();
      activeWs = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function getWebSocket() {
    return activeWs;
  }

  return {
    // HTTP
    getScenarios,
    getScenarioById,
    createNegotiation,
    startNegotiation,
    getNegotiation,
    getMessages,
    stopNegotiation,
    getOutcome,
    checkHealth,
    // WebSocket
    connectWebSocket,
    disconnectWebSocket,
    getWebSocket,
  };
})();

window.ApiService = ApiService;
