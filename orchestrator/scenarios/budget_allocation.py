"""
scenarios/budget_allocation.py
================================
Scenario 3: Project Budget Allocation
  - Project Manager (PM) vs Finance Director negotiating project budget
  - PM target: 5,000,000 INR | walk-away: 3,500,000 INR (lowest they'll accept)
  - Finance Director target: 2,500,000 INR | walk-away: 4,000,000 INR (max they'll approve)
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agent_input import AgentProfile
from agents import Agent
from orchestrator import Orchestrator


def build_orchestrator(max_rounds: int = 5) -> Orchestrator:
    pm_profile = AgentProfile(
        agent_id="PM_BA",
        role="Project Manager",
        goals="Secure the maximum project budget to ensure full delivery scope and team capacity.",
        constraints="Minimum viable budget (walk-away) is 3,500,000 INR. Full target budget is 5,000,000 INR.",
        personality="aggressive",
        target_value=5_000_000,
        walk_away_value=3_500_000,
    )

    finance_profile = AgentProfile(
        agent_id="Finance_BA",
        role="Budget Holder",
        goals="Approve the minimum budget necessary to meet project goals without overspending.",
        constraints="Maximum budget cap (walk-away) is 4,000,000 INR. Target approval is 2,500,000 INR.",
        personality="risk-averse",
        target_value=2_500_000,
        walk_away_value=4_000_000,
    )

    # PM proposes the budget (initiates)
    agent1 = Agent(profile=pm_profile, max_rounds=max_rounds)
    agent2 = Agent(profile=finance_profile, max_rounds=max_rounds)
    return Orchestrator(agent1=agent1, agent2=agent2, scenario_name="Project Budget Allocation")


def run(max_rounds: int = 5) -> dict:
    orc = build_orchestrator(max_rounds)
    summary = orc.run_negotiation(max_rounds=max_rounds)
    print("\n--- Final State JSON ---")
    print(orc.state.to_json())
    return summary


if __name__ == "__main__":
    run()
