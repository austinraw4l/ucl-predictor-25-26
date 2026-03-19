from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.model.ratings import get_all_ratings, get_rating, TeamRating, ELIMINATED

router = APIRouter()


class TeamRatingResponse(BaseModel):
    key: str
    name: str
    elo: float
    elo_computed: float
    composite: float
    ucl: float
    dom: float
    sos: float
    koh_pct: float
    coeff: float
    qawr: float
    ko_hist_rate: float
    ko_raw_bonus: int
    ko_scaled_bonus: float
    dc_bonus: int
    dv6: int
    r16_delta: int
    eliminated: bool

    model_config = {"from_attributes": True}


def _to_response(r: TeamRating) -> TeamRatingResponse:
    return TeamRatingResponse(
        key=r.key,
        name=r.name,
        elo=r.elo,
        elo_computed=r.elo_computed,
        composite=r.composite,
        ucl=r.ucl,
        dom=r.dom,
        sos=r.sos,
        koh_pct=r.koh_pct,
        coeff=r.coeff,
        qawr=r.qawr,
        ko_hist_rate=r.ko_hist_rate,
        ko_raw_bonus=r.ko_raw_bonus,
        ko_scaled_bonus=r.ko_scaled_bonus,
        dc_bonus=r.dc_bonus,
        dv6=r.dv6,
        r16_delta=r.r16_delta,
        eliminated=r.eliminated,
    )


@router.get("/ratings", response_model=list[TeamRatingResponse], summary="All v7 team ratings")
def list_ratings():
    """Return all 16 teams sorted by ELO descending with full v7 breakdown."""
    return [_to_response(r) for r in get_all_ratings()]


@router.get("/ratings/{team_key}", response_model=TeamRatingResponse, summary="Single team rating")
def team_rating(team_key: str):
    """Return the v7 rating for a single team by key (e.g. 'Bayern', 'Arsenal')."""
    r = get_rating(team_key)
    if r is None:
        raise HTTPException(status_code=404, detail=f"Team '{team_key}' not found")
    return _to_response(r)
