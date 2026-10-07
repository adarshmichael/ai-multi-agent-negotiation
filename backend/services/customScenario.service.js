/**
 * services/customScenario.service.js
 * CRUD for user-created custom scenarios.
 * Custom scenarios are converted to the same shape as built-in SCENARIOS
 * so the engine treats them identically.
 */

'use strict';

const CustomScenario = require('../models/customScenario.model');
const logger = require('../utils/logger');
const mongoose = require('mongoose');

function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

const VALID_PERSONALITIES = ['aggressive', 'collaborative', 'risk-averse', 'competitive', 'flexible', 'analytical', 'professional'];

/**
 * Validate a scenario creation/update payload.
 * Returns { valid: true } or { valid: false, errors: [...] }
 */
function validate(data) {
  const errors = [];

  if (!data.name || !data.name.trim()) errors.push('name is required');
  if (data.name && data.name.length > 100) errors.push('name must be at most 100 characters');

  if (!Array.isArray(data.agents) || data.agents.length < 2 || data.agents.length > 4) {
    errors.push('agents must be an array of 2-4 agents');
  } else {
    data.agents.forEach((a, i) => {
      if (!a.name || !a.name.trim()) errors.push(`agents[${i}].name is required`);
      if (!a.role || !a.role.trim()) errors.push(`agents[${i}].role is required`);
      if (!a.goal || !a.goal.trim()) errors.push(`agents[${i}].goal is required`);
      if (a.personality && !VALID_PERSONALITIES.includes(a.personality)) {
        errors.push(`agents[${i}].personality must be one of: ${VALID_PERSONALITIES.join(', ')}`);
      }
      if (a.numericConstraint) {
        const nc = a.numericConstraint;
        if (!['min', 'max'].includes(nc.type)) errors.push(`agents[${i}].numericConstraint.type must be min or max`);
        if (typeof nc.value !== 'number' || nc.value < 0) errors.push(`agents[${i}].numericConstraint.value must be a non-negative number`);
      }
    });
    // Enforce min <= max between agents if applicable
    const agentsWithMin = data.agents.filter(a => a.numericConstraint?.type === 'min');
    const agentsWithMax = data.agents.filter(a => a.numericConstraint?.type === 'max');
    if (agentsWithMin.length > 0 && agentsWithMax.length > 0) {
      const minVal = Math.max(...agentsWithMin.map(a => a.numericConstraint.value));
      const maxVal = Math.min(...agentsWithMax.map(a => a.numericConstraint.value));
      if (minVal > maxVal) {
        errors.push('Agent minimum constraint must not exceed the maximum constraint of any other agent');
      }
    }
  }

  if (data.maxRounds !== undefined) {
    const r = Number(data.maxRounds);
    if (isNaN(r) || r < 1 || r > 50) errors.push('maxRounds must be between 1 and 50');
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

/**
 * Convert a CustomScenario doc to the exact shape used by the built-in SCENARIOS array.
 * This ensures the engine, createSession(), and the frontend wizard see no difference.
 */
function toScenarioShape(doc) {
  return {
    id: doc._id.toString(),
    name: doc.name,
    description: doc.description || '',
    icon: doc.icon || 'goal',
    maxRounds: doc.maxRounds || 10,
    isCustom: true,
    userId: doc.userId,
    agents: (doc.agents || []).map(a => ({
      id: a.id,
      name: a.name,
      role: a.role,
      goal: a.goal,
      goals: (a.goals && a.goals.length > 0) ? a.goals : [a.goal],
      constraints: a.constraints || [],
      personality: a.personality || 'collaborative',
      numericConstraint: a.numericConstraint || null,
      agentType: a.agentType || 'ai',
      goalOptions: (a.goalOptions && a.goalOptions.length > 0) ? a.goalOptions : [a.goal],
      constraintOptions: a.constraintOptions || [],
    })),
  };
}

async function createScenario(userId, data) {
  const validation = validate(data);
  if (!validation.valid) throw Object.assign(new Error(validation.errors.join('; ')), { statusCode: 400 });

  const agents = (data.agents || []).map((a, i) => ({
    id: a.id || `agent-${i}-${Date.now()}`,
    name: a.name.trim(),
    role: a.role.trim(),
    goal: a.goal.trim(),
    goals: [a.goal.trim()],
    constraints: Array.isArray(a.constraints) ? a.constraints : [],
    personality: a.personality || 'collaborative',
    numericConstraint: a.numericConstraint || null,
    agentType: 'ai',
    goalOptions: [a.goal.trim()],
    constraintOptions: a.numericConstraint ? [{
      id: `nc-${i}`,
      label: a.numericConstraint.type === 'min' ? 'Minimum Acceptable Value' : 'Maximum Budget',
      hasNumeric: true,
      numericLabel: a.numericConstraint.type === 'min' ? 'Minimum (₹)' : 'Maximum (₹)',
      numericType: a.numericConstraint.type,
      defaultValue: a.numericConstraint.value,
    }] : [],
  }));

  const doc = await CustomScenario.create({
    userId,
    name: data.name.trim(),
    description: (data.description || '').trim(),
    icon: data.icon || 'goal',
    maxRounds: Number(data.maxRounds) || 10,
    agents,
  });

  logger.info('CustomScenarioService', `Created scenario "${doc.name}" for user ${userId}`);
  return toScenarioShape(doc);
}

async function getUserScenarios(userId) {
  if (!isDbConnected()) return [];
  const docs = await CustomScenario.find({ userId }).sort({ createdAt: -1 }).lean();
  return docs.map(toScenarioShape);
}

async function getScenarioById(scenarioId, userId) {
  if (!isDbConnected()) return null;
  const doc = await CustomScenario.findOne({ _id: scenarioId, userId }).lean();
  if (!doc) return null;
  return toScenarioShape(doc);
}

async function updateScenario(scenarioId, userId, data) {
  const validation = validate(data);
  if (!validation.valid) throw Object.assign(new Error(validation.errors.join('; ')), { statusCode: 400 });

  const agents = (data.agents || []).map((a, i) => ({
    id: a.id || `agent-${i}-${Date.now()}`,
    name: a.name.trim(),
    role: a.role.trim(),
    goal: a.goal.trim(),
    goals: [a.goal.trim()],
    constraints: Array.isArray(a.constraints) ? a.constraints : [],
    personality: a.personality || 'collaborative',
    numericConstraint: a.numericConstraint || null,
    agentType: 'ai',
    goalOptions: [a.goal.trim()],
    constraintOptions: a.numericConstraint ? [{
      id: `nc-${i}`,
      label: a.numericConstraint.type === 'min' ? 'Minimum Acceptable Value' : 'Maximum Budget',
      hasNumeric: true,
      numericLabel: a.numericConstraint.type === 'min' ? 'Minimum (₹)' : 'Maximum (₹)',
      numericType: a.numericConstraint.type,
      defaultValue: a.numericConstraint.value,
    }] : [],
  }));

  const doc = await CustomScenario.findOneAndUpdate(
    { _id: scenarioId, userId },
    { name: data.name.trim(), description: (data.description || '').trim(), icon: data.icon || 'goal', maxRounds: Number(data.maxRounds) || 10, agents },
    { new: true, lean: true }
  );
  if (!doc) return null;
  logger.info('CustomScenarioService', `Updated scenario ${scenarioId}`);
  return toScenarioShape(doc);
}

async function deleteScenario(scenarioId, userId) {
  const result = await CustomScenario.deleteOne({ _id: scenarioId, userId });
  return result.deletedCount > 0;
}

async function duplicateScenario(scenarioId, userId) {
  const doc = await CustomScenario.findOne({ _id: scenarioId, userId }).lean();
  if (!doc) return null;
  const newDoc = await CustomScenario.create({
    userId,
    name: `${doc.name} (Copy)`,
    description: doc.description,
    icon: doc.icon,
    maxRounds: doc.maxRounds,
    agents: doc.agents,
  });
  return toScenarioShape(newDoc);
}

module.exports = {
  createScenario,
  getUserScenarios,
  getScenarioById,
  updateScenario,
  deleteScenario,
  duplicateScenario,
  toScenarioShape,
};
