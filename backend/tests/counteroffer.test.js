/**
 * tests/counteroffer.test.js
 * Test suite for Module 3 — Counteroffer Generation Engine.
 *
 * Tests:
 *   1. Favorable offer          — opponent already favorable, small concession
 *   2. Moderate offer           — standard mid-range COUNTER scenario
 *   3. Aggressive / unacceptable — far from target, output must be within limits
 *   4. Multiple rounds          — urgency grows, concessions increase
 *   5. Boundary values          — offer exactly at min / max limits
 *   6. Constraint violations    — proposed value clamped when it would breach limits
 */

'use strict';

const assert                            = require('assert');
const { generateCounteroffer, roundTo } = require('../services/counteroffer.service');

// ─── Console header ────────────────────────────────────────────────────────────
console.log('====================================================');
console.log('Running Test Suite: Module 3 — Counteroffer Generation');
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

// ─── Shared agent configs ─────────────────────────────────────────────────────

const vendorAgent = {
  id:                 'vendor',
  name:               'VendorCo',
  role:               'Seller / Vendor',
  agentType:          'seller',
  personality:        'collaborative',
  targetValue:        100000,
  minAcceptableValue: 85000,
  maxAcceptableValue: null,
  numericConstraint:  { type: 'min', value: 85000 },
  goals:              ['Maximize revenue'],
  constraints:        ['Minimum price ₹85,000'],
  currentOffer:       null,
  initialOffer:       null,
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
  goals:              ['Minimize cost'],
  constraints:        ['Budget ceiling ₹90,000'],
  currentOffer:       null,
  initialOffer:       null,
};

// Helper: clone an agent with overrides
function agent(base, overrides = {}) {
  return Object.assign({}, base, overrides);
}

// Helper: print a compact result summary
function summary(r) {
  return JSON.stringify({
    proposed:         r.proposed_offer.price,
    target:           r.target,
    opponent_offer:   r.opponent_offer,
    distance:         r.distance_from_target,
    concession:       r.concession_amount,
    urgency:          r.urgency_factor,
    constraint:       r.constraint_status,
    is_stalling:      r.is_stalling,
  }, null, 2);
}

// ─── TEST 1: Favorable offer ───────────────────────────────────────────────────
console.log('\n--- Test 1: Favorable offer ---');
test('1.1 Vendor: buyer offers above target — generates a small-concession counter', () => {
  const r = generateCounteroffer({
    agent:         agent(vendorAgent, { currentOffer: 110000 }),
    opponentOffer: 102000,   // above vendor's target 100k — very good
    currentRound:  2,
    maxRounds:     10,
  });
  console.log('    Result:', summary(r));

  assert.strictEqual(r.decision, 'COUNTER');
  assert.ok(r.proposed_offer.price >= vendorAgent.minAcceptableValue, 'Must be >= min (85k)');
  // Vendor should move DOWN slightly toward the buyer
  // previous offer was 110k; proposed should be between 100k and 110k
  assert.ok(r.proposed_offer.price <= 110000, 'Counter must be <= previous offer (110k)');
  assert.ok(r.proposed_offer.price >= vendorAgent.targetValue, 'Counter should be at or above target (100k) when buyer is already there');
  assert.strictEqual(r.constraint_status, 'WITHIN_LIMIT');
});

test('1.2 Buyer: vendor offers below target — generates a small-concession counter', () => {
  const r = generateCounteroffer({
    agent:         agent(buyerAgent, { currentOffer: 70000 }),
    opponentOffer: 78000,   // below buyer's target 80k — very good
    currentRound:  2,
    maxRounds:     10,
  });
  console.log('    Result:', summary(r));

  assert.strictEqual(r.decision, 'COUNTER');
  assert.ok(r.proposed_offer.price <= buyerAgent.maxAcceptableValue, 'Must be <= max (90k)');
  // Buyer should move UP slightly toward the vendor
  assert.ok(r.proposed_offer.price >= 70000, 'Counter must be >= previous offer (70k)');
  assert.strictEqual(r.constraint_status, 'WITHIN_LIMIT');
});

// ─── TEST 2: Moderate offer ───────────────────────────────────────────────────
console.log('\n--- Test 2: Moderate offer ---');
test('2.1 Vendor: buyer offers between min and target — standard counter', () => {
  const r = generateCounteroffer({
    agent:         agent(vendorAgent, { currentOffer: 115000 }),
    opponentOffer: 88000,   // between min (85k) and target (100k)
    currentRound:  3,
    maxRounds:     10,
  });
  console.log('    Result:', summary(r));

  assert.strictEqual(r.decision, 'COUNTER');
  assert.ok(r.proposed_offer.price >= vendorAgent.minAcceptableValue,
    `Proposed ${r.proposed_offer.price} must be >= min (85k)`);
  assert.ok(r.proposed_offer.price < 115000, 'Vendor should have moved down from 115k');
  assert.strictEqual(r.constraint_status, 'WITHIN_LIMIT');
  assert.ok(r.reason.length > 0, 'Must provide a reason string');
});

test('2.2 Buyer: vendor offers between target and max — standard counter', () => {
  const r = generateCounteroffer({
    agent:         agent(buyerAgent, { currentOffer: 68000 }),
    opponentOffer: 86000,   // between target (80k) and max (90k)
    currentRound:  3,
    maxRounds:     10,
  });
  console.log('    Result:', summary(r));

  assert.strictEqual(r.decision, 'COUNTER');
  assert.ok(r.proposed_offer.price <= buyerAgent.maxAcceptableValue,
    `Proposed ${r.proposed_offer.price} must be <= max (90k)`);
  assert.ok(r.proposed_offer.price > 68000, 'Buyer should have moved up from 68k');
  assert.strictEqual(r.constraint_status, 'WITHIN_LIMIT');
});

// ─── TEST 3: Aggressive / unacceptable offer ──────────────────────────────────
console.log('\n--- Test 3: Aggressive / unacceptable offer ---');
test('3.1 Vendor: buyer offers far below minimum (aggressive) — counter stays inside limits', () => {
  const r = generateCounteroffer({
    agent:         agent(vendorAgent, { currentOffer: 130000 }),
    opponentOffer: 70000,   // below min 85k
    currentRound:  2,
    maxRounds:     10,
  });
  console.log('    Result:', summary(r));

  assert.strictEqual(r.decision, 'COUNTER');
  assert.ok(r.proposed_offer.price >= vendorAgent.minAcceptableValue,
    `Proposed ${r.proposed_offer.price} must NOT violate floor (85k)`);
  // Should NOT jump all the way to 70k+
  assert.ok(r.proposed_offer.price > 85000, 'Should stay well above floor on early round');
});

test('3.2 Buyer: vendor offers far above maximum (aggressive) — counter stays inside limits', () => {
  const r = generateCounteroffer({
    agent:         agent(buyerAgent, { currentOffer: 55000 }),
    opponentOffer: 110000,  // above max 90k
    currentRound:  2,
    maxRounds:     10,
  });
  console.log('    Result:', summary(r));

  assert.strictEqual(r.decision, 'COUNTER');
  assert.ok(r.proposed_offer.price <= buyerAgent.maxAcceptableValue,
    `Proposed ${r.proposed_offer.price} must NOT violate ceiling (90k)`);
});

// ─── TEST 4: Multiple rounds — urgency increases ──────────────────────────────
console.log('\n--- Test 4: Multiple rounds ---');
test('4. Concession grows across rounds (round 2 < round 6 < round 9)', () => {
  const makeRound = (round, prevOffer) => generateCounteroffer({
    agent:         agent(vendorAgent, { currentOffer: prevOffer }),
    opponentOffer: 87000,
    currentRound:  round,
    maxRounds:     10,
  });

  const r2 = makeRound(2, 120000);
  const r6 = makeRound(6, 115000);
  const r9 = makeRound(9, 110000);

  console.log('    Round 2 proposed:', r2.proposed_offer.price,
              '| Round 6 proposed:', r6.proposed_offer.price,
              '| Round 9 proposed:', r9.proposed_offer.price);

  // Urgency grows: r9 should have moved further down than r6 which moved further than r2
  assert.ok(r9.urgency_factor > r6.urgency_factor, 'Urgency must grow with round');
  assert.ok(r9.proposed_offer.price <= r6.proposed_offer.price,
    'Later round must counter more aggressively (lower price for seller)');
  assert.ok(r6.proposed_offer.price <= r2.proposed_offer.price,
    'Round 6 must be lower than round 2');

  // All must stay within limits
  [r2, r6, r9].forEach(r => {
    assert.ok(r.proposed_offer.price >= vendorAgent.minAcceptableValue,
      `Round ${r.urgency_factor.toFixed(2)}: proposed ${r.proposed_offer.price} must be >= 85k`);
  });
});

// ─── TEST 5: Boundary values ──────────────────────────────────────────────────
console.log('\n--- Test 5: Boundary values ---');
test('5.1 Vendor: opponent offers exactly at minAcceptableValue (85k)', () => {
  const r = generateCounteroffer({
    agent:         agent(vendorAgent, { currentOffer: 105000 }),
    opponentOffer: 85000,   // exactly at floor
    currentRound:  4,
    maxRounds:     10,
  });
  console.log('    Result:', summary(r));

  assert.ok(r.proposed_offer.price >= vendorAgent.minAcceptableValue,
    `Proposed ${r.proposed_offer.price} must be >= 85k`);
  assert.strictEqual(r.decision, 'COUNTER');
});

test('5.2 Buyer: opponent offers exactly at maxAcceptableValue (90k)', () => {
  const r = generateCounteroffer({
    agent:         agent(buyerAgent, { currentOffer: 72000 }),
    opponentOffer: 90000,   // exactly at ceiling
    currentRound:  4,
    maxRounds:     10,
  });
  console.log('    Result:', summary(r));

  assert.ok(r.proposed_offer.price <= buyerAgent.maxAcceptableValue,
    `Proposed ${r.proposed_offer.price} must be <= 90k`);
  assert.strictEqual(r.decision, 'COUNTER');
});

// ─── TEST 6: Constraint violations caught and clamped ─────────────────────────
console.log('\n--- Test 6: Constraint violations ---');
test('6.1 Vendor: raw math would go below 85k floor — must be clamped', () => {
  // Force a situation where raw math goes low by using a very low last offer
  // and aggressive opponent price
  const a = agent(vendorAgent, {
    currentOffer: 86000,    // already very close to floor
    personality:  'flexible',  // high concession rate
  });

  const r = generateCounteroffer({
    agent:        a,
    opponentOffer: 72000,  // far below floor, should drag raw offer toward floor
    currentRound: 9,        // high urgency
    maxRounds:    10,
  });
  console.log('    Result:', summary(r));

  // Critical: must NEVER violate the floor
  assert.ok(r.proposed_offer.price >= vendorAgent.minAcceptableValue,
    `CONSTRAINT VIOLATED: proposed ${r.proposed_offer.price} is below floor 85k`);
  assert.strictEqual(r.constraint_status, 'CLAMPED',
    'Status must be CLAMPED when raw math breaches the floor');
});

test('6.2 Buyer: raw math would exceed 90k ceiling — must be clamped', () => {
  const a = agent(buyerAgent, {
    currentOffer: 89000,    // already very close to ceiling
    personality:  'flexible',  // high concession rate
  });

  const r = generateCounteroffer({
    agent:        a,
    opponentOffer: 110000,  // far above ceiling, should drag raw offer toward ceiling
    currentRound: 9,
    maxRounds:    10,
  });
  console.log('    Result:', summary(r));

  // Critical: must NEVER violate the ceiling
  assert.ok(r.proposed_offer.price <= buyerAgent.maxAcceptableValue,
    `CONSTRAINT VIOLATED: proposed ${r.proposed_offer.price} exceeds ceiling 90k`);
  assert.strictEqual(r.constraint_status, 'CLAMPED',
    'Status must be CLAMPED when raw math breaches the ceiling');
});

test('6.3 roundTo() helper rounds to nearest 500', () => {
  assert.strictEqual(roundTo(87250), 87500);
  assert.strictEqual(roundTo(87499), 87500);
  assert.strictEqual(roundTo(87501), 87500);
  assert.strictEqual(roundTo(87749), 87500);
  assert.strictEqual(roundTo(87750), 88000);
  assert.strictEqual(roundTo(90000), 90000);
  assert.strictEqual(roundTo(85000), 85000);
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
