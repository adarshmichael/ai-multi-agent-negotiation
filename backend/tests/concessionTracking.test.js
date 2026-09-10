/**
 * tests/concessionTracking.test.js
 * Test suite for Module 4 — Concession Tracking Engine.
 *
 * Simulates a 5-round negotiation between a buyer and a seller,
 * verifying concession snapshots, totals, percentages, and safeguard flags.
 *
 * Rounds:
 *   R1 — Initial position (no concession yet)
 *   R2 — Controlled movement (both agents concede moderately)
 *   R3 — Further movement (totals accumulate correctly)
 *   R4 — Reversal attempt → REVERSAL flag expected + position held
 *   R5 — Excessive concession attempt → EXCESSIVE flag + offer capped
 */

'use strict';

const assert = require('assert');
const {
  trackConcession,
  getConcessionSnapshot,
  validateConcession,
  getAgentFlexibility,
  DIRECTION,
} = require('../services/concession.service');

// ─── Console header ────────────────────────────────────────────────────────────
console.log('====================================================');
console.log('Running Test Suite: Module 4 — Concession Tracking');
console.log('====================================================\n');

let passed = 0;
let total  = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ FAIL: ${name}`);
    console.error(`  ${err.message}\n`);
  }
}

// ─── Mock session builder ─────────────────────────────────────────────────────

function makeSession(agents) {
  return {
    currentRound:     1,
    agents,
    offers:           {},
    initialOffers:    {},
    concessionHistory: {},
  };
}

// ─── Agent configs ────────────────────────────────────────────────────────────

const vendorAgent = {
  id:                 'vendor',
  name:               'VendorCo',
  role:               'Seller / Vendor',
  agentType:          'seller',
  personality:        'collaborative',  // maxSingleRoundPct = 18%
  targetValue:        100000,
  minAcceptableValue: 85000,
  maxAcceptableValue: null,
  numericConstraint:  { type: 'min', value: 85000 },
};

const buyerAgent = {
  id:                 'buyer',
  name:               'BuyerCo',
  role:               'Customer / Buyer',
  agentType:          'buyer',
  personality:        'collaborative',
  targetValue:        80000,
  minAcceptableValue: null,
  maxAcceptableValue: 90000,
  numericConstraint:  { type: 'max', value: 90000 },
};

// Helper: advance round
function advanceRound(session, round) {
  session.currentRound = round;
}

// Helper: make an offer and track it (simulates NegotiationEngine turn)
function makeOffer(session, agentConfig, offerPrice) {
  trackConcession(session, agentConfig.id, offerPrice);
  if (!session.initialOffers[agentConfig.id]) {
    session.initialOffers[agentConfig.id] = offerPrice;
  }
  session.offers[agentConfig.id] = offerPrice;
}

// ─── SIMULATION SETUP ─────────────────────────────────────────────────────────

const session = makeSession([vendorAgent, buyerAgent]);

// =====================================================================
// ROUND 1 — Initial position
// =====================================================================
console.log('\n─── Round 1: Initial Position ───');
advanceRound(session, 1);

// Vendor opens at ₹120,000; Buyer opens at ₹65,000
makeOffer(session, vendorAgent, 120000);
makeOffer(session, buyerAgent,  65000);

const snapV_R1 = getConcessionSnapshot(session, vendorAgent.id, vendorAgent);
const snapB_R1 = getConcessionSnapshot(session, buyerAgent.id,  buyerAgent);

test('R1.1 Vendor: initial_position is set correctly', () => {
  assert.strictEqual(snapV_R1.initial_position, 120000, 'Vendor initial should be 120k');
  assert.strictEqual(snapV_R1.current_offer,    120000, 'Current = initial on round 1');
  assert.strictEqual(snapV_R1.previous_offer,   null,   'No previous on first offer');
});

test('R1.2 Vendor: total_concession = 0 on first offer', () => {
  assert.strictEqual(snapV_R1.total_concession,      0, 'No concession yet');
  assert.strictEqual(snapV_R1.concession_percentage, 0, 'No % yet');
  assert.strictEqual(snapV_R1.concessions_count,     0, 'No concession rounds yet');
});

test('R1.3 Buyer: initial_position = 65k', () => {
  assert.strictEqual(snapB_R1.initial_position, 65000);
  assert.strictEqual(snapB_R1.total_concession, 0);
});

test('R1.4 Flexibility is correctly computed (Vendor: 120k − 85k = 35k remaining)', () => {
  const flex = getAgentFlexibility(vendorAgent, 120000, 120000);
  assert.strictEqual(flex.flexibility,        35000, 'Remaining = 120k − 85k');
  assert.strictEqual(flex.initialFlexibility, 35000, 'Initial flexibility = 35k');
  assert.strictEqual(flex.pctConsumed,        0,     '0% consumed on round 1');
});

test('R1.5 Flexibility is correctly computed (Buyer: 90k − 65k = 25k remaining)', () => {
  const flex = getAgentFlexibility(buyerAgent, 65000, 65000);
  assert.strictEqual(flex.flexibility,        25000);
  assert.strictEqual(flex.initialFlexibility, 25000);
  assert.strictEqual(flex.pctConsumed,        0);
});

// =====================================================================
// ROUND 2 — Controlled movement
// =====================================================================
console.log('\n─── Round 2: Controlled Movement ───');
advanceRound(session, 2);

// Vendor moves DOWN from 120k → 113k (₹7,000 concession)
// Buyer  moves UP   from 65k  → 71k  (₹6,000 concession)
makeOffer(session, vendorAgent, 113000);
makeOffer(session, buyerAgent,  71000);

const snapV_R2 = getConcessionSnapshot(session, vendorAgent.id, vendorAgent);
const snapB_R2 = getConcessionSnapshot(session, buyerAgent.id,  buyerAgent);

test('R2.1 Vendor: this-round concession = ₹7,000', () => {
  assert.strictEqual(snapV_R2.concession_amount, 7000);
});

test('R2.2 Vendor: total_concession = ₹7,000 (from initial 120k)', () => {
  assert.strictEqual(snapV_R2.total_concession,      7000);
  assert.strictEqual(snapV_R2.concession_percentage, parseFloat(((7000/120000)*100).toFixed(2)));
});

test('R2.3 Vendor: previous_offer = 120k (round 1), current = 113k (round 2)', () => {
  assert.strictEqual(snapV_R2.previous_offer, 120000);
  assert.strictEqual(snapV_R2.current_offer,  113000);
});

test('R2.4 Vendor: is_progressing = true (moved DOWN as seller should)', () => {
  assert.ok(snapV_R2.is_progressing, 'Seller moving down is correct direction');
});

test('R2.5 Buyer: this-round = ₹6,000, total = ₹6,000, prev = 65k', () => {
  assert.strictEqual(snapB_R2.concession_amount, 6000);
  assert.strictEqual(snapB_R2.total_concession,  6000);
  assert.strictEqual(snapB_R2.previous_offer,    65000);
  assert.strictEqual(snapB_R2.current_offer,     71000);
});

test('R2.6 Buyer flexibility consumed: 6k of 25k = 24%', () => {
  const flex = getAgentFlexibility(buyerAgent, 71000, 65000);
  assert.strictEqual(flex.flexibility,        19000);
  assert.strictEqual(flex.initialFlexibility, 25000);
  assert.ok(flex.pctConsumed > 23 && flex.pctConsumed < 25, `Expected ~24%, got ${flex.pctConsumed}%`);
});

// =====================================================================
// ROUND 3 — Further movement, totals accumulate
// =====================================================================
console.log('\n─── Round 3: Further Movement ───');
advanceRound(session, 3);

// Vendor 113k → 107k (₹6,000 more); Buyer 71k → 76k (₹5,000 more)
makeOffer(session, vendorAgent, 107000);
makeOffer(session, buyerAgent,  76000);

const snapV_R3 = getConcessionSnapshot(session, vendorAgent.id, vendorAgent);
const snapB_R3 = getConcessionSnapshot(session, buyerAgent.id,  buyerAgent);

test('R3.1 Vendor: cumulative total_concession = ₹13,000 (120k → 107k)', () => {
  assert.strictEqual(snapV_R3.total_concession, 13000, `Expected 13k, got ${snapV_R3.total_concession}`);
});

test('R3.2 Vendor: concessions_count = 2 (rounds 2 and 3)', () => {
  assert.strictEqual(snapV_R3.concessions_count, 2);
});

test('R3.3 Buyer: cumulative total = ₹11,000 (65k → 76k)', () => {
  assert.strictEqual(snapB_R3.total_concession, 11000);
  assert.strictEqual(snapB_R3.concessions_count, 2);
});

test('R3.4 Vendor: within_limit = true (107k > 85k floor)', () => {
  assert.ok(snapV_R3.within_limit);
  assert.ok(snapV_R3.remaining_flexibility !== null);
  assert.strictEqual(snapV_R3.remaining_flexibility, 107000 - 85000); // 22k
});

// =====================================================================
// ROUND 4 — Reversal attempt
// =====================================================================
console.log('\n─── Round 4: Reversal Attempt ───');
advanceRound(session, 4);

// Seller tries to go BACK UP from 107k → 115k (wrong direction!)
const reversalResult = validateConcession(session, vendorAgent.id, 115000, vendorAgent);

test('R4.1 Reversal detected: REVERSAL flag fires', () => {
  assert.ok(reversalResult.flags.includes('REVERSAL'),
    `Expected REVERSAL flag, got: ${JSON.stringify(reversalResult.flags)}`
  );
});

test('R4.2 Reversal: position held at previous offer (107k)', () => {
  assert.strictEqual(reversalResult.clampedOffer, 107000,
    `Expected clamped to 107k, got ${reversalResult.clampedOffer}`
  );
});

test('R4.3 Reversal: valid = false', () => {
  assert.strictEqual(reversalResult.valid, false);
});

test('R4.4 Reversal: reason string mentions REVERSAL', () => {
  assert.ok(reversalResult.reason.includes('REVERSAL'), `Reason was: ${reversalResult.reason}`);
});

// Make a valid round 4 move instead
makeOffer(session, vendorAgent, 101500);  // legitimate concession
makeOffer(session, buyerAgent,  80500);

const snapV_R4 = getConcessionSnapshot(session, vendorAgent.id, vendorAgent);
test('R4.5 After legitimate R4 move, total_concession = ₹18,500 (120k → 101.5k)', () => {
  assert.strictEqual(snapV_R4.total_concession, 18500);
  assert.strictEqual(snapV_R4.concessions_count, 3);
});

// =====================================================================
// ROUND 5 — Excessive concession attempt
// =====================================================================
console.log('\n─── Round 5: Excessive Concession Attempt ───');
advanceRound(session, 5);

// Buyer tries to move from 80.5k → 90k in one shot (11.8% of 80.5k > 18% cap — wait this IS within 18%)
// Let's make it clearly excessive: buyer tries 80.5k → 65k (a reversal, not excessive)
// Actually, let's use vendor: 101.5k → 75k — that's a 26% move, > 18% cap
const excessiveResult = validateConcession(session, vendorAgent.id, 75000, vendorAgent);

test('R5.1 Excessive concession: LIMIT_BREACH fires (75k < floor 85k)', () => {
  // 75k violates the floor first
  assert.ok(
    excessiveResult.flags.includes('LIMIT_BREACH') || excessiveResult.flags.includes('EXCESSIVE'),
    `Expected LIMIT_BREACH or EXCESSIVE, got: ${JSON.stringify(excessiveResult.flags)}`
  );
});

test('R5.2 Clamped offer is >= min (85k) — constraint always respected', () => {
  assert.ok(
    excessiveResult.clampedOffer >= vendorAgent.minAcceptableValue,
    `Clamped offer ${excessiveResult.clampedOffer} must be >= 85k`
  );
});

// Buyer tries huge jump: 80.5k → 70k (a reversal for buyer) — should be caught
const buyerReversalResult = validateConcession(session, buyerAgent.id, 70000, buyerAgent);
test('R5.3 Buyer reversal caught: 80.5k → 70k triggers REVERSAL', () => {
  assert.ok(buyerReversalResult.flags.includes('REVERSAL'),
    `Expected REVERSAL, got: ${JSON.stringify(buyerReversalResult.flags)}`
  );
  // Buyer should be held at their previous (80.5k)
  assert.strictEqual(buyerReversalResult.clampedOffer, 80500);
});

// Buyer legitimate final offer 80.5k → 89k (10.5% of 80.5k < 18% cap — allowed)
const legit = validateConcession(session, buyerAgent.id, 89000, buyerAgent);
test('R5.4 Legitimate final buyer move (80.5k → 89k, 10.5% < 18% cap): no flags', () => {
  assert.ok(!legit.flags.includes('REVERSAL') && !legit.flags.includes('EXCESSIVE'),
    `Unexpected flags: ${JSON.stringify(legit.flags)}`
  );
  assert.strictEqual(legit.clampedOffer, 89000);
  assert.ok(legit.valid);
});

makeOffer(session, buyerAgent, 89000);
const snapB_R5 = getConcessionSnapshot(session, buyerAgent.id, buyerAgent);

test('R5.5 Buyer final snapshot: total movement = ₹24,000 (65k → 89k)', () => {
  assert.strictEqual(snapB_R5.total_concession, 24000,
    `Expected 24k, got ${snapB_R5.total_concession}`
  );
  assert.ok(snapB_R5.within_limit, 'Buyer within budget limit');
  assert.strictEqual(snapB_R5.remaining_flexibility, 90000 - 89000, 'Only ₹1,000 flexibility left');
});

test('R5.6 Buyer: flexibility_consumed_pct is high (~96%)', () => {
  assert.ok(snapB_R5.flexibility_consumed_pct >= 90,
    `Expected >= 90%, got ${snapB_R5.flexibility_consumed_pct}%`
  );
});

// ─── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n====================================================`);
console.log(`Test Results: ${passed}/${total} tests passed successfully.`);
if (passed < total) {
  console.log(`FAILED: ${total - passed} test(s) failed.`);
  process.exit(1);
} else {
  console.log(`All tests passed!`);
}
console.log(`====================================================\n`);
