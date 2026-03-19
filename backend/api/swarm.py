"""
Swarm intelligence endpoint — 100-agent MiroFish simulation.

On first request: calls Anthropic API and saves result to backend/cache/swarm_cache.json.
On all subsequent requests: returns the cached result immediately.
Admin reset: POST /api/swarm/reset with X-Admin-Secret header deletes the cache.

The prompt is built dynamically: live ELO ratings and Monte Carlo probabilities are
injected into the seed-data section, replacing the static placeholder in the prompt file.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import anthropic
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

router = APIRouter()

PROMPT_FILE   = Path(__file__).resolve().parents[2] / "swarm-100-agent-prompt.txt"
CACHE_FILE    = Path(__file__).resolve().parents[2] / "backend" / "cache" / "swarm_cache.json"
DEFAULT_MODEL = "claude-sonnet-4-6"
MAX_TOKENS    = 5000

SEED_START = "=== SEED DATA: v7 ELO Ratings + Monte Carlo ==="
SEED_END   = "=== SIMULATION ==="


# ---------------------------------------------------------------------------
# Response model
# ---------------------------------------------------------------------------

class SwarmResponse(BaseModel):
    simulation_complete:   bool
    total_agents:          int
    rounds:                int
    round1_picks:          dict[str, int]
    round2_picks:          dict[str, int]
    final_consensus_probs: dict[str, float]
    key_talking_points:    list[str]
    emergent_narrative:    str
    swarm_winner:          str
    swarm_confidence:      str
    narrative:             str
    round_key_lines:       dict[str, list[dict]]
    cluster_membership:    list[dict] = []
    cached:                bool
    run_at:                str
    model_used:            str


class ResetResponse(BaseModel):
    reset: bool
    message: str


# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------

def _read_cache() -> Optional[dict]:
    if CACHE_FILE.exists():
        try:
            return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return None
    return None


def _write_cache(data: dict) -> None:
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _delete_cache() -> bool:
    if CACHE_FILE.exists():
        CACHE_FILE.unlink()
        return True
    return False


# ---------------------------------------------------------------------------
# Dynamic prompt builder
# ---------------------------------------------------------------------------

def _build_prompt() -> str:
    """
    Load the prompt template and replace the seed-data section with live
    ELO ratings and Monte Carlo win probabilities fetched from the model.
    """
    # Import here to avoid circular imports at module load time
    from backend.model.ratings import get_all_ratings, R16_MATCH_STATS
    from backend.model.monte_carlo import run_simulation, BracketState

    template = PROMPT_FILE.read_text(encoding="utf-8")

    # Fetch live data
    ratings = get_all_ratings()
    mc_probs = run_simulation(BracketState())  # ~50k sims

    qf_teams  = [r for r in ratings if not r.eliminated]
    elim_teams = [r for r in ratings if r.eliminated]

    lines = [SEED_START + "\n\n"]

    lines.append("QF TEAMS — ELO · UCL · DOM · KOH · QAWR · Monte Carlo (50k sims):\n")
    for r in sorted(qf_teams, key=lambda x: -x.elo):
        p = mc_probs.get(r.key, {})
        r16 = R16_MATCH_STATS.get(r.key, {})
        xg_d = r16.get("xg_for", 0) - r16.get("xg_against", 0)
        conv = r16.get("gf", 0) / r16.get("sot_for", 1) if r16.get("sot_for") else 0
        lines.append(
            f"{r.name}: ELO={r.elo:.0f} | UCL={r.ucl:.0f}/100 | DOM={r.dom:.0f}/100 | "
            f"KOH={r.koh_pct:.0f}/100 | QAWR={r.qawr:.3f} | "
            f"R16 xGD={xg_d:+.1f} | R16 conv={conv:.0%} | "
            f"MC win={p.get('winner', 0):.1f}% · final={p.get('final', 0):.1f}% · sf={p.get('sf', 0):.1f}%\n"
        )

    lines.append("\nR16 RESULTS (8 QF teams — both legs):\n")
    for r in sorted(qf_teams, key=lambda x: -x.elo):
        s = R16_MATCH_STATS.get(r.key, {})
        if s:
            lines.append(
                f"  {r.name} beat {s['opponent']} {s['agg']} agg "
                f"(xG {s['xg_for']:.1f}–{s['xg_against']:.1f} | SOT {s['sot_for']}–{s['sot_against']})\n"
            )

    lines.append("\nELIMINATED R16:\n")
    for r in elim_teams:
        s = R16_MATCH_STATS.get(r.key, {})
        agg = s.get("agg", "?") if s else "?"
        opp = s.get("opponent", "?") if s else "?"
        lines.append(f"  {r.name} — lost to {opp} {agg} agg\n")

    lines.append("\nCONFIRMED QF MATCHUPS:\n")
    lines.append("  QF1: PSG vs Liverpool\n")
    lines.append("  QF2: Real Madrid vs Bayern Munich\n")
    lines.append("  QF3: Barcelona vs Atletico Madrid\n")
    lines.append("  QF4: Sporting CP vs Arsenal\n")
    lines.append("\n")

    seed_block = "".join(lines)

    # Replace static seed section in template
    if SEED_START in template and SEED_END in template:
        before = template[: template.index(SEED_START)]
        after  = template[template.index(SEED_END):]
        return before + seed_block + after

    # Fallback — prepend to full template
    return seed_block + "\n" + template


# ---------------------------------------------------------------------------
# Claude call
# ---------------------------------------------------------------------------

def _extract_json(text: str) -> dict:
    """Find the first { ... } block in the response."""
    first = text.find("{")
    if first == -1:
        raise ValueError("No JSON block found in swarm response")
    depth, end = 0, -1
    for i, ch in enumerate(text[first:], start=first):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i
                break
    if end == -1:
        raise ValueError("Unbalanced JSON in swarm response")
    return json.loads(text[first:end + 1])


def _run_swarm_call(model: str) -> dict:
    """Call Claude with a dynamically-built prompt, parse response, return cacheable dict."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not set in environment")

    prompt_text = _build_prompt()

    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model=model,
        max_tokens=MAX_TOKENS,
        messages=[{"role": "user", "content": prompt_text}],
    )

    full_text: str = message.content[0].text

    try:
        parsed = _extract_json(full_text)
    except (ValueError, json.JSONDecodeError) as e:
        raise HTTPException(status_code=502, detail=f"Failed to parse swarm JSON: {e}")

    # Narrative = everything after the closing JSON brace
    first = full_text.find("{")
    depth, end = 0, -1
    for i, ch in enumerate(full_text[first:], start=first):
        if ch == "{": depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0: end = i; break
    narrative = full_text[end + 1:].strip() if end != -1 else ""

    # key_talking_points — fall back to empty list for old cache
    talking_points = parsed.get("key_talking_points", [])
    if not isinstance(talking_points, list):
        talking_points = []

    # round_key_lines — structured agent quotes per round
    raw_rkl = parsed.get("round_key_lines", {})
    if not isinstance(raw_rkl, dict):
        raw_rkl = {}
    round_key_lines = {
        "round1": raw_rkl.get("round1", []) if isinstance(raw_rkl.get("round1"), list) else [],
        "round2": raw_rkl.get("round2", []) if isinstance(raw_rkl.get("round2"), list) else [],
        "round3": raw_rkl.get("round3", []) if isinstance(raw_rkl.get("round3"), list) else [],
    }

    # cluster_membership — which agents were grouped together in round 2
    raw_clusters = parsed.get("cluster_assignments", [])
    cluster_membership = raw_clusters if isinstance(raw_clusters, list) else []

    # Normalize probs: Claude sometimes returns fractions (sum≈1) instead of percentages (sum≈100)
    raw_probs = parsed.get("final_consensus_probs", {})
    prob_total = sum(raw_probs.values()) if raw_probs else 0
    if prob_total < 2.0 and prob_total > 0:
        raw_probs = {k: round(v * 100, 1) for k, v in raw_probs.items()}

    return {
        "simulation_complete":   parsed.get("simulation_complete", True),
        "total_agents":          parsed.get("total_agents", 111),
        "rounds":                parsed.get("rounds", 3),
        "round1_picks":          parsed.get("round1_picks", {}),
        "round2_picks":          parsed.get("round2_picks", {}),
        "final_consensus_probs": raw_probs,
        "key_talking_points":    talking_points,
        "emergent_narrative":    parsed.get("emergent_narrative", ""),
        "swarm_winner":          parsed.get("swarm_winner", ""),
        "swarm_confidence":      parsed.get("swarm_confidence", "MED"),
        "narrative":             narrative,
        "round_key_lines":       round_key_lines,
        "cluster_membership":    cluster_membership,
        "cached":                False,
        "run_at":                datetime.now(timezone.utc).isoformat(),
        "model_used":            model,
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get(
    "/swarm",
    response_model=SwarmResponse,
    summary="100-agent swarm simulation (file-cached)",
)
def swarm_get(model: str = DEFAULT_MODEL):
    """
    Returns the 100-agent swarm simulation result.

    On first request: runs the simulation via Anthropic API (60-120s), saves to
    backend/cache/swarm_cache.json, and returns the result.

    On all subsequent requests: returns the cached result instantly.

    To force a fresh run, use POST /api/swarm/reset (admin only) then request again.
    """
    cached = _read_cache()
    if cached:
        # Ensure new fields present for backward compatibility
        cached.setdefault("key_talking_points", [])
        cached.setdefault("round_key_lines", {"round1": [], "round2": [], "round3": []})
        cached.setdefault("cluster_membership", [])
        cached["cached"] = True
        return SwarmResponse(**cached)

    try:
        data = _run_swarm_call(model)
    except anthropic.APIError as e:
        raise HTTPException(status_code=502, detail=f"Anthropic API error: {e}")

    _write_cache(data)
    return SwarmResponse(**data)


@router.post(
    "/swarm/reset",
    response_model=ResetResponse,
    summary="Delete swarm cache (admin only)",
)
def swarm_reset(x_admin_secret: Optional[str] = Header(default=None)):
    """
    Deletes the swarm cache file, allowing a fresh simulation run on next GET /api/swarm.

    Requires X-Admin-Secret header matching the ADMIN_SECRET environment variable.
    ADMIN_SECRET must be set in .env — there is no hardcoded fallback.
    """
    expected = os.environ.get("ADMIN_SECRET")
    if not expected:
        raise HTTPException(status_code=503, detail="ADMIN_SECRET not configured on server")

    if x_admin_secret != expected:
        raise HTTPException(status_code=403, detail="Invalid or missing X-Admin-Secret header")

    deleted = _delete_cache()
    return ResetResponse(
        reset=deleted,
        message="Cache deleted. Next GET /api/swarm will trigger a fresh simulation." if deleted
                else "No cache file found — nothing to delete.",
    )
