# NegoSim — Orchestrator Module (Milestone 2 Full)

This directory contains the complete Python backend engine for the NegoSim negotiation simulation platform.

---

## Architecture

```
orchestrator/
  negotiation_state.py       # State model — tracks rounds, history, offers, status
  orchestrator.py            # Orchestrator class — runs the turn-by-turn loop
  agent_input.py             # AgentProfile + AgentInputPayload (the "prompt payload")
  concession_engine.py       # Numeric concession logic per personality (deterministic)
  llm_interface.py           # generate_agent_response() — Gemini API or mock
  agents.py                  # Agent class — wraps profile + concession engine
  scenarios/
    vendor_pricing.py        # Scenario 1: Buyer vs Vendor
    job_offer.py             # Scenario 2: Candidate vs Hiring Manager
    budget_allocation.py     # Scenario 3: Project Manager vs Finance Director
  run_vendor_pricing_demo.py # Quick single-scenario test
  run_all_scenarios_demo.py  # Runs all 3 scenarios end-to-end
  .env                       # API key (gitignored)
  .env.example               # Template (committed)
  .gitignore
  README.md
```

---

## Key Design Decisions

### Concession Engine + LLM Separation
The **concession math is deterministic** (`concession_engine.py`) and the **LLM handles language and reasoning** (`llm_interface.py`). This means:
- Negotiation logic is fully testable without API calls (`--mock` flag).
- The LLM adds natural reasoning and tone, but cannot break numeric constraints.

### Response Schema
All agent responses (real and mock) follow the same schema:
```json
{
  "decision": "accept | counter | reject",
  "offer": { "value": 750000, "terms": "Net 30, single delivery" },
  "reasoning": "Internal log — not shown to the opponent."
}
```

### Personalities
| Personality    | Max concession/round | Walk-away buffer | Reject threshold |
|----------------|---------------------|------------------|-----------------|
| aggressive     | 5%                  | 5%               | 90%             |
| collaborative  | 12%                 | 15%              | 70%             |
| risk-averse    | 8%                  | 10%              | 80%             |

---

## Bug Fixes (vs Milestone 2 Foundation)

| Bug | Fix |
|-----|-----|
| Counteroffers not stored in `offers[agent_id]` | `record_action()` now stores both `offer` and `counteroffer` types into `offers` |
| Response key mismatch (`"action"` vs `"decision"`) | Unified to `"decision"` across all modules |
| `latest_offer` only stored `amount` | Now stores full offer dict (`value` + `terms`) for LLM context |
| String parsing for numeric constraints | `AgentProfile` now has explicit `target_value` and `walk_away_value` float fields |
| Deprecated `google.generativeai` SDK | Switched to `google.genai` (latest SDK) |
| Windows console Unicode crash | Replaced emoji/special chars with ASCII in print statements |

---

## How to Run

### Setup
```bash
# From project root — install dependencies once
pip install google-genai python-dotenv
```

Ensure `orchestrator/.env` contains:
```
GEMINI_API_KEY=your_key_here
```

### Single scenario (Vendor Pricing)
```bash
# Live Gemini calls
python orchestrator/run_vendor_pricing_demo.py

# Mock mode (no API key needed)
python orchestrator/run_vendor_pricing_demo.py --mock
```

### All three scenarios
```bash
# Live Gemini calls
python orchestrator/run_all_scenarios_demo.py

# Mock mode
python orchestrator/run_all_scenarios_demo.py --mock
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Required for live mode. Loaded from `orchestrator/.env`. |
| `NEGOSIM_MOCK` | Set to `1` to force mock mode programmatically. |

The `--mock` CLI flag also forces mock mode without changing env vars.

---

## Requirements
- Python 3.12+
- `google-genai >= 2.0`
- `python-dotenv >= 1.0`
