"""
/api/compare — side-by-side comparison of all three models + Kalshi.

Returns per-team winner probabilities from:
  - Monte Carlo (v7 ELO Poisson simulation)
  - Swarm intelligence (cached if available, skipped if not run yet)
  - Kalshi prediction markets

Plus gap analysis: model vs market delta for each team.
"""

from __future__ import annotations

import asyncio
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from backend.model.monte_carlo import BracketState, run_simulation, N_SIMS
from backend.api.kalshi import _fetch_all, _cache_get as kalshi_cache_get, _cache_set as kalshi_cache_set
from backend.api.swarm import _read_cache as swarm_read_cache

router = APIRouter()

# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class TeamCompare(BaseModel):
    name:           str
    elo:            float
    mc_winner:      float           # Monte Carlo winner %
    mc_final:       float           # Monte Carlo reach-final %
    kalshi_winner:  Optional[float] # Kalshi normalised winner %
    kalshi_finalist: Optional[float]
    swarm_winner:   Optional[float] # Swarm winner % (null if not run)
    # Gaps: positive = model thinks team is undervalued vs market
    mc_vs_kalshi:   Optional[float]  # mc_winner - kalshi_winner
    swarm_vs_kalshi: Optional[float]


class CompareResponse(BaseModel):
    teams:          list[TeamCompare]
    # Sorted rankings by each source
    mc_ranking:     list[str]
    kalshi_ranking: list[str]
    swarm_ranking:  Optional[list[str]]
    # Meta
    mc_n_sims:      int
    swarm_available: bool
    kalshi_cached:  bool


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.get(
    "/compare",
    response_model=CompareResponse,
    summary="All three models side-by-side with gap analysis",
)
async def compare(refresh_kalshi: bool = False):
    """
    Aggregates Monte Carlo, Swarm, and Kalshi into one comparison response.

    - Monte Carlo always runs fresh (fast — ~0.5s).
    - Kalshi is fetched live (5-min cache). Pass `?refresh_kalshi=true` to force.
    - Swarm uses whatever is in the 1-hour cache; shows `null` if never run.
      Hit `GET /api/swarm` first to populate the swarm cache.
    """
    from backend.model.ratings import TEAMS

    # ── Run Monte Carlo + fetch Kalshi concurrently ──────────────────────
    mc_task = asyncio.get_event_loop().run_in_executor(
        None, lambda: run_simulation(BracketState(), n=N_SIMS)
    )

    # Kalshi: use cache unless refresh requested
    if not refresh_kalshi:
        kalshi_data = kalshi_cache_get("kalshi")
        kalshi_cached = kalshi_data is not None
        if kalshi_data is None:
            kalshi_data = await _fetch_all()
            kalshi_cache_set("kalshi", kalshi_data)
            kalshi_cached = False
    else:
        kalshi_data = await _fetch_all()
        kalshi_cache_set("kalshi", kalshi_data)
        kalshi_cached = False

    mc_probs = await mc_task

    # ── Swarm: read from cache file if available ─────────────────────────
    swarm_data = swarm_read_cache()
    swarm_winner: Optional[dict[str, float]] = swarm_data.get("final_consensus_probs") if swarm_data else None

    kalshi_winner  = kalshi_data.get("winner", {})
    kalshi_finalist = kalshi_data.get("finalist", {})

    # ── Build per-team rows ───────────────────────────────────────────────
    rows: list[TeamCompare] = []
    for key, t in TEAMS.items():
        mc_w   = mc_probs[key]["winner"]
        mc_f   = mc_probs[key]["final"]
        kal_w  = kalshi_winner.get(key)
        kal_f  = kalshi_finalist.get(key)
        sw_w   = swarm_winner.get(key) if swarm_winner else None

        mc_vs_k   = round(mc_w - kal_w, 2)   if kal_w  is not None else None
        sw_vs_k   = round(sw_w - kal_w, 2)   if (sw_w is not None and kal_w is not None) else None

        rows.append(TeamCompare(
            name=t["name"],
            elo=t["elo"],
            mc_winner=mc_w,
            mc_final=mc_f,
            kalshi_winner=kal_w,
            kalshi_finalist=kal_f,
            swarm_winner=sw_w,
            mc_vs_kalshi=mc_vs_k,
            swarm_vs_kalshi=sw_vs_k,
        ))

    rows.sort(key=lambda r: r.mc_winner, reverse=True)

    mc_ranking     = [r.name for r in sorted(rows, key=lambda r: r.mc_winner,    reverse=True)]
    kalshi_ranking = [r.name for r in sorted(rows, key=lambda r: r.kalshi_winner or 0, reverse=True)]
    swarm_ranking  = (
        [r.name for r in sorted(rows, key=lambda r: r.swarm_winner or 0, reverse=True)]
        if swarm_winner else None
    )

    return CompareResponse(
        teams=rows,
        mc_ranking=mc_ranking,
        kalshi_ranking=kalshi_ranking,
        swarm_ranking=swarm_ranking,
        mc_n_sims=N_SIMS,
        swarm_available=swarm_winner is not None,
        kalshi_cached=kalshi_cached,
    )
