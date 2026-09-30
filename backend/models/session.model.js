/**
 * models/session.model.js
 * Mongoose schema for persisted negotiation sessions.
 *
 * Each document represents one completed negotiation — saved automatically
 * when the engine reaches a terminal state (agreement, rejection, max_rounds, stopped).
 *
 * Schema mirrors the in-memory session shape from negotiation.model.js but stores
 * only the fields needed for dashboard analytics, history browsing, and replay.
 */

'use strict';

const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
  id:               { type: String, required: true },
  name:             { type: String, required: true },
  role:             { type: String, default: '' },
  personality:      { type: String, default: 'collaborative' },
  agentType:        { type: String, default: 'ai' },  // 'ai' | 'human'
  goals:            { type: [String], default: [] },
  constraints:      { type: [String], default: [] },
  numericConstraint: { type: mongoose.Schema.Types.Mixed, default: null },
  initialOffer:     { type: Number, default: null },
  finalOffer:       { type: Number, default: null },
  satisfaction:     { type: Number, default: null },   // 0-100 from report
}, { _id: false });

const messageSchema = new mongoose.Schema({
  id:        { type: String },
  agentId:   { type: String },
  agentName: { type: String },
  role:      { type: String },
  message:   { type: String },
  offer:     { type: Number, default: null },
  decision:  { type: String },
  round:     { type: Number },
  timestamp: { type: String },
}, { _id: false });

const concessionRecordSchema = new mongoose.Schema({
  round:                { type: Number },
  previousOffer:        { type: Number, default: null },
  currentOffer:         { type: Number },
  concessionAmount:     { type: Number, default: 0 },
  concessionPercentage: { type: Number, default: 0 },
  direction:            { type: String },
  timestamp:            { type: String },
}, { _id: false });

const sessionSchema = new mongoose.Schema({
  // ── Identity ──
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  userId: {
    type: String,
    required: true,
    index: true,
  },

  // ── Scenario ──
  scenarioId:   { type: String, required: true },
  scenarioName: { type: String, required: true },
  scenarioDescription: { type: String, default: '' },

  // ── Configuration ──
  mode:      { type: String, default: 'simulation' },  // simulation | gemini | practice
  maxRounds: { type: Number, default: 10 },

  // ── Participants ──
  participants: { type: [participantSchema], default: [] },

  // ── Outcome ──
  outcome:      { type: String, required: true },   // agreement | rejection | max_rounds | stopped | error
  resultReason: { type: String, default: '' },
  finalOffer:   { type: Number, default: null },
  totalRounds:  { type: Number, default: 0 },

  // ── Performance ──
  performanceScore: { type: Number, default: null },   // 0-100 overall session score
  successStatus:    { type: Boolean, default: false },  // true if agreement reached

  // ── Concession Data ──
  concessionStats: {
    totalConcessions:     { type: Number, default: 0 },
    averagePercentage:    { type: Number, default: 0 },
    largestConcession:    { type: Number, default: 0 },
    averageOfferMovement: { type: Number, default: 0 },
  },
  concessionHistory: {
    type: Map,
    of: [concessionRecordSchema],
    default: {},
  },

  // ── Transcript ──
  messages: { type: [messageSchema], default: [] },

  // ── Structured History (for reporting) ──
  negotiationHistory: { type: [mongoose.Schema.Types.Mixed], default: [] },

  // ── Offers ──
  initialOffers: { type: Map, of: Number, default: {} },
  finalOffers:   { type: Map, of: Number, default: {} },

  // ── Report snapshot ──
  report: { type: mongoose.Schema.Types.Mixed, default: null },

  // ── Timestamps ──
  startedAt:   { type: Date, default: null },
  completedAt: { type: Date, default: null },
  duration:    { type: Number, default: 0 },  // seconds

}, {
  timestamps: true,  // adds createdAt and updatedAt
});

// ── Indexes for dashboard queries ──
sessionSchema.index({ userId: 1, createdAt: -1 });
sessionSchema.index({ userId: 1, scenarioId: 1 });
sessionSchema.index({ userId: 1, outcome: 1 });

module.exports = mongoose.model('Session', sessionSchema);
