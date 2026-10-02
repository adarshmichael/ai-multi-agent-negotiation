/**
 * models/coachingReport.model.js
 * Mongoose schema for AI coaching reports generated after Practice Mode sessions.
 */

'use strict';

const mongoose = require('mongoose');

const mistakeSchema = new mongoose.Schema({
  turn:        { type: Number },
  description: { type: String },
}, { _id: false });

const coachingReportSchema = new mongoose.Schema({
  userId:    { type: String, required: true, index: true },
  sessionId: { type: String, required: true, index: true },

  // Scores and summary
  overallScore:       { type: Number, default: null },  // 0-100
  strengths:          { type: [String], default: [] },
  mistakes:           { type: [mistakeSchema], default: [] },
  missedOpportunities:{ type: [String], default: [] },
  actionableTips:     { type: [String], default: [] },

  // Raw LLM output (for debugging/fallback)
  rawLlmOutput:       { type: String, default: '' },
  generationStatus:   { type: String, enum: ['success', 'fallback', 'error'], default: 'success' },
}, {
  timestamps: true,
});

coachingReportSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('CoachingReport', coachingReportSchema);
