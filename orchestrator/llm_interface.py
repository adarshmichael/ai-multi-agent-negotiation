"""
llm_interface.py
================
Provides generate_agent_response() -- the single entry point for getting
an agent's next action. In real mode, calls Gemini 3.5 Flash. With --mock
flag (or when NEGOSIM_MOCK=1 env var), uses deterministic rule-based logic.

BUG FIXES vs Milestone 2:
- Response key is now unified: always "decision" (accept|counter|reject)
  and "offer.value" for numeric proposals, matching the orchestrator.
- Added JSON parse retry + safe fallback on malformed Gemini output.
- API key is loaded from .env via python-dotenv; never hardcoded.
- Em dash / special Unicode chars replaced with ASCII for Windows compatibility.
"""

import json
import os
import re
import sys
import time
from typing import Dict, Any

from dotenv import load_dotenv
from agent_input import AgentInputPayload

# Load .env from the orchestrator directory (where this file lives)
_HERE = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_HERE, ".env"))

# ---------------------------------------------------------------------------
# Determine operating mode
# ---------------------------------------------------------------------------
_MOCK_MODE: bool = os.environ.get("NEGOSIM_MOCK", "0") == "1"

# Try to import the new Gemini SDK — fall back gracefully if not installed
try:
    from google import genai
    from google.genai import types as genai_types
    _GEMINI_AVAILABLE = True
except ImportError:
    _GEMINI_AVAILABLE = False
    print("[llm_interface] WARNING: google-genai not installed. Falling back to mock mode.")
    _MOCK_MODE = True

# Configure Gemini client if available
_gemini_client = None
if _GEMINI_AVAILABLE and not _MOCK_MODE:
    _api_key = os.environ.get("GEMINI_API_KEY", "")
    if not _api_key:
        print("[llm_interface] WARNING: GEMINI_API_KEY not found. Falling back to mock mode.")
        _MOCK_MODE = True
    else:
        _gemini_client = genai.Client(api_key=_api_key)


# ---------------------------------------------------------------------------
# Response schema (always returned, regardless of mode)
# ---------------------------------------------------------------------------
RESPONSE_SCHEMA = {
    "decision": "accept | counter | reject",
    "offer": {"value": "<number>", "terms": "<short description>"},
    "reasoning": "<internal log — not shown to opponent>",
}


# ---------------------------------------------------------------------------
# History formatter — converts state history to a readable conversation log
# ---------------------------------------------------------------------------
def _format_history(history: list) -> str:
    if not history:
        return "No moves yet -- this is the opening offer."
    lines = []
    for entry in history:
        agent = entry.get("agent_id", "?")
        action = entry.get("action_type", "?").upper()
        rnd = entry.get("round", "?")
        det = entry.get("details", {})
        offer_val = det.get("offer", {})
        value = offer_val.get("value") if isinstance(offer_val, dict) else det.get("amount")
        terms = offer_val.get("terms", "") if isinstance(offer_val, dict) else ""
        reasoning = det.get("reasoning", "")
        line = f"  [Round {rnd}] {agent}: {action}"
        if value is not None:
            line += f" - value: {value:,.0f}" if isinstance(value, (int, float)) else f" - value: {value}"
        if terms:
            line += f" | terms: {terms}"
        if reasoning:
            line += f" | reason: {reasoning}"
        lines.append(line)
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------
def _build_system_prompt(payload: AgentInputPayload) -> str:
    profile = payload.profile
    state = payload.negotiation_state
    history_text = _format_history(state.get("history", []))
    opp = payload.opponent_offer
    hint = payload.concession_hint

    opp_block = ""
    if opp:
        opp_val = opp.get("value") or opp.get("amount")
        opp_terms = opp.get("terms", "")
        opp_block = f"""
The opponent's CURRENT OFFER for you to respond to:
  Value: {opp_val}
  Terms: {opp_terms or '(none specified)'}
"""

    hint_block = ""
    if hint:
        hint_block = f"""
[NEGOTIATION GUARDRAILS - you MUST respect these numeric boundaries]:
  Recommended offer: {hint.get('recommended_offer')}
  Acceptable range : {hint.get('min_offer')} to {hint.get('max_offer')}
  Engine suggestion: {hint.get('decision')} ({hint.get('reasoning')})
"""

    return f"""You are an AI negotiating agent in a structured negotiation simulation.

=== YOUR PERSONA ===
Agent ID   : {profile.agent_id}
Role       : {profile.role}
Goals      : {profile.goals}
Constraints: {profile.constraints}
Personality: {profile.personality}
Scenario   : {state.get('scenario_name', 'Negotiation')}
Current Round: {state.get('round_number', 1)}

=== NEGOTIATION HISTORY (complete log) ===
{history_text}
{opp_block}{hint_block}
=== YOUR TASK ===
Based on your role, personality, goals, and constraints, decide your next move.
Respond ONLY with a valid JSON object. Do NOT include any explanation outside the JSON.

Required JSON format:
{{
  "decision": "accept" | "counter" | "reject",
  "offer": {{
    "value": <number or null if accepting/rejecting>,
    "terms": "<brief description of terms or conditions>"
  }},
  "reasoning": "<short internal reasoning for logs — NOT shown to opponent>"
}}

Rules:
- If you ACCEPT, set decision="accept", offer.value=null.
- If you COUNTER, set decision="counter" with a numeric offer.value.
- If you REJECT, set decision="reject", offer.value=null.
- Honour the numeric guardrails if provided — do not exceed your walk-away point.
- Keep reasoning concise (1-2 sentences).
"""


# ---------------------------------------------------------------------------
# JSON parser with retry + fallback
# ---------------------------------------------------------------------------
def _parse_gemini_response(raw_text: str) -> Dict[str, Any]:
    """
    Extracts a JSON object from Gemini's response text.
    Tries: direct parse → regex extraction → fallback default.
    """
    # Strip markdown code fences
    cleaned = re.sub(r"```(?:json)?", "", raw_text).strip().strip("`").strip()

    # Attempt 1: direct parse
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Attempt 2: find first {...} block
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    # Fallback
    return {
        "decision": "reject",
        "offer": {"value": None, "terms": ""},
        "reasoning": "[PARSE ERROR] Gemini returned malformed JSON. Defaulting to reject.",
    }


# ---------------------------------------------------------------------------
# Real Gemini call
# ---------------------------------------------------------------------------
def _call_gemini(payload: AgentInputPayload) -> Dict[str, Any]:
    """Calls Gemini 3.5 Flash with a structured prompt.
    Retries up to 3 times with exponential backoff to handle free-tier rate limits (429).
    """
    prompt = _build_system_prompt(payload)

    for attempt in range(3):
        try:
            response = _gemini_client.models.generate_content(
                model="gemini-3.5-flash",
                contents=prompt,
                config=genai_types.GenerateContentConfig(
                    temperature=0.4,
                    max_output_tokens=4096,
                ),
            )
            raw_text = response.text
            if not raw_text:
                print(f"[llm_interface] Attempt {attempt + 1}: response.text is None or empty. Retrying...")
                time.sleep(5)
                continue
            parsed = _parse_gemini_response(raw_text)
            # Validate required keys
            if "decision" in parsed:
                return parsed
            # If missing key, retry
            print(f"[llm_interface] Attempt {attempt + 1}: missing 'decision' key. Retrying...")
            time.sleep(3)
        except Exception as exc:
            exc_str = str(exc)
            if "429" in exc_str or "RESOURCE_EXHAUSTED" in exc_str:
                # Rate limit — wait 30 seconds for free tier quota reset
                wait_secs = 30
                print(f"[llm_interface] Rate limit hit (attempt {attempt + 1}). Waiting {wait_secs}s before retry...")
                time.sleep(wait_secs)
            else:
                print(f"[llm_interface] Gemini API error (attempt {attempt + 1}): {exc}")
                if attempt < 2:
                    time.sleep(2)

    # Safe fallback after all attempts failed
    return {
        "decision": "reject",
        "offer": {"value": None, "terms": ""},
        "reasoning": "[FALLBACK] Gemini unavailable after 3 attempts. Defaulting to reject.",
    }


# ---------------------------------------------------------------------------
# Mock / rule-based fallback
# ---------------------------------------------------------------------------
def _call_mock(payload: AgentInputPayload) -> Dict[str, Any]:
    """
    Deterministic rule-based response used in --mock mode or testing.
    Driven by the concession_hint if present; otherwise uses profile values.
    """
    hint = payload.concession_hint
    if hint:
        decision = hint.get("decision", "counter")
        rec_val = hint.get("recommended_offer")
        return {
            "decision": decision,
            "offer": {
                "value": rec_val if decision == "counter" else None,
                "terms": f"Based on concession engine (round {payload.negotiation_state.get('round_number', 1)}).",
            },
            "reasoning": hint.get("reasoning", "Mock mode — concession engine decision."),
        }

    # No hint available — simple role-based fallback
    profile = payload.profile
    state = payload.negotiation_state
    round_num = state.get("round_number", 1)
    opp = payload.opponent_offer
    opp_val = (opp.get("value") or opp.get("amount")) if opp else None

    target = profile.target_value
    walk = profile.walk_away_value
    is_buyer = "buyer" in profile.role.lower() or "budget" in profile.role.lower()

    if opp_val is None:
        # Opening offer
        offer_val = round(target * 0.85, 0) if is_buyer else round(target * 1.15, 0)
        return {"decision": "counter", "offer": {"value": offer_val, "terms": "Opening offer."}, "reasoning": "Mock: opening move."}

    if is_buyer:
        if float(opp_val) <= walk:
            return {"decision": "accept", "offer": {"value": None, "terms": ""}, "reasoning": f"Mock: {opp_val} within budget {walk}."}
        elif round_num >= 4:
            return {"decision": "reject", "offer": {"value": None, "terms": ""}, "reasoning": "Mock: too many rounds."}
        else:
            counter = round(walk * (0.80 + 0.05 * round_num), 0)
            return {"decision": "counter", "offer": {"value": counter, "terms": "Counteroffer."}, "reasoning": f"Mock: counter at {counter}."}
    else:
        if float(opp_val) >= walk:
            return {"decision": "accept", "offer": {"value": None, "terms": ""}, "reasoning": f"Mock: {opp_val} meets minimum {walk}."}
        elif round_num >= 4:
            return {"decision": "reject", "offer": {"value": None, "terms": ""}, "reasoning": "Mock: too many rounds."}
        else:
            counter = round(walk * (1.20 - 0.05 * round_num), 0)
            return {"decision": "counter", "offer": {"value": counter, "terms": "Counteroffer."}, "reasoning": f"Mock: counter at {counter}."}


# ---------------------------------------------------------------------------
# Public API — keep this signature stable
# ---------------------------------------------------------------------------
def generate_agent_response(payload: AgentInputPayload) -> Dict[str, Any]:
    """
    Main entry point. Returns a structured response dict:
    {
        "decision": "accept" | "counter" | "reject",
        "offer": { "value": <float|None>, "terms": <str> },
        "reasoning": <str>
    }

    Pass NEGOSIM_MOCK=1 as an environment variable (or run with --mock arg)
    to use the deterministic mock instead of Gemini.
    """
    use_mock = _MOCK_MODE or ("--mock" in sys.argv)
    if use_mock:
        return _call_mock(payload)
    return _call_gemini(payload)
