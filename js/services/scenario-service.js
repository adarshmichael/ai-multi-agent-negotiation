/**
 * js/services/scenario-service.js
 * Frontend HTTP client for custom scenario CRUD API.
 */

const ScenarioService = (function () {

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

  function _qs(extra = {}) {
    const params = new URLSearchParams({ userId: _getUserId(), ...extra });
    return '?' + params.toString();
  }

  async function _request(method, path, body) {
    const url = `${_getBaseUrl()}${path}${_qs()}`;
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json', ..._getAuth() },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const response = await fetch(url, opts);
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(err.error?.message || `HTTP ${response.status}`);
    }
    return response.json();
  }

  async function listScenarios()            { return _request('GET', '/custom-scenarios'); }
  async function createScenario(data)        { return _request('POST', '/custom-scenarios', data); }
  async function getScenario(id)             { return _request('GET', `/custom-scenarios/${id}`); }
  async function updateScenario(id, data)    { return _request('PUT', `/custom-scenarios/${id}`, data); }
  async function deleteScenario(id)          { return _request('DELETE', `/custom-scenarios/${id}`); }
  async function duplicateScenario(id)       { return _request('POST', `/custom-scenarios/${id}/duplicate`); }

  return { listScenarios, createScenario, getScenario, updateScenario, deleteScenario, duplicateScenario };
})();

window.ScenarioService = ScenarioService;
