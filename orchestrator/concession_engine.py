"""
concession_engine.py
====================
Deterministic, testable module that computes numeric concession boundaries
for each agent turn. The LLM uses these boundaries to phrase its actual offer —
keeping negotiation math predictable and verifiable without needing a live API call.

Personalities:
  - aggressive   : concedes slowly, max 5% per round, walk-away buffer 5%
  - collaborative: concedes readily, up to 12% per round, walk-away buffer 15%
  - risk-averse  : small cautious steps, max 8% per round, walk-away buffer 10%

Direction:
  Buyers   want LOWER prices  → target < walk_away; starting offer = target * 0.85
  Vendors  want HIGHER prices → target > walk_away; starting offer = target * 1.15
  (or any role where is_buyer=True/False is set)
"""

from dataclasses import dataclass
from typing import Dict, Any

# Personality config: max_concession_rate, walk_away_buffer, reluctance
PERSONALITY_CONFIG: Dict[str, Dict[str, float]] = {
    "aggressive": {
        "max_concession_pct": 0.05,   # max 5% move per round
        "walk_away_buffer":   0.05,   # must stay 5% above walk-away
        "reject_threshold":   0.90,   # reject if gap > 90% of total range remains after round 3
    },
    "collaborative": {
        "max_concession_pct": 0.12,
        "walk_away_buffer":   0.15,
        "reject_threshold":   0.70,
    },
    "risk-averse": {
        "max_concession_pct": 0.08,
        "walk_away_buffer":   0.10,
        "reject_threshold":   0.80,
    },
    # fallback
    "balanced": {
        "max_concession_pct": 0.08,
        "walk_away_buffer":   0.10,
        "reject_threshold":   0.80,
    },
}


@dataclass
class ConcessionHint:
    """
    Output of the concession engine — numeric boundaries fed to the LLM.
    The LLM must keep its offer within [min_offer, max_offer].
    """
    recommended_offer: float    # the engine's suggested numeric value
    min_offer: float            # absolute floor (the walk-away point, buffered)
    max_offer: float            # ceiling (should not concede beyond this)
    decision: str               # "counter" | "accept" | "reject" — preliminary guidance
    reasoning: str              # brief explanation for log context

    def to_dict(self) -> Dict[str, Any]:
        return {
            "recommended_offer": self.recommended_offer,
            "min_offer": self.min_offer,
            "max_offer": self.max_offer,
            "decision": self.decision,
            "reasoning": self.reasoning,
        }


class ConcessionEngine:
    """
    Computes a ConcessionHint for an agent's upcoming turn.

    Parameters
    ----------
    target_value    : The agent's ideal outcome (e.g. buyer wants 600 000, vendor wants 900 000).
    walk_away_value : The absolute limit (e.g. buyer max budget 800 000, vendor min price 700 000).
    personality     : "aggressive" | "collaborative" | "risk-averse" | "balanced".
    is_buyer        : True if this agent benefits from LOWER values (e.g. buyer, budget-holder).
                      False if this agent benefits from HIGHER values (e.g. vendor, seller).
    """

    def __init__(
        self,
        target_value: float,
        walk_away_value: float,
        personality: str = "collaborative",
        is_buyer: bool = True,
    ):
        self.target = target_value
        self.walk_away = walk_away_value
        self.personality = personality.lower()
        self.is_buyer = is_buyer
        self.cfg = PERSONALITY_CONFIG.get(self.personality, PERSONALITY_CONFIG["balanced"])

    def _opening_offer(self) -> float:
        """
        Generates the agent's first offer — anchored away from their target
        to leave room to negotiate.
        """
        if self.is_buyer:
            # Buyer opens low — 15% below their target value
            return round(self.target * 0.85, 2)
        else:
            # Vendor opens high — 15% above their target value
            return round(self.target * 1.15, 2)

    def _buffered_walk_away(self) -> float:
        """
        Computes the effective walk-away with a personality-specific buffer
        so the agent doesn't hit their hard limit immediately.
        """
        buf = self.cfg["walk_away_buffer"]
        if self.is_buyer:
            # Buyer's effective limit is a bit below their true walk-away
            return round(self.walk_away * (1 - buf), 2)
        else:
            # Vendor's effective limit is a bit above their true walk-away
            return round(self.walk_away * (1 + buf), 2)

    def evaluate(
        self,
        round_number: int,
        opponent_offer: float | None,
        max_rounds: int = 5,
    ) -> ConcessionHint:
        """
        Core logic. Evaluates the current situation and returns a ConcessionHint.

        round_number   : current round (1-indexed)
        opponent_offer : the numeric value proposed by the opponent, or None for opening move
        max_rounds     : how many rounds are allowed before forced termination
        """
        # --- Opening move (no opponent offer yet) ---
        if opponent_offer is None:
            opening = self._opening_offer()
            if self.is_buyer:
                return ConcessionHint(
                    recommended_offer=opening,
                    min_offer=self.target,
                    max_offer=self.walk_away,
                    decision="counter",
                    reasoning=f"Opening offer of {opening:,.0f} — anchored 15% below target to leave room to negotiate.",
                )
            else:
                return ConcessionHint(
                    recommended_offer=opening,
                    min_offer=self.walk_away,
                    max_offer=opening,
                    decision="counter",
                    reasoning=f"Opening ask of {opening:,.0f} — anchored 15% above target.",
                )

        # --- Check if opponent offer is acceptable ---
        if self.is_buyer:
            # Buyer accepts if opponent price ≤ walk-away budget
            if opponent_offer <= self.walk_away:
                return ConcessionHint(
                    recommended_offer=opponent_offer,
                    min_offer=self.target,
                    max_offer=self.walk_away,
                    decision="accept",
                    reasoning=f"Offer of {opponent_offer:,.0f} is within budget ({self.walk_away:,.0f}). Accept.",
                )
        else:
            # Vendor accepts if opponent price ≥ walk-away minimum
            if opponent_offer >= self.walk_away:
                return ConcessionHint(
                    recommended_offer=opponent_offer,
                    min_offer=self.walk_away,
                    max_offer=self.target,
                    decision="accept",
                    reasoning=f"Offer of {opponent_offer:,.0f} meets minimum ({self.walk_away:,.0f}). Accept.",
                )

        # --- Check if max rounds reached → force reject ---
        if round_number >= max_rounds:
            return ConcessionHint(
                recommended_offer=opponent_offer,
                min_offer=self.walk_away if not self.is_buyer else self.target,
                max_offer=self.walk_away if self.is_buyer else self.target,
                decision="reject",
                reasoning=f"Round {round_number} of {max_rounds} — gap still too large. Terminating.",
            )

        # --- Compute a counteroffer via concession function ---
        # How far along are we in the negotiation? (0.0 → 1.0)
        progress = (round_number - 1) / max(max_rounds - 1, 1)

        # Start from the opening position and concede proportionally
        opening = self._opening_offer()
        if self.is_buyer:
            # Buyer moves UP from opening toward walk_away
            max_movement = self.walk_away - opening
            concession = max_movement * progress * self.cfg["max_concession_pct"] * 10
            new_offer = min(opening + concession, self.walk_away * 0.97)
        else:
            # Vendor moves DOWN from opening toward walk_away
            max_movement = opening - self.walk_away
            concession = max_movement * progress * self.cfg["max_concession_pct"] * 10
            new_offer = max(opening - concession, self.walk_away * 1.03)

        new_offer = round(new_offer, 2)

        if self.is_buyer:
            return ConcessionHint(
                recommended_offer=new_offer,
                min_offer=self.target,
                max_offer=self.walk_away,
                decision="counter",
                reasoning=f"Round {round_number}: conceding to {new_offer:,.0f} (from {opening:,.0f} toward {self.walk_away:,.0f}).",
            )
        else:
            return ConcessionHint(
                recommended_offer=new_offer,
                min_offer=self.walk_away,
                max_offer=self.target,
                decision="counter",
                reasoning=f"Round {round_number}: conceding down to {new_offer:,.0f} (from {opening:,.0f} toward {self.walk_away:,.0f}).",
            )
