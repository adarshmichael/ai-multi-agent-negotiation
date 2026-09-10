/**
 * tests/offerEvaluation.test.js
 * Test suite for Module 1 — Deterministic Offer Evaluation Engine.
 *
 * Validates:
 *   1. Very favorable offer (FAVORABLE, WITHIN_LIMIT, ACCEPT)
 *   2. Partially acceptable offer (PARTIALLY_ACCEPTABLE, WITHIN_LIMIT, COUNTER)
 *   3. Unacceptable offer (UNACCEPTABLE, VIOLATED, constraint failure)
 */

const assert = require('assert');
const { evaluateOffer } = require('../services/offerEvaluation.service');

console.log('====================================================');
console.log('Running Test Suite: Module 1 — Offer Evaluation');
console.log('====================================================\n');

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ FAIL: ${name}`);
    console.error(`  ${err.message}\n`);
    throw err;
  }
}

// -------------------------------------------------------------
// Test Agents
// -------------------------------------------------------------

const vendorAgent = {
  id: 'vendor',
  name: 'Vendor',
  role: 'Seller / Vendor',
  agentType: 'seller',
  targetValue: 90000,
  minAcceptableValue: 80000,
  numericConstraint: { type: 'min', value: 80000 },
  goals: ['Maximize profit', 'Secure contract'],
  constraints: ['Minimum acceptable price of ₹80,000'],
  personality: 'collaborative',
  currentOffer: 95000,
};

const buyerAgent = {
  id: 'buyer',
  name: 'Buyer',
  role: 'Customer / Buyer',
  agentType: 'buyer',
  targetValue: 700000,
  maxAcceptableValue: 800000,
  numericConstraint: { type: 'max', value: 800000 },
  goals: ['Get the best possible price', 'Stay within procurement budget'],
  constraints: ['Budget limit ₹800,000'],
  personality: 'collaborative',
  currentOffer: 650000,
};

// -------------------------------------------------------------
// Test 1: Very Favorable Offer
// -------------------------------------------------------------
test('1.1 Very favorable offer for Seller (Buyer offers above target)', () => {
  const result = evaluateOffer({
    agent: vendorAgent,
    opponentOffer: 95000, // Above target 90,000
    currentRound: 2,
    maxRounds: 10,
  });

  console.log('    Result:', JSON.stringify({
    evaluation: result.evaluation,
    opponent_offer: result.opponent_offer,
    distance_from_target: result.distance_from_target,
    constraint_status: result.constraint_status,
    recommendation: result.recommendation,
  }));

  assert.strictEqual(result.evaluation, 'FAVORABLE');
  assert.strictEqual(result.constraint_status, 'WITHIN_LIMIT');
  assert.strictEqual(result.recommendation, 'ACCEPT');
  assert.strictEqual(result.distance_from_target, 5000); // 95k - 90k = +5000
  assert.ok(result.reason.includes('exceeds target') || result.reason.includes('target value'));
});

test('1.2 Very favorable offer for Buyer (Vendor offers below target)', () => {
  const result = evaluateOffer({
    agent: buyerAgent,
    opponentOffer: 680000, // Below target 700,000 (cost savings!)
    currentRound: 2,
    maxRounds: 10,
  });

  console.log('    Result:', JSON.stringify({
    evaluation: result.evaluation,
    opponent_offer: result.opponent_offer,
    distance_from_target: result.distance_from_target,
    constraint_status: result.constraint_status,
    recommendation: result.recommendation,
  }));

  assert.strictEqual(result.evaluation, 'FAVORABLE');
  assert.strictEqual(result.constraint_status, 'WITHIN_LIMIT');
  assert.strictEqual(result.recommendation, 'ACCEPT');
  assert.strictEqual(result.distance_from_target, 20000); // 700k - 680k = +20000
  assert.ok(result.reason.includes('below target') || result.reason.includes('target value'));
});

// -------------------------------------------------------------
// Test 2: Partially Acceptable Offer
// -------------------------------------------------------------
test('2.1 Partially acceptable offer for Seller (Negotiable, within limits)', () => {
  const result = evaluateOffer({
    agent: vendorAgent,
    opponentOffer: 85000, // Below target (90,000) but above min (80,000)
    currentRound: 2,
    maxRounds: 10,
  });

  console.log('    Result:', JSON.stringify({
    evaluation: result.evaluation,
    opponent_offer: result.opponent_offer,
    distance_from_target: result.distance_from_target,
    constraint_status: result.constraint_status,
    recommendation: result.recommendation,
  }));

  assert.strictEqual(result.evaluation, 'PARTIALLY_ACCEPTABLE');
  assert.strictEqual(result.constraint_status, 'WITHIN_LIMIT');
  assert.strictEqual(result.recommendation, 'COUNTER');
  assert.strictEqual(result.distance_from_target, -5000); // 85k - 90k = -5000
  assert.ok(result.reason.includes('below the agent\'s target'));
});

test('2.2 Partially acceptable offer for Buyer (Above target but within budget)', () => {
  const result = evaluateOffer({
    agent: buyerAgent,
    opponentOffer: 750000, // Above target (700,000) but within budget (800,000)
    currentRound: 2,
    maxRounds: 10,
  });

  console.log('    Result:', JSON.stringify({
    evaluation: result.evaluation,
    opponent_offer: result.opponent_offer,
    distance_from_target: result.distance_from_target,
    constraint_status: result.constraint_status,
    recommendation: result.recommendation,
  }));

  assert.strictEqual(result.evaluation, 'PARTIALLY_ACCEPTABLE');
  assert.strictEqual(result.constraint_status, 'WITHIN_LIMIT');
  assert.strictEqual(result.recommendation, 'COUNTER');
  assert.strictEqual(result.distance_from_target, -50000); // 700k - 750k = -50000
  assert.ok(result.reason.includes('above the agent\'s target'));
});

// -------------------------------------------------------------
// Test 3: Unacceptable Offer (Constraint Violation)
// -------------------------------------------------------------
test('3.1 Unacceptable offer for Seller (Violates minimum price constraint)', () => {
  const result = evaluateOffer({
    agent: vendorAgent,
    opponentOffer: 75000, // Below minimum acceptable price 80,000
    currentRound: 3,
    maxRounds: 10,
  });

  console.log('    Result:', JSON.stringify({
    evaluation: result.evaluation,
    opponent_offer: result.opponent_offer,
    distance_from_target: result.distance_from_target,
    constraint_status: result.constraint_status,
    recommendation: result.recommendation,
  }));

  assert.strictEqual(result.evaluation, 'UNACCEPTABLE');
  assert.strictEqual(result.constraint_status, 'VIOLATED');
  assert.ok(result.reason.includes('below minimum acceptable price'));
});

test('3.2 Unacceptable offer for Buyer (Violates maximum budget constraint)', () => {
  const result = evaluateOffer({
    agent: buyerAgent,
    opponentOffer: 850000, // Exceeds maximum budget limit 800,000
    currentRound: 3,
    maxRounds: 10,
  });

  console.log('    Result:', JSON.stringify({
    evaluation: result.evaluation,
    opponent_offer: result.opponent_offer,
    distance_from_target: result.distance_from_target,
    constraint_status: result.constraint_status,
    recommendation: result.recommendation,
  }));

  assert.strictEqual(result.evaluation, 'UNACCEPTABLE');
  assert.strictEqual(result.constraint_status, 'VIOLATED');
  assert.ok(result.reason.includes('exceeds maximum budget limit'));
});

// -------------------------------------------------------------
// Test 4: Verification of Distinct Deterministic Results
// -------------------------------------------------------------
test('4. Evaluator produces distinct deterministic results across categories', () => {
  const fav = evaluateOffer({ agent: vendorAgent, opponentOffer: 92000, currentRound: 1, maxRounds: 10 });
  const part = evaluateOffer({ agent: vendorAgent, opponentOffer: 85000, currentRound: 1, maxRounds: 10 });
  const unacc = evaluateOffer({ agent: vendorAgent, opponentOffer: 70000, currentRound: 1, maxRounds: 10 });

  assert.notStrictEqual(fav.evaluation, part.evaluation);
  assert.notStrictEqual(part.evaluation, unacc.evaluation);
  assert.notStrictEqual(fav.evaluation, unacc.evaluation);

  assert.strictEqual(fav.evaluation, 'FAVORABLE');
  assert.strictEqual(part.evaluation, 'PARTIALLY_ACCEPTABLE');
  assert.strictEqual(unacc.evaluation, 'UNACCEPTABLE');
});

console.log(`\n====================================================`);
console.log(`Test Results: ${passed}/${total} tests passed successfully.`);
console.log(`====================================================\n`);
