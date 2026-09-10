/**
 * tests/integrationEngine.test.js
 * End-to-end verification of NegotiationEngine generating Offer Evaluations.
 */

const { createSession, getSession } = require('../services/negotiation.service');
const { run } = require('../engine/NegotiationEngine');
const assert = require('assert');

async function testEngineWithEvaluation() {
  console.log('Testing full NegotiationEngine with deterministic Offer Evaluation...');

  const created = createSession({
    scenario_id: 'vendor-pricing',
    agents: [
      { id: 'buyer', personality: 'collaborative', targetValue: 700000 },
      { id: 'vendor', personality: 'collaborative', targetValue: 800000 },
    ],
    maximum_rounds: 4,
    mode: 'simulation',
  });

  const session = getSession(created.id);
  assert.ok(session, 'Session must exist in memory store');

  // Run engine
  await run(session);

  console.log(`\nNegotiation finished with status: ${session.status}, total messages: ${session.messages.length}`);

  // Check that messages after the initial opening offer contain evaluations
  const messagesWithEvaluation = session.messages.filter(m => m.evaluation !== null);
  console.log(`Messages with evaluation: ${messagesWithEvaluation.length}/${session.messages.length}`);

  assert.ok(messagesWithEvaluation.length > 0, 'Expected at least one message with evaluation');

  messagesWithEvaluation.forEach((m, idx) => {
    console.log(`\nTurn ${idx + 1} (${m.agentName}):`);
    console.log(`  Opponent Offer: ₹${m.evaluation.opponent_offer.price}`);
    console.log(`  Target: ₹${m.evaluation.target_value}`);
    console.log(`  Distance: ${m.evaluation.distance_from_target >= 0 ? '+' : ''}₹${m.evaluation.distance_from_target}`);
    console.log(`  Constraint: ${m.evaluation.constraint_status}`);
    console.log(`  Evaluation: ${m.evaluation.evaluation}`);
    console.log(`  Recommendation: ${m.evaluation.recommendation}`);
    console.log(`  Reason: ${m.evaluation.reason}`);

    assert.ok(['FAVORABLE', 'PARTIALLY_ACCEPTABLE', 'UNACCEPTABLE'].includes(m.evaluation.evaluation));
    assert.ok(['WITHIN_LIMIT', 'VIOLATED'].includes(m.evaluation.constraint_status));
    assert.ok(['ACCEPT', 'COUNTER', 'REJECT'].includes(m.evaluation.recommendation));
  });

  console.log('\n✓ Full engine integration test PASSED successfully!');
}

testEngineWithEvaluation()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Integration test failed:', err);
    process.exit(1);
  });
