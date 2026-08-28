/**
 * models/agent.model.js
 * Factory for creating agent configuration objects used by the negotiation engine.
 */

function createAgentConfig({ id, name, role, goal, goals, constraints, personality, numericConstraint, agentType }) {
  return {
    id,
    name,
    role,
    goal:               goal || (goals && goals.length > 0 ? goals[0] : ''),
    goals:              goals || (goal ? [goal] : []),   // array of goal strings
    constraints:        constraints || [],
    personality:        personality || 'collaborative',  // aggressive | collaborative | risk-averse | etc.
    numericConstraint:  numericConstraint || null,        // { type: 'max'|'min', value: number }
    agentType:          agentType || 'custom',            // buyer | seller | custom
    currentOffer:       null,
    initialOffer:       null,
    decision:           null,
  };
}

module.exports = { createAgentConfig };
