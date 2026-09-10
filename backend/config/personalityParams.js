/**
 * config/personalityParams.js
 * Shared personality parameters used by both decisionProvider and counteroffer service.
 * Extracted to a standalone module to eliminate the circular dependency between them.
 *
 * Each personality defines:
 *   initialFactor:    how far from the constraint limit to open an offer
 *     max-buyer:  starts at X * maxBudget  (X < 1 = low initial offer)
 *     min-seller: starts at Y * minPrice   (Y > 1 = high initial offer)
 *   concessionRate:   base fraction of remaining gap conceded per round
 *   acceptanceBuffer: buyer accepts if sellerOffer <= max * buf  (buf < 1)
 *   acceptanceFloor:  seller accepts if buyerOffer >= min * flr  (flr > 1)
 */

'use strict';

const PERSONALITY_PARAMS = {
  aggressive: {
    initialFactor:    { max: 0.58, min: 1.42 },
    concessionRate:   0.06,
    acceptanceBuffer: 0.98,
    acceptanceFloor:  1.02,
    maxSingleRoundPct: 0.08,   // Module 4: max 8% of prev offer per round
  },
  collaborative: {
    initialFactor:    { max: 0.72, min: 1.28 },
    concessionRate:   0.14,
    acceptanceBuffer: 0.93,
    acceptanceFloor:  1.07,
    maxSingleRoundPct: 0.18,   // 18%
  },
  'risk-averse': {
    initialFactor:    { max: 0.67, min: 1.33 },
    concessionRate:   0.10,
    acceptanceBuffer: 0.95,
    acceptanceFloor:  1.05,
    maxSingleRoundPct: 0.12,   // 12%
  },
  competitive: {
    initialFactor:    { max: 0.60, min: 1.40 },
    concessionRate:   0.07,
    acceptanceBuffer: 0.97,
    acceptanceFloor:  1.03,
    maxSingleRoundPct: 0.08,   // 8%
  },
  flexible: {
    initialFactor:    { max: 0.70, min: 1.30 },
    concessionRate:   0.16,
    acceptanceBuffer: 0.91,
    acceptanceFloor:  1.09,
    maxSingleRoundPct: 0.22,   // 22%
  },
  analytical: {
    initialFactor:    { max: 0.65, min: 1.35 },
    concessionRate:   0.09,
    acceptanceBuffer: 0.94,
    acceptanceFloor:  1.06,
    maxSingleRoundPct: 0.10,   // 10%
  },
  professional: {
    initialFactor:    { max: 0.68, min: 1.32 },
    concessionRate:   0.11,
    acceptanceBuffer: 0.95,
    acceptanceFloor:  1.05,
    maxSingleRoundPct: 0.12,   // 12%
  },
};

const DEFAULT_PARAMS = PERSONALITY_PARAMS['collaborative'];

module.exports = { PERSONALITY_PARAMS, DEFAULT_PARAMS };
