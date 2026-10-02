/**
 * js/services/coach-service.js
 * Frontend HTTP client for the AI Coach API.
 * Follows the same IIFE-on-window pattern as SessionService.
 */

const CoachService = (function () {

  function _getBaseUrl() {
    return window.ApiService.getBackendInfo().baseUrl;
  }

  function _getAuth() {
    const token = localStorage.getItem('negosim_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  function _getUserId() {
    try {
      const user = JSON.parse(localStorage.getItem('negosim_user') || '{}');
      return user.id || user.email || 'anonymous';
    } catch { return 'anonymous'; }
  }

  async function _post(path, body) {
    const url = `${_getBaseUrl()}${path}?userId=${encodeURIComponent(_getUserId())}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ..._getAuth() },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(err.error?.message || `HTTP ${response.status}`);
    }
    return response.json();
  }

  async function _get(path) {
    const url = `${_getBaseUrl()}${path}`;
    const sep = url.includes('?') ? '&' : '?';
    const response = await fetch(`${url}${sep}userId=${encodeURIComponent(_getUserId())}`, {
      headers: _getAuth(),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(err.error?.message || `HTTP ${response.status}`);
    }
    return response.json();
  }

  /**
   * Generate (or fetch existing) coaching report for a session.
   */
  async function generateCoaching(sessionId) {
    return _post(`/sessions/${sessionId}/coaching`);
  }

  /**
   * Get existing coaching report.
   */
  async function getCoaching(sessionId) {
    return _get(`/sessions/${sessionId}/coaching`);
  }

  /**
   * List all coaching reports for the current user (score trend).
   */
  async function listCoaching() {
    return _get('/coaching');
  }

  /**
   * Get a hint during a live Practice Mode negotiation.
   * @param {string} negotiationId — live negotiation ID
   */
  async function getHint(negotiationId) {
    return _post(`/negotiations/${negotiationId}/hint`);
  }

  return { generateCoaching, getCoaching, listCoaching, getHint };
})();

window.CoachService = CoachService;
