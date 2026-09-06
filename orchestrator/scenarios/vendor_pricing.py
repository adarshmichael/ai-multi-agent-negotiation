"""
scenarios/vendor_pricing.py
===========================
Scenario 1: Vendor Pricing Negotiation
  - Buyer (Company Purchasing Manager) vs Vendor (Sales Representative)
  - Buyer target: 650,000 INR  |  walk-away: 800,000 INR
  - Vendor target: 850,000 INR |  walk-away: 700,000 INR
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agent_input import AgentProfile
from agents import Agent
from orchestrator import Orchestrator


def build_orchestrator(max_rounds: int = 5) -> Orchestrator:
    buyer_profile = AgentProfile(
        agent_id="Buyer_VP",
        role="Buyer",
        goals="Purchase the vendor's product at the lowest possible price to maximise budget savings.",
        constraints="Maximum budget (walk-away point) is 800,000 INR. Target price is 650,000 INR.",
        personality="collaborative",
        target_value=650_000,
        walk_away_value=800_000,
    )

    vendor_profile = AgentProfile(
        agent_id="Vendor_VP",
        role="Vendor",
        goals="Sell at the highest achievable price to maximise profit margin.",
        constraints="Minimum acceptable price (walk-away point) is 700,000 INR. Target price is 850,000 INR.",
        personality="aggressive",
        target_value=850_000,
        walk_away_value=700_000,
    )

    agent1 = Agent(profile=buyer_profile, max_rounds=max_rounds)
    agent2 = Agent(profile=vendor_profile, max_rounds=max_rounds)
    return Orchestrator(agent1=agent1, agent2=agent2, scenario_name="Vendor Pricing Negotiation")


def run(max_rounds: int = 5) -> dict:
    orc = build_orchestrator(max_rounds)
    summary = orc.run_negotiation(max_rounds=max_rounds)
    print("\n--- Final State JSON ---")
    print(orc.state.to_json())
    return summary


if __name__ == "__main__":
    run()
