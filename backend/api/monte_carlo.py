from __future__ import annotations

from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, model_validator

from backend.model.monte_carlo import (
    BracketState,
    DEFAULT_R16,
    N_SIMS,
    run_simulation,
    run_simulation_pre_r16,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class TieUpdate(BaseModel):
    """Partial update for a single R16 tie."""
    home:   str
    away:   str
    l1h:    Optional[int] = None
    l1a:    Optional[int] = None
    l2h:    Optional[int] = None
    l2a:    Optional[int] = None
    winner: Optional[str] = None

    @model_validator(mode="after")
    def winner_must_be_participant(self) -> "TieUpdate":
        if self.winner and self.winner not in (self.home, self.away):
            raise ValueError(f"winner '{self.winner}' is not a participant in this tie")
        return self


class MonteCarloRequest(BaseModel):
    """POST body — all fields optional. Unspecified ties keep their defaults."""
    r16:    Optional[dict[str, TieUpdate]] = None
    n_sims: Optional[int] = None  # override sim count (capped at 200_000)


class TeamProbs(BaseModel):
    qf:     float
    sf:     float
    final:  float
    winner: float


class MonteCarloResponse(BaseModel):
    n_sims:      int
    probabilities: dict[str, TeamProbs]
    # Sorted ranking by winner probability (descending)
    ranking:     list[str]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_state(req: MonteCarloRequest | None) -> BracketState:
    """Merge request overrides onto a fresh copy of DEFAULT_R16."""
    base = {k: dict(v) for k, v in DEFAULT_R16.items()}

    if req and req.r16:
        for tie_id, upd in req.r16.items():
            if tie_id not in base:
                # Unknown tie id — ignore gracefully
                continue
            entry = dict(upd.model_dump(exclude_none=True))
            base[tie_id].update(entry)

    return BracketState(r16=base)


def _to_response(probs: dict[str, dict], n: int) -> MonteCarloResponse:
    ranking = sorted(probs, key=lambda k: probs[k]["winner"], reverse=True)
    return MonteCarloResponse(
        n_sims=n,
        probabilities={k: TeamProbs(**v) for k, v in probs.items()},
        ranking=ranking,
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get(
    "/monte-carlo",
    response_model=MonteCarloResponse,
    summary="Run 50k Monte Carlo simulation with default bracket state",
)
def monte_carlo_get():
    """Run 50,000 simulations using the current default R16 state."""
    state = BracketState()
    probs = run_simulation(state, n=N_SIMS)
    return _to_response(probs, N_SIMS)


@router.get(
    "/monte-carlo/pre-r16",
    response_model=MonteCarloResponse,
    summary="Run 50k MC with pre-R16 ELOs and no known results (model prediction basis)",
)
def monte_carlo_pre_r16():
    """
    Run 50,000 simulations using pre-R16 ELO values and a fully open bracket
    (no confirmed R16 winners or leg scores). Used to power the Model Prediction
    bracket view, which shows what the model would have predicted before 17 Mar 2026.
    """
    probs = run_simulation_pre_r16(N_SIMS)
    return _to_response(probs, N_SIMS)


@router.post(
    "/monte-carlo",
    response_model=MonteCarloResponse,
    summary="Run Monte Carlo with updated bracket state",
)
def monte_carlo_post(req: MonteCarloRequest):
    """
    Run simulations with an updated bracket state. Any R16 ties not included
    in the request body keep their default values from 17 March 2026.

    Example body — mark Arsenal as confirmed R16 winner:
    ```json
    {
      "r16": {
        "Lev_Arsenal": {"home": "Leverkusen", "away": "Arsenal", "winner": "Arsenal"}
      }
    }
    ```
    """
    n = min(req.n_sims or N_SIMS, 200_000)
    state = _build_state(req)
    probs = run_simulation(state, n=n)
    return _to_response(probs, n)
