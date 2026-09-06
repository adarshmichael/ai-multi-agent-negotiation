"""
agents.py
=========
Defines the Agent class, which wraps an AgentProfile and drives the per-turn
decision cycle: concession engine → LLM interface → structured response.

Changes vs Milestone 2:
- Agent now owns a ConcessionEngine instance so concession logic is
  encapsulated per-agent (each agent has different personality/values).
- take_turn() passes the ConcessionHint to the payload so the LLM has
  numeric guardrails.
- is_buyer flag is auto-detected from the role field.
"""

from typing import Dict, Any, Optional

from agent_input import AgentProfile, AgentInputPayload
from llm_interface import generate_agent_response
from negotiation_state import NegotiationState
from concession_engine import ConcessionEngine


class Agent:
    def __init__(self, profile: AgentProfile, max_rounds: int = 5):
        self.profile = profile
        self.max_rounds = max_rounds

        # Auto-detect whether this agent benefits from lower values (buyer side)
        buyer_keywords = ("buyer", "budget holder", "budget", "purchaser", "candidate")
        self.is_buyer = any(kw in profile.role.lower() for kw in buyer_keywords)

        self.engine = ConcessionEngine(
            target_value=profile.target_value,
            walk_away_value=profile.walk_away_value,
            personality=profile.personality,
            is_buyer=self.is_buyer,
        )

    def take_turn(
        self,
        state: NegotiationState,
        opponent_offer: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Full turn cycle:
          1. Extract opponent numeric value
          2. Run concession engine for numeric boundaries
          3. Build AgentInputPayload with hint
          4. Call LLM interface (real or mock)
          5. Return structured response dict
        """
        # Extract numeric value from opponent offer
        opp_numeric: Optional[float] = None
        if opponent_offer:
            v = opponent_offer.get("value") or opponent_offer.get("amount")
            if v is not None:
                try:
                    opp_numeric = float(v)
                except (ValueError, TypeError):
                    opp_numeric = None

        # Concession engine provides numeric guidance
        hint = self.engine.evaluate(
            round_number=state.round_number,
            opponent_offer=opp_numeric,
            max_rounds=self.max_rounds,
        )

        payload = AgentInputPayload(
            profile=self.profile,
            negotiation_state=state.to_dict(),
            opponent_offer=opponent_offer,
            concession_hint=hint.to_dict(),
        )

        response = generate_agent_response(payload)
        return response
