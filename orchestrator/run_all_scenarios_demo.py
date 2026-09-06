"""
run_all_scenarios_demo.py
=========================
Runs all three negotiation scenarios end-to-end and prints a consolidated
summary table at the end.

Usage:
    python orchestrator/run_all_scenarios_demo.py          # Real Gemini calls
    python orchestrator/run_all_scenarios_demo.py --mock   # Deterministic mock (no API needed)
"""

import sys
import os
import time

# Ensure the orchestrator package is on the path when run from project root
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

from scenarios import vendor_pricing, job_offer, budget_allocation

SEPARATOR = "=" * 60


def run_scenario(module, name: str, max_rounds: int = 5) -> dict:
    print(f"\n{'#'*60}")
    print(f"# RUNNING: {name}")
    print(f"{'#'*60}")
    summary = module.run(max_rounds=max_rounds)
    return summary


def print_summary_table(results: list[dict]):
    print(f"\n\n{'='*60}")
    print("  FINAL SUMMARY — ALL SCENARIOS")
    print(f"{'='*60}")
    print(f"  {'Scenario':<35} {'Status':<12} {'Rounds':>6}")
    print(f"  {'-'*35} {'-'*12} {'-'*6}")
    for r in results:
        scenario = r.get("scenario", "?")[:34]
        status = r.get("status", "?").upper()
        rounds = r.get("rounds_taken", "?")
        print(f"  {scenario:<35} {status:<12} {rounds:>6}")
    print(f"{'='*60}\n")


def main():
    use_mock = "--mock" in sys.argv
    if use_mock:
        os.environ["NEGOSIM_MOCK"] = "1"
        print("\n[Mode: MOCK — using deterministic rule-based responses]")
    else:
        print("\n[Mode: LIVE — calling Gemini 2.0 Flash API]")

    results = []

    # Scenario 1: Vendor Pricing
    s1 = run_scenario(vendor_pricing, "Vendor Pricing Negotiation", max_rounds=5)
    results.append(s1)
    time.sleep(1)   # small pause between scenarios

    # Scenario 2: Job Offer
    s2 = run_scenario(job_offer, "Job Offer Negotiation", max_rounds=5)
    results.append(s2)
    time.sleep(1)

    # Scenario 3: Project Budget Allocation
    s3 = run_scenario(budget_allocation, "Project Budget Allocation", max_rounds=5)
    results.append(s3)

    # Print consolidated summary
    print_summary_table(results)


if __name__ == "__main__":
    main()
