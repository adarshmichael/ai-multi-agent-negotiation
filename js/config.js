/**
 * js/config.js
 * Central API configuration for NegoSim.
 *
 * IMPORTANT: Never put secrets here. This file is public.
 * All LLM calls and sensitive operations go through the backend.
 */

const NegoSimConfig = (() => {
  'use strict';

  const hostname = window.location.hostname || 'localhost';
  const isLocal  = hostname === 'localhost' || hostname === '127.0.0.1';

  // ── PRODUCTION: set this to your deployed Render/Railway URL ──
  // Example: 'https://negosim-backend.onrender.com'
  const PRODUCTION_API_URL = 'https://negosim-backend.onrender.com';

  const API_BASE = isLocal
    ? `http://${hostname}:8001/api`
    : `${PRODUCTION_API_URL}/api`;

  // Used by ApiService for WebSocket connections
  const WS_BASE = isLocal
    ? `ws://${hostname}:8001`
    : PRODUCTION_API_URL.replace(/^https/, 'wss').replace(/^http/, 'ws');

  return { API_BASE, WS_BASE, PRODUCTION_API_URL, isLocal };
})();

// Expose globally
window.NegoSimConfig = NegoSimConfig;
