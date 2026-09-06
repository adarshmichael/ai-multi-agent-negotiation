"""
negotiation_state.py
====================
Data model representing the full state of a negotiation session.

BUG FIXES vs Milestone 2:
- record_action() now also stores counteroffer details into offers[agent_id]
  so per-agent offer history is complete regardless of action type.
- Added `scenario_name` field to tie state to a specific scenario.
- Added `agent_ids` field to record who the two parties are.
- to_dict() now includes scenario metadata for LLM context.
"""

import json
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional


@dataclass
class NegotiationState:
    """
    Tracks the complete runtime state of a negotiation between two agents.
    Designed to be JSON-serializable for LLM context and logging.
    """
    scenario_name: str = "Unknown Scenario"
    agent_ids: List[str] = field(default_factory=list)          # [agent1_id, agent2_id]
    round_number: int = 1
    current_turn: Optional[str] = None
    offers: Dict[str, List[Dict[str, Any]]] = field(default_factory=dict)       # agent_id → list of offer dicts
    counteroffers: List[Dict[str, Any]] = field(default_factory=list)           # all counteroffer log entries
    decisions: List[Dict[str, Any]] = field(default_factory=list)               # all accept/reject log entries
    status: str = "in_progress"   # "in_progress" | "accepted" | "rejected" | "terminated"
    history: List[Dict[str, Any]] = field(default_factory=list)                 # ordered log of every action

    def record_action(self, agent_id: str, action_type: str, details: Dict[str, Any]):
        """
        Records any action (offer, counteroffer, accept, reject) into the
        chronological history AND into the appropriate specific tracking list.

        FIX: counteroffers are now also appended into offers[agent_id] so that
        per-agent offer history is always complete for LLM context building.
        """
        action_log = {
            "round": self.round_number,
            "agent_id": agent_id,
            "action_type": action_type,
            "details": details,
        }
        self.history.append(action_log)

        # Track all numeric proposals (offers AND counteroffers) per agent
        if action_type in ("offer", "counteroffer"):
            if agent_id not in self.offers:
                self.offers[agent_id] = []
            self.offers[agent_id].append(details)

        # Separate list for counteroffers (for easy iteration)
        if action_type == "counteroffer":
            self.counteroffers.append(action_log)

        # Accept / reject decisions
        if action_type in ("accept", "reject"):
            self.decisions.append(action_log)

    def to_dict(self) -> Dict[str, Any]:
        """Serializes the full state to a plain dict (JSON-safe)."""
        return {
            "scenario_name": self.scenario_name,
            "agent_ids": self.agent_ids,
            "round_number": self.round_number,
            "current_turn": self.current_turn,
            "offers": self.offers,
            "counteroffers": self.counteroffers,
            "decisions": self.decisions,
            "status": self.status,
            "history": self.history,
        }

    def to_json(self) -> str:
        """Pretty-prints the state as a JSON string."""
        return json.dumps(self.to_dict(), indent=2)

    def get_last_offer_by(self, agent_id: str) -> Optional[Dict[str, Any]]:
        """Returns the most recent offer/counteroffer made by the given agent, or None."""
        agent_offers = self.offers.get(agent_id, [])
        return agent_offers[-1] if agent_offers else None
