"""
orchestrator.py
===============
The Orchestrator manages the full turn-by-turn negotiation loop between two agents.

BUG FIXES vs Milestone 2:
- Unified action key: now reads "decision" from LLM response (was "action").
  Both "offer" and "counter" map cleanly to record_action("counteroffer").
- latest_offer now stores the full offer dict (value + terms), not just amount.
- Round increment happens at end of a FULL round (after BOTH agents have moved),
  with correct handling when a game ends mid-round.
- Print output now includes offer terms, not just the amount.
- Added scenario_name tracking in state.
"""

from typing import Optional
from negotiation_state import NegotiationState
from agents import Agent


class Orchestrator:
    def __init__(self, agent1: Agent, agent2: Agent, scenario_name: str = "Negotiation"):
        """
        Initializes the orchestrator with two agents.
        Agent 1 (the proposing/initiating party) always opens.
        """
        self.state = NegotiationState(
            scenario_name=scenario_name,
            agent_ids=[agent1.profile.agent_id, agent2.profile.agent_id],
        )
        self.agent1 = agent1
        self.agent2 = agent2
        self.active_agent = agent1
        self.waiting_agent = agent2
        self.latest_offer: Optional[dict] = None
        self.state.current_turn = self.active_agent.profile.agent_id
        self._turns_in_current_round = 0  # tracks half-turns within a round

    def _swap_turns(self):
        """Swaps active/waiting agents and increments round after a full exchange."""
        self._turns_in_current_round += 1
        # A full round = both agents have acted (2 half-turns)
        if self._turns_in_current_round == 2:
            self.state.round_number += 1
            self._turns_in_current_round = 0
        self.active_agent, self.waiting_agent = self.waiting_agent, self.active_agent
        self.state.current_turn = self.active_agent.profile.agent_id

    def run_negotiation(self, max_rounds: int = 5) -> dict:
        """
        Runs the negotiation loop. Returns a summary dict with outcome details.
        Loop continues until:
          - An agent accepts → status = "accepted"
          - An agent rejects → status = "rejected"
          - max_rounds exceeded → status = "terminated"
        """
        print(f"\n{'='*60}")
        print(f"  SCENARIO: {self.state.scenario_name}")
        print(f"  {self.agent1.profile.agent_id} ({self.agent1.profile.role})"
              f"  vs  {self.agent2.profile.agent_id} ({self.agent2.profile.role})")
        print(f"  Max rounds: {max_rounds}")
        print(f"{'='*60}")

        # Propagate max_rounds to both agents' engines
        self.agent1.max_rounds = max_rounds
        self.agent2.max_rounds = max_rounds

        while self.state.round_number <= max_rounds and self.state.status == "in_progress":
            # Compute display round number (considers half-turns)
            display_round = self.state.round_number
            print(f"\n  [Round {display_round}] >> {self.active_agent.profile.agent_id}"
                  f" ({self.active_agent.profile.role})")

            # Agent takes its turn
            response = self.active_agent.take_turn(self.state, self.latest_offer)
            decision = response.get("decision", "reject")
            offer = response.get("offer", {}) or {}
            offer_value = offer.get("value")
            offer_terms = offer.get("terms", "")
            reasoning = response.get("reasoning", "")

            # Map LLM decision → internal action_type
            # "counter" on the first move is an "offer"; subsequently "counteroffer"
            if decision == "counter":
                action_type = "offer" if self.latest_offer is None and self._turns_in_current_round == 0 and self.state.round_number == 1 else "counteroffer"
            elif decision == "accept":
                action_type = "accept"
            else:
                action_type = "reject"

            # Record full details into state
            action_details = {
                "decision": decision,
                "offer": offer,
                "reasoning": reasoning,
            }
            self.state.record_action(
                agent_id=self.active_agent.profile.agent_id,
                action_type=action_type,
                details=action_details,
            )

            # Print turn summary
            print(f"  Decision  : {decision.upper()}")
            if offer_value is not None:
                print(f"  Offer     : {float(offer_value):,.0f}")
            if offer_terms:
                print(f"  Terms     : {offer_terms}")
            if reasoning:
                print(f"  Reasoning : {reasoning}")

            # Process outcome
            if decision == "accept":
                self.state.status = "accepted"
                accepted_val = (self.latest_offer or {}).get("value") or (self.latest_offer or {}).get("amount")
                print(f"\n  [AGREEMENT REACHED] at value: {float(accepted_val):,.0f}" if accepted_val else "\n  [AGREEMENT REACHED]")
                break

            elif decision == "reject":
                self.state.status = "rejected"
                print("\n  [NEGOTIATION REJECTED]")
                break

            elif decision == "counter":
                # Update latest_offer for the next agent
                self.latest_offer = {"value": offer_value, "terms": offer_terms}
                self._swap_turns()

            else:
                self.state.status = "terminated"
                print(f"\n  [WARNING] UNKNOWN DECISION '{decision}'. TERMINATING.")
                break

        if self.state.status == "in_progress":
            self.state.status = "terminated"
            print(f"\n  [MAX ROUNDS ({max_rounds}) REACHED] -- TERMINATED (no agreement)")

        print(f"\n{'='*60}")
        print(f"  Final status: {self.state.status.upper()}")
        print(f"  Rounds taken: {self.state.round_number}")
        print(f"{'='*60}\n")

        # Build summary for the caller
        final_offer_a1 = self.state.get_last_offer_by(self.agent1.profile.agent_id) or {}
        final_offer_a2 = self.state.get_last_offer_by(self.agent2.profile.agent_id) or {}
        return {
            "scenario": self.state.scenario_name,
            "status": self.state.status,
            "rounds_taken": self.state.round_number,
            f"{self.agent1.profile.agent_id}_final_offer": final_offer_a1.get("offer", {}).get("value"),
            f"{self.agent2.profile.agent_id}_final_offer": final_offer_a2.get("offer", {}).get("value"),
        }
