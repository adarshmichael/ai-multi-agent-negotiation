"""
scenarios/job_offer.py
======================
Scenario 2: Job Offer Negotiation
  - Candidate vs Hiring Manager negotiating annual salary
  - Candidate target: 1,800,000 INR/yr | walk-away: 1,400,000 INR/yr
  - Hiring Mgr target: 1,300,000 INR/yr | walk-away: 1,600,000 INR/yr
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agent_input import AgentProfile
from agents import Agent
from orchestrator import Orchestrator


def build_orchestrator(max_rounds: int = 5) -> Orchestrator:
    candidate_profile = AgentProfile(
        agent_id="Candidate_JO",
        role="Candidate",
        goals="Secure the highest possible annual salary and strong benefits package.",
        constraints="Minimum acceptable salary (walk-away) is 1,400,000 INR/yr. Ideal target is 1,800,000 INR/yr.",
        personality="collaborative",
        target_value=1_800_000,
        walk_away_value=1_400_000,
    )

    hiring_profile = AgentProfile(
        agent_id="HiringMgr_JO",
        role="Hiring Manager",
        goals="Hire the candidate at a salary within team budget, while remaining competitive.",
        constraints="Maximum budget (walk-away) is 1,600,000 INR/yr. Target offer is 1,300,000 INR/yr.",
        personality="risk-averse",
        target_value=1_300_000,
        walk_away_value=1_600_000,
    )

    # Candidate initiates (proposes their ask first)
    agent1 = Agent(profile=candidate_profile, max_rounds=max_rounds)
    agent2 = Agent(profile=hiring_profile, max_rounds=max_rounds)
    return Orchestrator(agent1=agent1, agent2=agent2, scenario_name="Job Offer Negotiation")


def run(max_rounds: int = 5) -> dict:
    orc = build_orchestrator(max_rounds)
    summary = orc.run_negotiation(max_rounds=max_rounds)
    print("\n--- Final State JSON ---")
    print(orc.state.to_json())
    return summary


if __name__ == "__main__":
    run()
