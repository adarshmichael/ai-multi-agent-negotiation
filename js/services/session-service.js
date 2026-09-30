/**
 * js/services/session-service.js
 * Frontend HTTP client for session persistence and dashboard APIs.
 *
 * Follows the same IIFE-on-window pattern as ApiService.
 * Reuses ApiService's internal HTTP helpers and backend URL resolution.
 */

const SessionService = (function () {

  function _getBaseUrl() {
    const info = window.ApiService.getBackendInfo();
    return info.baseUrl;
  }

  function _getUserId() {
    try {
      const user = JSON.parse(localStorage.getItem('negosim_user') || '{}');
      return user.id || user.email || 'anonymous';
    } catch {
      return 'anonymous';
    }
  }

  async function _get(path) {
    const url = `${_getBaseUrl()}${path}`;
    const sep = url.includes('?') ? '&' : '?';
    const response = await fetch(`${url}${sep}userId=${encodeURIComponent(_getUserId())}`);
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(err.error?.message || `HTTP ${response.status}`);
    }
    return response.json();
  }

  async function _delete(path) {
    const url = `${_getBaseUrl()}${path}?userId=${encodeURIComponent(_getUserId())}`;
    const response = await fetch(url, { method: 'DELETE' });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(err.error?.message || `HTTP ${response.status}`);
    }
    return response.json();
  }

  // ==================== Sessions ====================

  /**
   * Get paginated session list with optional filters.
   * @param {object} filters - { scenarioId, outcome, mode, sort, search, page, limit }
   */
  async function getSessions(filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, val]) => {
      if (val != null && val !== '') params.set(key, val);
    });
    const qs = params.toString();
    return _get(`/sessions${qs ? '?' + qs : ''}`);
  }

  /**
   * Get full session detail by sessionId.
   */
  async function getSession(sessionId) {
    return _get(`/sessions/${sessionId}`);
  }

  /**
   * Delete a session by sessionId.
   */
  async function deleteSession(sessionId) {
    return _delete(`/sessions/${sessionId}`);
  }

  // ==================== Dashboard ====================

  /**
   * Get aggregated dashboard data.
   */
  async function getDashboard() {
    return _get('/dashboard');
  }

  return {
    getSessions,
    getSession,
    deleteSession,
    getDashboard,
  };
})();

window.SessionService = SessionService;
