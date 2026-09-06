"""
agent_input.py
==============
Standardized data structures for agent profiles and per-turn input payloads.

Changes vs Milestone 2:
- AgentProfile gains numeric walk_away_value and target_value fields so the
  concession engine has clean numbers to work with (no string parsing required).
- AgentInputPayload.to_dict() now includes concession_hint from the engine.
"""

from dataclasses import dataclass, field
from typing import Dict, Any, Optional


@dataclass
class AgentProfile:
    """
    Complete profile for one negotiating agent. The numeric value fields
    (target_value, walk_away_value) drive the concession engine; the text
    fields (goals, constraints) are woven into the LLM system prompt.
    """
    agent_id: str
    role: str
    goals: str
    constraints: str
    personality: str = "collaborative"    # "aggressive" | "collaborative" | "risk-averse"
    target_value: float = 0.0             # The ideal outcome the agent hopes to achieve
    walk_away_value: float = 0.0          # The absolute limit — never cross this

    def to_dict(self) -> Dict[str, Any]:
        return {
            "agent_id": self.agent_id,
            "role": self.role,
            "goals": self.goals,
            "constraints": self.constraints,
            "personality": self.personality,
            "target_value": self.target_value,
            "walk_away_value": self.walk_away_value,
        }


@dataclass
class AgentInputPayload:
    """
    Everything an agent (or LLM call) needs to produce its next response.
    Think of this as the structured prompt payload.
    """
    profile: AgentProfile
    negotiation_state: Dict[str, Any]
    opponent_offer: Optional[Dict[str, Any]] = None
    concession_hint: Optional[Dict[str, Any]] = None  # from ConcessionEngine — numeric boundaries

    def to_dict(self) -> Dict[str, Any]:
        return {
            "profile": self.profile.to_dict(),
            "negotiation_state": self.negotiation_state,
            "opponent_offer": self.opponent_offer,
            "concession_hint": self.concession_hint,
        }
