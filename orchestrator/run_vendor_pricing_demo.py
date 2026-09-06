"""
run_vendor_pricing_demo.py
==========================
Quick test script for the Vendor Pricing Negotiation scenario.
Kept as a simple entry point for single-scenario testing.

Usage:
    python orchestrator/run_vendor_pricing_demo.py          # Real Gemini
    python orchestrator/run_vendor_pricing_demo.py --mock   # Mock mode
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from scenarios.vendor_pricing import run

if __name__ == "__main__":
    use_mock = "--mock" in sys.argv
    if use_mock:
        os.environ["NEGOSIM_MOCK"] = "1"
        print("[Mode: MOCK]\n")
    else:
        print("[Mode: LIVE — Gemini API]\n")
    run(max_rounds=5)
