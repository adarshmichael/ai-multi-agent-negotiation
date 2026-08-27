/**
 * models/agent.model.js
 * Factory for creating agent configuration objects used by the negotiation engine.
 */

function createAgentConfig({ id, name, role, goal, constraints, personality, numericConstraint }) {
  return {
    id,
    name,
    role,
    goal,
    constraints: constraints || [],
    personality: personality || 'collaborative',  // aggressive | collaborative | risk-averse
    numericConstraint: numericConstraint || null,  // { type: 'max'|'min', value: number }
    currentOffer: null,
    initialOffer: null,
    decision: null,
  };
}

module.exports = { createAgentConfig };
