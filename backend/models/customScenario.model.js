/**
 * models/customScenario.model.js
 * Mongoose schema for user-created custom negotiation scenarios.
 *
 * These are stored per-user and injected into the scenario list alongside
 * the three pre-built templates. The agentDef shape mirrors the in-memory
 * SCENARIOS array in negotiation.service.js so the engine treats them identically.
 */

'use strict';

const mongoose = require('mongoose');

const numericConstraintSchema = new mongoose.Schema({
  type:  { type: String, enum: ['min', 'max'], required: true },
  value: { type: Number, required: true },
}, { _id: false });

const customAgentDefSchema = new mongoose.Schema({
  id:          { type: String, required: true },
  name:        { type: String, required: true, trim: true },
  role:        { type: String, required: true, trim: true },
  goal:        { type: String, required: true, trim: true },
  goals:       { type: [String], default: [] },
  constraints: { type: [String], default: [] },
  personality: {
    type:    String,
    enum:    ['aggressive', 'collaborative', 'risk-averse', 'competitive', 'flexible', 'analytical', 'professional'],
    default: 'collaborative',
  },
  numericConstraint: { type: numericConstraintSchema, default: null },
  agentType:         { type: String, default: 'ai' },
  // Mirror the goalOptions / constraintOptions shape so the config wizard works
  goalOptions:       { type: [String], default: [] },
  constraintOptions: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { _id: false });

const customScenarioSchema = new mongoose.Schema({
  userId:      { type: String, required: true, index: true },
  name:        { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, default: '', maxlength: 500 },
  icon:        { type: String, default: 'goal' },
  maxRounds:   { type: Number, default: 10, min: 1, max: 50 },
  agents:      { type: [customAgentDefSchema], required: true },
  isCustom:    { type: Boolean, default: true },
}, {
  timestamps: true,
});

customScenarioSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('CustomScenario', customScenarioSchema);
