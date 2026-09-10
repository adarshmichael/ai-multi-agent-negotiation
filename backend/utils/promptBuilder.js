/**
 * utils/promptBuilder.js
 * Dynamically constructs LLM prompts from agent config + negotiation history.
 * Private reasoning is kept server-side; only safe JSON is returned to the client.
 *
 * Module 5: Includes structured context from Modules 1-4 (evaluation,
 * concession state, counteroffer parameters) so the LLM generates responses
 * consistent with the deterministic decision already made.
 */

const PERSONALITY_MODIFIERS = {
  aggressive: `
- Use strong anchors and confident language
- Make minimal concessions; each one must be justified
- Be direct, firm, and assertive
- Never volunteer information that weakens your position
- Push for maximum value from each exchange`,

  collaborative: `
- Seek mutually beneficial outcomes
- Explain your reasoning openly and transparently
- Be willing to trade across multiple terms
- Show flexibility when the other party moves toward you
- Emphasize shared interests and long-term value`,

  'risk-averse': `
- Make small, carefully measured concessions only
- Request detailed justification before accepting any term change
- Avoid large price movements in a single round
- Prioritize predictability and a dependable agreement over maximum gain
- Flag any uncertainty before committing`,

  competitive: `
- Push hard for maximum advantage in every exchange
- Use time pressure and alternatives as leverage
- Anchor high (seller) or low (buyer) and move reluctantly
- Treat every concession as a strategic investment`,

  flexible: `
- Adapt your approach based on opponent moves
- Be willing to make larger concessions when the situation calls for it
- Look for creative trade-offs and package deals
- Show goodwill to build momentum toward agreement`,

  analytical: `
- Ground every argument in data, costs, or comparable benchmarks
- Question assumptions and ask for justification
- Make offers that are logically defensible
- Move only when the numbers support it`,

  professional: `
- Maintain formal, structured tone throughout
- Refer to policies, standards, and procedures when relevant
- Make well-documented proposals with clear rationale
- Keep personal reactions out of the negotiation`,
};

/**
 * Build the full system prompt for an agent turn.
 *
 * @param {object} agent           - agent config
 * @param {object} scenario        - scenario config
 * @param {Array}  history         - prior messages
 * @param {object} opponent        - opponent last message
 * @param {number} round           - current round
 * @param {number} maxRounds       - maximum rounds
 * @param {object} offerState      - { [agentId]: latestOffer }
 * @param {object} [evaluation]    - Module 1 result (optional)
 * @param {object} [concession]    - Module 4 snapshot (optional)
 * @param {object} [counterResult] - Module 3 result (optional)
 * @param {string} [decision]      - deterministic decision (optional)
 */
function buildPrompt({ agent, scenario, history, opponent, round, maxRounds, offerState,
  evaluation, concession, counterResult, decision }) {
  const personalityGuide = PERSONALITY_MODIFIERS[(agent.personality || '').toLowerCase()] ||
    PERSONALITY_MODIFIERS['collaborative'];

  const recentHistory = history.slice(-8);
  const historyText = recentHistory.length === 0
    ? 'No messages yet - you will make the opening offer.'
    : recentHistory.map(m =>
        `Round ${m.round} - ${m.agentName} (${m.role}):\n"${m.message}"${m.offer ? `\nOffer: ${formatCurrency(m.offer)}` : ''}`
      ).join('\n\n');

  const opponentText = opponent
    ? `${opponent.agentName} last message:\n"${opponent.message}"${opponent.offer ? `\nOffer: ${formatCurrency(opponent.offer)}` : ''}`
    : 'No opponent message yet - make your opening offer.';

  const constraintText = (agent.constraints || []).join('\n- ');
  const myCurrentOffer = offerState[agent.id];
  const opponentId = Object.keys(offerState).find(k => k !== agent.id);
  const opponentCurrentOffer = opponentId ? offerState[opponentId] : null;
  const roundsRemaining = maxRounds - round + 1;

  // Module 1-4 structured context
  let m14Context = '';

  if (evaluation && evaluation.evaluation) {
    const evalMap = {
      FAVORABLE:            'FAVORABLE - good progress toward your target',
      PARTIALLY_ACCEPTABLE: 'PARTIALLY ACCEPTABLE - within limits but not ideal',
      UNACCEPTABLE:         'UNACCEPTABLE - violates your hard constraint',
    };
    const evalLabel  = evalMap[evaluation.evaluation] || evaluation.evaluation;
    const distSign   = (evaluation.distance_from_target || 0) > 0 ? '+' : '';
    const distText   = evaluation.distance_from_target != null
      ? `${distSign}${formatCurrency(evaluation.distance_from_target)}` : 'N/A';
    const cLabel     = evaluation.constraint_status === 'WITHIN_LIMIT' ? 'WITHIN LIMIT' : 'VIOLATED';

    m14Context += `
OFFER EVALUATION (deterministic - respect this):
- Result: ${evalLabel}
- Distance from target: ${distText}
- Constraint status: ${cLabel}
- Recommendation: ${evaluation.recommendation || 'N/A'}
`;
  }

  if (decision) {
    const decMap = {
      ACCEPT:  "ACCEPT the offer - generate a conclusive acceptance message",
      COUNTER: 'COUNTER with a new offer - generate a persuasive counter-proposal',
      REJECT:  'REJECT - explain clearly why this price does not work',
    };
    m14Context += `
DETERMINISTIC DECISION (your response MUST match this):
- Decision: ${decision}
- Action: ${decMap[decision] || decision}
`;
  }

  if (counterResult && counterResult.proposed_offer) {
    const co   = counterResult.proposed_offer;
    const rate = counterResult.effective_concession_rate != null
      ? ` (${(counterResult.effective_concession_rate * 100).toFixed(1)}% rate)` : '';
    const cAmt = co.concession_amount != null ? formatCurrency(co.concession_amount) : 'N/A';
    m14Context += `
COUNTEROFFER (Module 3 - use this exact offer number):
- Proposed offer: ${formatCurrency(co.price)}
- Concession this round: ${cAmt}${rate}
- Status: ${counterResult.constraint_status || 'N/A'}
${counterResult.is_clamped ? '- CLAMPED to hard constraint - stay firm at this number.' : ''}
`;
  }

  if (concession && concession.initial_position != null) {
    const totalMoved  = concession.total_concession > 0 ? formatCurrency(concession.total_concession) : 'N/A';
    const pct         = concession.concession_percentage > 0 ? `${concession.concession_percentage.toFixed(1)}%` : '0%';
    const flexLeft    = concession.remaining_flexibility != null ? formatCurrency(concession.remaining_flexibility) : 'N/A';
    const consumedPct = Math.round(concession.flexibility_consumed_pct || 0);

    m14Context += `
CONCESSION STATE (Module 4 - calibrate your tone):
- Initial position: ${formatCurrency(concession.initial_position)}
- Previous offer: ${concession.previous_offer ? formatCurrency(concession.previous_offer) : 'Opening'}
- Total concession: ${totalMoved} (${pct})
- Remaining flexibility: ${flexLeft}
- Consumed: ${consumedPct}%
${consumedPct >= 80 ? '- WARNING: Near your limit. Communicate firmness without revealing exact limit.' : ''}
`;
  }

  return `You are ${agent.name} in a professional negotiation simulation.

SCENARIO: ${scenario.name}
${scenario.description}

YOUR ROLE: ${agent.role}
YOUR GOAL: ${agent.goal}

YOUR PERSONALITY:
${personalityGuide}

YOUR HARD CONSTRAINTS:
- ${constraintText}
${agent.numericConstraint ? `- Hard limit: ${formatCurrency(agent.numericConstraint.value)} (${agent.numericConstraint.type === 'max' ? 'max you will pay' : 'min you will accept'})` : ''}

NEGOTIATION CONTEXT:
- Round: ${round} of ${maxRounds} (${roundsRemaining} remaining)
${myCurrentOffer ? `- Your current position: ${formatCurrency(myCurrentOffer)}` : ''}
${opponentCurrentOffer ? `- Opponent current offer: ${formatCurrency(opponentCurrentOffer)}` : ''}
${myCurrentOffer && opponentCurrentOffer ? `- Gap: ${formatCurrency(Math.abs(myCurrentOffer - opponentCurrentOffer))}` : ''}
${m14Context}
OPPONENT: ${opponent ? opponent.agentName : 'Unknown'}

NEGOTIATION HISTORY:
${historyText}

OPPONENT LATEST MESSAGE:
${opponentText}

RULES:
1. Never violate your hard constraints
2. Do not reveal your exact limit
3. Make realistic incremental concessions
4. Reference the opponent message in your response
5. Stay consistent with your personality
6. If DETERMINISTIC DECISION given above, your decision MUST match it
7. If COUNTEROFFER given above, your offer MUST match that exact number
8. Never repeat the same opening phrase as a previous round
${roundsRemaining <= 2 ? '9. WARNING: Few rounds left - make your best offer or accept now.' : ''}

Respond with ONLY this JSON (no markdown, no extra text):
{
  "message": "Your negotiation message - natural, professional, varied from prior rounds",
  "offer": <number or null>,
  "decision": "counter_offer" | "accept" | "reject",
  "reasoning": "Brief private reasoning - not shown to opponent"
}`;
}

function formatCurrency(amount) {
  if (amount == null) return 'N/A';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(amount);
}

module.exports = { buildPrompt, formatCurrency };
