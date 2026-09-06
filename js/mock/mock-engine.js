/**
 * js/mock/mock-engine.js
 * Mock negotiation engine — rule-based agent responses.
 * Implements the generate_agent_response() interface so the frontend
 * treats this identically to a future real LLM response.
 *
 * Interface:
 *   generate_agent_response(agent_profile, negotiation_state, history)
 *   → { message: string, offer: number|null, decision: 'offer'|'counteroffer'|'accept'|'reject' }
 */

/* =====================================================================
   Default test dataset — Vendor Pricing Negotiation, 4 rounds
   ===================================================================== */

const MOCK_DEMO_SCRIPT = [
  // Round 1 — Buyer opens
  {
    round: 1,
    agentId: 'buyer',
    agentName: 'Buyer',
    role: 'Customer / Buyer',
    offer: 650000,
    decision: 'offer',
    message: 'Good morning. After reviewing our procurement guidelines and quality requirements, we\'d like to open with ₹6,50,000 for this engagement. This reflects our initial budget allocation and we believe it represents fair market value for a standard package.',
    thinkingPhrase: 'Analysing market data and budget constraints…',
    orchestratorPhase: 'agent_turn',
    orchestratorLabel: 'ROUND 1 — AWAITING BUYER',
  },
  // Round 1 — Vendor counters
  {
    round: 1,
    agentId: 'vendor',
    agentName: 'Vendor',
    role: 'Seller / Vendor',
    offer: 950000,
    decision: 'counteroffer',
    message: 'Thank you for your opening. Our cost structure, quality certifications, and post-delivery support require a minimum of ₹9,50,000 to proceed profitably. This covers materials, logistics, and 12 months of warranty support included in our standard SLA.',
    thinkingPhrase: 'Calculating margin requirements and cost base…',
    orchestratorPhase: 'state_updated',
    orchestratorLabel: 'STATE UPDATED — ROUND 1 COMPLETE',
  },
  // Round 2 — Buyer moves
  {
    round: 2,
    agentId: 'buyer',
    agentName: 'Buyer',
    role: 'Customer / Buyer',
    offer: 700000,
    decision: 'counteroffer',
    message: 'We appreciate the detail. While we value your quality standards, ₹9,50,000 exceeds our approved budget ceiling. We can stretch to ₹7,00,000 — this includes the assumption that standard payment terms of Net-30 apply. We hope this demonstrates our commitment to a long-term relationship.',
    thinkingPhrase: 'Evaluating concession strategy…',
    orchestratorPhase: 'agent_turn',
    orchestratorLabel: 'ROUND 2 — AWAITING BUYER',
  },
  // Round 2 — Vendor moves
  {
    round: 2,
    agentId: 'vendor',
    agentName: 'Vendor',
    role: 'Seller / Vendor',
    offer: 875000,
    decision: 'counteroffer',
    message: 'We recognize your budget constraints and value this potential partnership. We can reduce to ₹8,75,000 — this concession is conditional on a volume commitment of at least 500 units and milestone-based payment. Any further reduction would require scope adjustment.',
    thinkingPhrase: 'Weighing volume discount viability…',
    orchestratorPhase: 'state_updated',
    orchestratorLabel: 'STATE UPDATED — ROUND 2 COMPLETE',
  },
  // Round 3 — Buyer moves
  {
    round: 3,
    agentId: 'buyer',
    agentName: 'Buyer',
    role: 'Customer / Buyer',
    offer: 750000,
    decision: 'counteroffer',
    message: 'We can confirm the 500-unit commitment. Moving to ₹7,50,000 — we\'re prepared to accept milestone payments (40% upfront, 60% on delivery). This is approaching our absolute ceiling and we\'d need all quality and warranty terms as originally described.',
    thinkingPhrase: 'Preparing final position…',
    orchestratorPhase: 'agent_turn',
    orchestratorLabel: 'ROUND 3 — AWAITING BUYER',
  },
  // Round 3 — Vendor moves
  {
    round: 3,
    agentId: 'vendor',
    agentName: 'Vendor',
    role: 'Seller / Vendor',
    offer: 825000,
    decision: 'counteroffer',
    message: 'The volume commitment helps us absorb some margin. Final offer: ₹8,25,000 with the 40/60 milestone payment structure you\'ve proposed. This is our floor — below this we cannot maintain the quality and SLA standards both parties expect.',
    thinkingPhrase: 'Assessing minimum viable margin…',
    orchestratorPhase: 'state_updated',
    orchestratorLabel: 'STATE UPDATED — ROUND 3 COMPLETE',
  },
  // Round 4 — Buyer final offer
  {
    round: 4,
    agentId: 'buyer',
    agentName: 'Buyer',
    role: 'Customer / Buyer',
    offer: 780000,
    decision: 'offer',
    message: 'We\'ve consulted internally. Our final position is ₹7,80,000 — we cannot go higher without executive approval that would delay the project by 3 weeks. This price is firm and includes the 500-unit commitment, milestone payments, and all stated quality terms.',
    thinkingPhrase: 'Preparing final offer…',
    orchestratorPhase: 'agent_turn',
    orchestratorLabel: 'ROUND 4 — AWAITING BUYER',
  },
  // Round 4 — Vendor accepts
  {
    round: 4,
    agentId: 'vendor',
    agentName: 'Vendor',
    role: 'Seller / Vendor',
    offer: 780000,
    decision: 'accept',
    message: 'After reviewing the complete package — 500-unit volume, milestone payment structure, and the established relationship potential — we accept ₹7,80,000. We look forward to a successful engagement and will send the contract documentation within 24 hours.',
    thinkingPhrase: 'Evaluating final offer against walk-away point…',
    orchestratorPhase: 'termination_check',
    orchestratorLabel: 'TERMINATION CHECK — EVALUATING ACCEPTANCE',
  },
];

/* =====================================================================
   Rule-based response generator
   ===================================================================== */

/**
 * Generate a mock agent response.
 *
 * @param {object} agent_profile  — { id, name, role, personality, goals, constraints }
 * @param {object} negotiation_state — { round, maxRounds, offers, status, lastOffer }
 * @param {Array}  history         — previous messages [ { agentId, offer, decision, message } ]
 * @returns {{ message: string, offer: number|null, decision: string, thinkingPhrase: string }}
 */
function generate_agent_response(agent_profile, negotiation_state, history) {
  const { round, maxRounds, offers, lastOffer } = negotiation_state;
  const { id: agentId, personality } = agent_profile;

  // Find the pre-scripted entry for this agent/round
  const scripted = MOCK_DEMO_SCRIPT.find(
    e => e.agentId === agentId && e.round === round
  );
  if (scripted) {
    return {
      message:        scripted.message,
      offer:          scripted.offer,
      decision:       scripted.decision,
      thinkingPhrase: scripted.thinkingPhrase,
    };
  }

  // Fallback: generate a generic response based on personality
  const myLastOffer = offers[agentId] ?? null;
  const isLastRound = round >= maxRounds;

  const concessionRate = {
    aggressive:    0.02,
    competitive:   0.03,
    collaborative: 0.05,
    flexible:      0.06,
    'risk-averse': 0.04,
    analytical:    0.04,
    professional:  0.03,
  }[personality] || 0.04;

  let newOffer = myLastOffer;
  if (myLastOffer !== null) {
    const direction = agentId === 'buyer' ? 1 : -1;
    newOffer = Math.round(myLastOffer * (1 + direction * concessionRate) / 1000) * 1000;
  }

  const decision = isLastRound ? 'accept' : 'counteroffer';
  const message = isLastRound
    ? `Given the circumstances and our shared interest in closing this deal, we accept the current terms. Let's proceed.`
    : `We've reviewed the latest position. Our revised offer is ₹${newOffer?.toLocaleString('en-IN') || '—'}. We hope this moves us closer to an agreement.`;

  return {
    message,
    offer:          newOffer,
    decision,
    thinkingPhrase: 'Processing latest offer…',
  };
}

/* =====================================================================
   Expose globally
   ===================================================================== */
window.MockEngine = {
  generate_agent_response,
  DEMO_SCRIPT: MOCK_DEMO_SCRIPT,

  /** Convenience: get all demo entries for a given round */
  getRoundEntries(round) {
    return MOCK_DEMO_SCRIPT.filter(e => e.round === round);
  },

  /** Total number of rounds in the demo script */
  get totalRounds() {
    return Math.max(...MOCK_DEMO_SCRIPT.map(e => e.round));
  },

  /** All unique agents in the demo */
  get agents() {
    const seen = new Set();
    return MOCK_DEMO_SCRIPT.filter(e => {
      if (seen.has(e.agentId)) return false;
      seen.add(e.agentId);
      return true;
    }).map(e => ({ id: e.agentId, name: e.agentName, role: e.role }));
  },
};
