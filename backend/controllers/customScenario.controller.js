/**
 * controllers/customScenario.controller.js
 * HTTP handlers for custom scenario CRUD.
 *
 * Endpoints:
 *   GET    /api/custom-scenarios          — list user's custom scenarios
 *   POST   /api/custom-scenarios          — create
 *   GET    /api/custom-scenarios/:id      — get one
 *   PUT    /api/custom-scenarios/:id      — update
 *   DELETE /api/custom-scenarios/:id      — delete
 *   POST   /api/custom-scenarios/:id/duplicate — duplicate
 */

'use strict';

const customScenarioService = require('../services/customScenario.service');
const logger = require('../utils/logger');

function getUserId(req) {
  if (req.user && req.user.id) return req.user.id;
  const authHeader = req.headers.authorization || '';
  if (authHeader === 'Bearer mock-token-fallback') return req.query.userId || 'demo-user';
  return req.query.userId || 'anonymous';
}

async function listCustomScenarios(req, res, next) {
  try {
    const userId = getUserId(req);
    const scenarios = await customScenarioService.getUserScenarios(userId);
    res.json({ scenarios, total: scenarios.length });
  } catch (err) {
    next(err);
  }
}

async function createCustomScenario(req, res, next) {
  try {
    const userId = getUserId(req);
    const scenario = await customScenarioService.createScenario(userId, req.body);
    logger.info('CustomScenarioController', `Created scenario for user ${userId}: ${scenario.name}`);
    res.status(201).json({ scenario });
  } catch (err) {
    next(err);
  }
}

async function getCustomScenario(req, res, next) {
  try {
    const userId = getUserId(req);
    const scenario = await customScenarioService.getScenarioById(req.params.id, userId);
    if (!scenario) {
      const err = new Error(`Custom scenario not found: ${req.params.id}`);
      err.statusCode = 404;
      return next(err);
    }
    res.json({ scenario });
  } catch (err) {
    next(err);
  }
}

async function updateCustomScenario(req, res, next) {
  try {
    const userId = getUserId(req);
    const scenario = await customScenarioService.updateScenario(req.params.id, userId, req.body);
    if (!scenario) {
      const err = new Error(`Custom scenario not found or not owned: ${req.params.id}`);
      err.statusCode = 404;
      return next(err);
    }
    res.json({ scenario });
  } catch (err) {
    next(err);
  }
}

async function deleteCustomScenario(req, res, next) {
  try {
    const userId = getUserId(req);
    const deleted = await customScenarioService.deleteScenario(req.params.id, userId);
    if (!deleted) {
      const err = new Error(`Custom scenario not found or not owned: ${req.params.id}`);
      err.statusCode = 404;
      return next(err);
    }
    res.json({ message: 'Custom scenario deleted.', id: req.params.id });
  } catch (err) {
    next(err);
  }
}

async function duplicateCustomScenario(req, res, next) {
  try {
    const userId = getUserId(req);
    const scenario = await customScenarioService.duplicateScenario(req.params.id, userId);
    if (!scenario) {
      const err = new Error(`Custom scenario not found: ${req.params.id}`);
      err.statusCode = 404;
      return next(err);
    }
    res.status(201).json({ scenario });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listCustomScenarios,
  createCustomScenario,
  getCustomScenario,
  updateCustomScenario,
  deleteCustomScenario,
  duplicateCustomScenario,
};
