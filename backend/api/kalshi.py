"""
Kalshi integration — fetches live UCL 2025-26 prediction market prices.

Markets used:
  KXUCL-26-*          winner markets  (16 teams)
  KXUCLFINALIST-26-*  finalist markets (15 teams, no BOG 26 equivalent found)
  KXUCLADVANCE-26*    R16 advance markets (tonight's second legs)

Price convention: yes_bid_dollars ∈ [0, 1] ≈ implied probability.
Falls back to last_price_dollars for illiquid markets (bid = 0).
"""

from __future__ import annotations

import asyncio
import time
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

# ---------------------------------------------------------------------------
# Kalshi API
# ---------------------------------------------------------------------------

KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2"
TIMEOUT = 12.0  # seconds per request

# Ticker suffix → our team key
WINNER_SUFFIX_MAP: dict[str, str] = {
    "ARS": "Arsenal",
    "BMU": "Bayern",
    "RMA": "RealMadrid",
    "PSG": "PSG",
    "BAR": "Barcelona",
    "LFC": "Liverpool",
    "ATM": "Atletico",
    "SPO": "Sporting",
    "BOG": "Bodo",
    "NEW": "Newcastle",
    "MCI": "ManCity",
    "LEV": "Leverkusen",
    "CHE": "Chelsea",
    "GAL": "Galatasaray",
    "TOT": "Tottenham",
    "ATA": "Atalanta",
}

# ---------------------------------------------------------------------------
# In-memory cache (5 min TTL — markets update infrequently)
# ---------------------------------------------------------------------------

_CACHE: dict = {}
_CACHE_TTL = 300


def _cache_get(key: str) -> Optional[dict]:
    entry = _CACHE.get(key)
    if entry and (time.time() - entry["ts"]) < _CACHE_TTL:
        return entry["data"]
    return None


def _cache_set(key: str, data: dict) -> None:
    _CACHE[key] = {"ts": time.time(), "data": data}


# ---------------------------------------------------------------------------
# Fetch helpers
# ---------------------------------------------------------------------------

def _best_price(market: dict) -> float:
    """
    Return the best available probability estimate for a YES contract.
    Priority: yes_bid > last_price > 0.01.
    All values are in dollars (0.0–1.0).
    """
    bid = market.get("yes_bid_dollars")
    last = market.get("last_price_dollars")

    if bid and float(bid) > 0:
        return float(bid)
    if last and float(last) > 0.01:
        return float(last)
    return 0.01  # floor: market exists but no liquidity


def _normalise(raw: dict[str, float]) -> dict[str, float]:
    """
    Normalise a {team: prob} dict so values sum to 100.
    Kalshi markets are independent so raw sum ≠ 100.
    """
    total = sum(raw.values())
    if total == 0:
        return raw
    factor = 100.0 / total
    return {k: round(v * factor, 2) for k, v in raw.items()}


async def _fetch_series(series_ticker: str, client: httpx.AsyncClient) -> list[dict]:
    """Return all active markets in a series (handles pagination)."""
    markets: list[dict] = []
    cursor: Optional[str] = None

    while True:
        params: dict = {"series_ticker": series_ticker, "limit": 100}
        if cursor:
            params["cursor"] = cursor

        resp = await client.get(f"{KALSHI_BASE}/markets", params=params, timeout=TIMEOUT)
        resp.raise_for_status()
        body = resp.json()

        for m in body.get("markets", []):
            if m.get("status") in ("active", "open"):
                markets.append(m)

        cursor = body.get("cursor")
        if not cursor:
            break

    return markets


# ---------------------------------------------------------------------------
# Core data fetch
# ---------------------------------------------------------------------------

async def _fetch_all() -> dict:
    """Fetch winner, finalist, and R16-advance markets concurrently."""
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        winner_task   = asyncio.create_task(_fetch_series("KXUCL",          client))
        finalist_task = asyncio.create_task(_fetch_series("KXUCLFINALIST",  client))
        advance_task  = asyncio.create_task(_fetch_series("KXUCLADVANCE",   client))

        winner_markets, finalist_markets, advance_markets = await asyncio.gather(
            winner_task, finalist_task, advance_task
        )

    # ── Winner probabilities ──────────────────────────────────────────────
    winner_raw: dict[str, float] = {}
    winner_detail: dict[str, dict] = {}

    for m in winner_markets:
        suffix = m["ticker"].replace("KXUCL-26-", "")
        team = WINNER_SUFFIX_MAP.get(suffix)
        if not team:
            continue
        price = _best_price(m)
        winner_raw[team] = price * 100  # → percentage
        winner_detail[team] = {
            "ticker":     m["ticker"],
            "subtitle":   m.get("yes_sub_title", ""),
            "yes_bid":    m.get("yes_bid_dollars"),
            "yes_ask":    m.get("yes_ask_dollars"),
            "last_price": m.get("last_price_dollars"),
            "raw_prob":   round(price * 100, 2),
        }

    winner_normalised = _normalise(winner_raw)

    # ── Finalist probabilities ────────────────────────────────────────────
    finalist_raw: dict[str, float] = {}
    for m in finalist_markets:
        suffix = m["ticker"].replace("KXUCLFINALIST-26-", "")
        team = WINNER_SUFFIX_MAP.get(suffix)
        if not team:
            continue
        finalist_raw[team] = _best_price(m) * 100

    finalist_normalised = _normalise(finalist_raw)

    # ── R16 advance (tonight's second legs) ───────────────────────────────
    r16_advance: dict[str, dict] = {}
    for m in advance_markets:
        # Ticker format: KXUCLADVANCE-26MAR18BARNEW-BAR
        ticker = m["ticker"]
        suffix = ticker.split("-")[-1]   # last segment = team suffix
        team = WINNER_SUFFIX_MAP.get(suffix)
        if not team:
            continue
        price = _best_price(m)
        r16_advance[team] = {
            "ticker":    ticker,
            "subtitle":  m.get("yes_sub_title", ""),
            "yes_bid":   m.get("yes_bid_dollars"),
            "yes_ask":   m.get("yes_ask_dollars"),
            "last_price": m.get("last_price_dollars"),
            "advance_prob": round(price * 100, 2),
        }

    return {
        "winner":             winner_normalised,
        "winner_raw":         {t: d["raw_prob"] for t, d in winner_detail.items()},
        "winner_detail":      winner_detail,
        "finalist":           finalist_normalised,
        "finalist_raw":       finalist_raw,
        "r16_advance":        r16_advance,
        "fetched_at":         time.time(),
    }


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class WinnerDetail(BaseModel):
    ticker:     str
    subtitle:   str
    yes_bid:    Optional[str]
    yes_ask:    Optional[str]
    last_price: Optional[str]
    raw_prob:   float   # raw bid/last × 100, before normalisation


class KalshiResponse(BaseModel):
    # Winner markets
    winner_probs:        dict[str, float]   # normalised, sums to 100
    winner_raw_probs:    dict[str, float]   # raw (sum ≠ 100, reflects actual vig)
    winner_detail:       dict[str, WinnerDetail]

    # Finalist markets
    finalist_probs:      dict[str, float]   # normalised
    finalist_raw_probs:  dict[str, float]

    # R16 tonight
    r16_advance:         dict[str, dict]    # team → {ticker, advance_prob, ...}

    # Meta
    cached:       bool
    fetched_at:   float


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.get(
    "/kalshi",
    response_model=KalshiResponse,
    summary="Fetch live Kalshi UCL 2025-26 market prices",
)
async def kalshi_get(refresh: bool = False):
    """
    Returns live Kalshi prediction market prices for UCL 2025-26:

    - **winner_probs**: UCL winner market prices, normalised to sum to 100%.
    - **winner_raw_probs**: Raw bid prices (pre-normalisation). Sum reflects the
      market's implied over-round.
    - **finalist_probs**: Normalised finalist (reach final) market prices.
    - **r16_advance**: Tonight's R16 second-leg advance markets.
    - Results are **cached for 5 minutes**. Pass `?refresh=true` to force a fetch.

    Price source priority: `yes_bid > last_price > 0.01` (floor for illiquid markets).
    """
    cache_key = "kalshi"
    if not refresh:
        cached = _cache_get(cache_key)
        if cached:
            return KalshiResponse(
                winner_probs=cached["winner"],
                winner_raw_probs=cached["winner_raw"],
                winner_detail={k: WinnerDetail(**v) for k, v in cached["winner_detail"].items()},
                finalist_probs=cached["finalist"],
                finalist_raw_probs=cached["finalist_raw"],
                r16_advance=cached["r16_advance"],
                cached=True,
                fetched_at=cached["fetched_at"],
            )

    try:
        data = await _fetch_all()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Kalshi API error: {e.response.status_code}")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Kalshi connection error: {e}")

    _cache_set(cache_key, data)

    return KalshiResponse(
        winner_probs=data["winner"],
        winner_raw_probs=data["winner_raw"],
        winner_detail={k: WinnerDetail(**v) for k, v in data["winner_detail"].items()},
        finalist_probs=data["finalist"],
        finalist_raw_probs=data["finalist_raw"],
        r16_advance=data["r16_advance"],
        cached=False,
        fetched_at=data["fetched_at"],
    )
