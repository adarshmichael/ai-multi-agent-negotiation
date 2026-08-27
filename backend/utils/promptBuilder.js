/**
 * utils/promptBuilder.js
 * Dynamically constructs LLM prompts from agent config + negotiation history.
 * Private reasoning is kept server-side; only safe JSON is returned to the client.
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
};

/**
 * Build the full system prompt for an agent's turn.
 *
 * @param {object} agent       — agent config (name, role, personality, goal, constraints)
 * @param {object} scenario    — scenario config (name, description)
 * @param {Array}  history     — array of prior messages { agentName, role, message, offer, round }
 * @param {object} opponent    — opponent's last message { message, offer, agentName }
 * @param {number} round       — current round number
 * @param {number} maxRounds   — maximum allowed rounds
 * @param {object} offerState  — { [agentId]: latestOffer } for context
 */
function buildPrompt({ agent, scenario, history, opponent, round, maxRounds, offerState }) {
  const personalityGuide = PERSONALITY_MODIFIERS[agent.personality] || PERSONALITY_MODIFIERS['collaborative'];

  // Format history for the prompt (last 8 messages to keep context manageable)
  const recentHistory = history.slice(-8);
  const historyText = recentHistory.length === 0
    ? 'No messages yet — you will make the opening offer.'
    : recentHistory.map(m =>
        `Round ${m.round} — ${m.agentName} (${m.role}):\n"${m.message}"${m.offer ? `\nOffer: ${formatCurrency(m.offer)}` : ''}`
      ).join('\n\n');

  const opponentText = opponent
    ? `${opponent.agentName}'s last message:\n"${opponent.message}"${opponent.offer ? `\nOffer: ${formatCurrency(opponent.offer)}` : ''}`
    : 'No opponent message yet — make your opening offer.';

  // Build hard constraint summary
  const constraintText = (agent.constraints || []).join('\n- ');

  // Current offer gap awareness
  const myCurrentOffer = offerState[agent.id];
  const opponentId = Object.keys(offerState).find(k => k !== agent.id);
  const opponentCurrentOffer = opponentId ? offerState[opponentId] : null;

  const roundsRemaining = maxRounds - round + 1;

  return `You are ${agent.name} in a professional negotiation simulation.

SCENARIO: ${scenario.name}
${scenario.description}

YOUR ROLE: ${agent.role}
YOUR GOAL: ${agent.goal}

YOUR PERSONALITY AND STRATEGY:
${personalityGuide}

YOUR HARD CONSTRAINTS (you MUST NOT violate these):
- ${constraintText}
${agent.numericConstraint ? `- Hard limit: ${formatCurrency(agent.numericConstraint.value)} (${agent.numericConstraint.type === 'max' ? 'maximum you will pay' : 'minimum you will accept'})` : ''}

NEGOTIATION CONTEXT:
- Scenario: ${scenario.name}
- Current Round: ${round} of ${maxRounds}
- Rounds remaining: ${roundsRemaining}
${myCurrentOffer ? `- Your current position: ${formatCurrency(myCurrentOffer)}` : ''}
${opponentCurrentOffer ? `- Opponent's current offer: ${formatCurrency(opponentCurrentOffer)}` : ''}
${myCurrentOffer && opponentCurrentOffer ? `- Gap: ${formatCurrency(Math.abs(myCurrentOffer - opponentCurrentOffer))}` : ''}

OPPONENT: ${opponent ? opponent.agentName : 'Unknown'}

NEGOTIATION HISTORY:
${historyText}

OPPONENT'S LATEST MESSAGE:
${opponentText}

NEGOTIATION RULES:
1. NEVER violate your hard constraints (e.g., never offer above your maximum budget, never accept below your minimum price)
2. Do NOT reveal your hard numeric limits explicitly
3. Make realistic, incremental concessions — not wild jumps
4. Reference the opponent's previous message in your response
5. Stay consistent with your personality
6. As rounds diminish, you may need to be more flexible to reach an agreement
7. If the gap is very small (< 2% of the total value), consider accepting
8. If you decide to ACCEPT, state clearly you are accepting the opponent's offer
9. If you decide to REJECT (no deal possible), explain why concisely
${roundsRemaining <= 2 ? '\n⚠ WARNING: Very few rounds remaining. Make your best final offer or accept now.' : ''}

Generate your negotiation response now.

You MUST respond with ONLY a valid JSON object in this exact format (no markdown, no explanation outside the JSON):
{
  "message": "Your negotiation message here — natural, professional, in-character",
  "offer": <number or null if no specific offer>,
  "decision": "counter_offer" | "accept" | "reject",
  "reasoning": "Brief private reasoning (1-2 sentences) — NOT shown to opponent"
}

Rules for the JSON:
- "message": Natural conversational text the opponent will see
- "offer": A number (e.g., 750000) or null if the message doesn't make a specific offer
- "decision": "counter_offer" if you are continuing negotiation, "accept" if you are accepting their last offer, "reject" if you cannot agree
- "reasoning": Your private reasoning (kept server-side, not sent to frontend)`;
}

function formatCurrency(amount) {
  if (!amount) return 'N/A';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

module.exports = { buildPrompt, formatCurrency };
