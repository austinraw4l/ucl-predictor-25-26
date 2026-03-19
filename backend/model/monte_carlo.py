"""
Monte Carlo simulation engine for UCL 2025-26.

Runs 50,000 fully vectorised tournament simulations using a Poisson goal model
calibrated to the v7 ELO ratings. Handles partial bracket state (known leg-1
results, confirmed R16 winners) as well as fully open ties.
"""

from __future__ import annotations

import numpy as np
from dataclasses import dataclass, field
from typing import Optional

from backend.model.ratings import TEAMS

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

N_SIMS = 50_000
BASE_LAMBDA = 1.35  # per-team per-leg goal rate at 50/50 strength

# Ordered team list so we can use integer indices in numpy arrays
TEAM_KEYS = list(TEAMS.keys())
TEAM_IDX: dict[str, int] = {k: i for i, k in enumerate(TEAM_KEYS)}
ELO_ARR = np.array([TEAMS[k]["elo"] for k in TEAM_KEYS], dtype=float)

# ---------------------------------------------------------------------------
# Default bracket state — updated 18 Mar 2026 after second legs
# ---------------------------------------------------------------------------

# Tie format:
#   home / away   — team keys for leg-1 home/away
#   l1h / l1a     — leg-1 goals
#   l2h / l2a     — leg-2 goals (leg-2 home = the leg-1 away team's ground)
#   winner        — confirmed team key
#
# Aggregate logic in _resolve_r16_tie:
#   agg_home (leg-1 home team) = l1h + l2a
#   agg_away (leg-1 away team) = l1a + l2h

DEFAULT_R16: dict[str, dict] = {
    # CONFIRMED — PSG beat Chelsea 3-0 (leg 2), 8-2 on agg
    "PSG_Chelsea":     {"home": "PSG",        "away": "Chelsea",
                        "l1h": 5, "l1a": 2, "l2h": 0, "l2a": 3, "winner": "PSG"},
    # CONFIRMED — Liverpool beat Galatasaray 2-0 (leg 2), 2-1 on agg
    "Gala_Liverpool":  {"home": "Galatasaray", "away": "Liverpool",  "l1h": 1, "l1a": 0, "l2h": 0, "l2a": 2, "winner": "Liverpool"},
    # CONFIRMED — Real Madrid beat Man City 2-1 (leg 2), 5-1 on agg
    "Real_ManCity":    {"home": "RealMadrid",  "away": "ManCity",
                        "l1h": 3, "l1a": 0, "l2h": 1, "l2a": 2, "winner": "RealMadrid"},
    # CONFIRMED — Bayern beat Atalanta 3-0 (leg 2), 9-1 on agg
    "Atalanta_Bayern": {"home": "Atalanta",    "away": "Bayern",     "l1h": 1, "l1a": 6, "l2h": 0, "l2a": 3, "winner": "Bayern"},
    # CONFIRMED — Barcelona beat Newcastle 1-0 (leg 2), 2-1 on agg
    "Newcastle_Barca": {"home": "Newcastle",   "away": "Barcelona",
                        "l1h": 1, "l1a": 1, "l2h": 0, "l2a": 1, "winner": "Barcelona"},
    # CONFIRMED — Atletico beat Tottenham (5-2 on agg after leg 2)
    "Atletico_Spurs":  {"home": "Atletico",    "away": "Tottenham",  "l1h": 5, "l1a": 2, "winner": "Atletico"},
    # CONFIRMED — Sporting beat Bodø/Glimt 5-3 on agg
    "Sporting_Bodo":   {"home": "Sporting",    "away": "Bodo",
                        "l1h": 0, "l1a": 3, "l2h": 5, "l2a": 0, "winner": "Sporting"},
    # CONFIRMED — Arsenal beat Leverkusen 2-0 (leg 2), 3-1 on agg
    "Lev_Arsenal":     {"home": "Leverkusen",  "away": "Arsenal",
                        "l1h": 1, "l1a": 1, "l2h": 2, "l2a": 0, "winner": "Arsenal"},
}

# ---------------------------------------------------------------------------
# Pre-R16 data — ELOs before K=32 updates from R16 second legs (17 Mar 2026)
# ---------------------------------------------------------------------------

PRE_R16_ELO: dict[str, int] = {
    "Bayern":      2240, "Arsenal":     2210, "RealMadrid":  1953,
    "Liverpool":   1931, "Barcelona":   1911, "PSG":         1893,
    "Leverkusen":  1898, "Newcastle":   1871, "ManCity":     1844,
    "Chelsea":     1825, "Atletico":    1817, "Tottenham":   1815,
    "Bodo":        1786, "Sporting":    1745, "Atalanta":    1703,
    "Galatasaray": 1665,
}

# R16 ties with home/away only — no confirmed winners or leg scores
PRE_R16_TIES: dict[str, dict] = {
    "PSG_Chelsea":     {"home": "PSG",        "away": "Chelsea"},
    "Gala_Liverpool":  {"home": "Galatasaray","away": "Liverpool"},
    "Real_ManCity":    {"home": "RealMadrid", "away": "ManCity"},
    "Atalanta_Bayern": {"home": "Atalanta",   "away": "Bayern"},
    "Newcastle_Barca": {"home": "Newcastle",  "away": "Barcelona"},
    "Atletico_Spurs":  {"home": "Atletico",   "away": "Tottenham"},
    "Sporting_Bodo":   {"home": "Sporting",   "away": "Bodo"},
    "Lev_Arsenal":     {"home": "Leverkusen", "away": "Arsenal"},
}


# QF bracket: which two R16 ties feed each QF slot
# QF winner[i] and QF winner[i+1] meet in SF (0v1, 2v3)
QF_BRACKET: list[tuple[str, str]] = [
    ("PSG_Chelsea",    "Gala_Liverpool"),   # QF1 → feeds SF1
    ("Real_ManCity",   "Atalanta_Bayern"),  # QF2 → feeds SF1
    ("Newcastle_Barca","Atletico_Spurs"),   # QF3 → feeds SF2
    ("Sporting_Bodo",  "Lev_Arsenal"),      # QF4 → feeds SF2
]
# SF pairs: SF1 = QF1 winner vs QF2 winner, SF2 = QF3 winner vs QF4 winner
# Final: SF1 winner vs SF2 winner


# ---------------------------------------------------------------------------
# Core probability / goal helpers  (vectorised)
# ---------------------------------------------------------------------------

def _elo_prob(elo_a: np.ndarray | float, elo_b: np.ndarray | float) -> np.ndarray:
    """P(team_a wins) given ELO values. Accepts scalars or shape-(n,) arrays."""
    return 1.0 / (1.0 + 10.0 ** ((elo_b - elo_a) / 400.0))


def _sim_two_legs(
    idx_a: np.ndarray,          # shape (n,) int — team-a index per sim
    idx_b: np.ndarray,          # shape (n,) int — team-b index per sim
    n: int,
    known_l1a: Optional[int] = None,  # fixed leg-1 goals for team_a (home)
    known_l1b: Optional[int] = None,  # fixed leg-1 goals for team_b (away)
    known_l2a: Optional[int] = None,  # fixed leg-2 goals for team_a (away)
    known_l2b: Optional[int] = None,  # fixed leg-2 goals for team_b (home)
) -> np.ndarray:
    """
    Simulate a two-legged knockout tie for n independent sims.
    team_a is the leg-1 HOME team.  Returns bool array: True = team_a advances.

    Lambda formula from v7 spec:
      lam_a1 = 2 * BASE * p_a          (team_a at home, leg 1)
      lam_b1 = 2 * BASE * (1 - p_a)   (team_b away,    leg 1)
      lam_a2 = 2 * BASE * (1 - p_a)   (team_a away,    leg 2)
      lam_b2 = 2 * BASE * p_a          (team_b at home, leg 2)
    """
    elo_a = ELO_ARR[idx_a]
    elo_b = ELO_ARR[idx_b]
    p_a = _elo_prob(elo_a, elo_b)  # shape (n,)

    # Leg 1
    if known_l1a is None:
        lam_a1 = 2.0 * BASE_LAMBDA * p_a
        lam_b1 = 2.0 * BASE_LAMBDA * (1.0 - p_a)
        g_a1 = np.random.poisson(lam_a1)  # numpy draws one sample per lambda
        g_b1 = np.random.poisson(lam_b1)
    else:
        g_a1 = np.full(n, known_l1a, dtype=int)
        g_b1 = np.full(n, known_l1b, dtype=int)

    # Leg 2
    if known_l2a is None:
        lam_a2 = 2.0 * BASE_LAMBDA * (1.0 - p_a)
        lam_b2 = 2.0 * BASE_LAMBDA * p_a
        g_a2 = np.random.poisson(lam_a2)
        g_b2 = np.random.poisson(lam_b2)
    else:
        g_a2 = np.full(n, known_l2a, dtype=int)
        g_b2 = np.full(n, known_l2b, dtype=int)

    agg_a = g_a1 + g_a2
    agg_b = g_b1 + g_b2

    # Penalties on aggregate draw: ELO-weighted coin flip
    pen_a_wins = np.random.random(n) < p_a
    team_a_advances = (agg_a > agg_b) | ((agg_a == agg_b) & pen_a_wins)
    return team_a_advances


def _sim_single_game(
    idx_a: np.ndarray,
    idx_b: np.ndarray,
    n: int,
) -> np.ndarray:
    """Final: single game, pure ELO coin flip. Returns True = team_a wins."""
    elo_a = ELO_ARR[idx_a]
    elo_b = ELO_ARR[idx_b]
    p_a = _elo_prob(elo_a, elo_b)
    return np.random.random(n) < p_a


# ---------------------------------------------------------------------------
# R16 tie resolution
# ---------------------------------------------------------------------------

def _resolve_r16_tie(tie: dict, n: int) -> np.ndarray:
    """
    Return bool array of length n: True = home team (leg-1 home) advances.
    Handles confirmed winners, both-legs-played, leg-1-only, and no-legs-played.
    """
    home, away = tie["home"], tie["away"]
    h_idx = np.full(n, TEAM_IDX[home], dtype=int)
    a_idx = np.full(n, TEAM_IDX[away], dtype=int)

    # Confirmed winner
    if tie.get("winner"):
        return np.full(n, tie["winner"] == home, dtype=bool)

    l1h = tie.get("l1h")
    l1a = tie.get("l1a")
    l2h = tie.get("l2h")
    l2a = tie.get("l2a")

    # Both legs played but no explicit winner → compute from aggregate
    if l2h is not None and l2a is not None:
        agg_home = l1h + l2a  # home team aggregate
        agg_away = l1a + l2h  # away team aggregate
        if agg_home > agg_away:
            return np.full(n, True, dtype=bool)
        if agg_away > agg_home:
            return np.full(n, False, dtype=bool)
        # Aggregate level → probabilistic penalties
        p_home = _elo_prob(ELO_ARR[TEAM_IDX[home]], ELO_ARR[TEAM_IDX[away]])
        return np.random.random(n) < p_home

    # Leg 1 known, leg 2 not yet played
    if l1h is not None and l2h is None:
        return _sim_two_legs(h_idx, a_idx, n, known_l1a=l1h, known_l1b=l1a)

    # No legs played
    return _sim_two_legs(h_idx, a_idx, n)


# ---------------------------------------------------------------------------
# Full bracket simulation
# ---------------------------------------------------------------------------

@dataclass
class BracketState:
    """Mutable bracket state passed to the simulation engine."""
    r16: dict[str, dict] = field(default_factory=lambda: {
        k: dict(v) for k, v in DEFAULT_R16.items()
    })
    # Future: qf / sf results could go here


def run_simulation(state: BracketState | None = None, n: int = N_SIMS) -> dict[str, dict[str, float]]:
    """
    Run n Monte Carlo simulations and return per-team stage probabilities.

    Returns:
        {team_key: {qf: %, sf: %, final: %, winner: %}}  — values 0-100.
    """
    if state is None:
        state = BracketState()

    r16 = state.r16

    # ------------------------------------------------------------------ R16
    # For each tie, produce a bool array (n,): True = leg-1 home team advances
    r16_home_advances: dict[str, np.ndarray] = {}
    for tie_id, tie_data in r16.items():
        r16_home_advances[tie_id] = _resolve_r16_tie(tie_data, n)

    def r16_winner_idx(tie_id: str) -> np.ndarray:
        """Shape-(n,) int array of the advancing team's index."""
        tie = r16[tie_id]
        home_idx = TEAM_IDX[tie["home"]]
        away_idx = TEAM_IDX[tie["away"]]
        return np.where(r16_home_advances[tie_id], home_idx, away_idx)

    # ------------------------------------------------------------------ QF
    # 4 QF ties; each QF uses two R16 winners
    qf_winner_idx: list[np.ndarray] = []

    for (tie_a, tie_b) in QF_BRACKET:
        idx_a = r16_winner_idx(tie_a)  # shape (n,)
        idx_b = r16_winner_idx(tie_b)  # shape (n,)
        a_advances = _sim_two_legs(idx_a, idx_b, n)
        qf_winner_idx.append(np.where(a_advances, idx_a, idx_b))

    # ------------------------------------------------------------------ SF
    # SF1: QF1 winner vs QF2 winner
    # SF2: QF3 winner vs QF4 winner
    sf_winner_idx: list[np.ndarray] = []

    for i in range(0, 4, 2):
        idx_a = qf_winner_idx[i]
        idx_b = qf_winner_idx[i + 1]
        a_advances = _sim_two_legs(idx_a, idx_b, n)
        sf_winner_idx.append(np.where(a_advances, idx_a, idx_b))

    # ---------------------------------------------------------------- Final
    idx_a = sf_winner_idx[0]
    idx_b = sf_winner_idx[1]
    a_wins_final = _sim_single_game(idx_a, idx_b, n)
    final_winner_idx = np.where(a_wins_final, idx_a, idx_b)

    # --------------------------------------------------------- Collect stats
    n_teams = len(TEAM_KEYS)
    qf_count    = np.zeros(n_teams, dtype=int)
    sf_count    = np.zeros(n_teams, dtype=int)
    final_count = np.zeros(n_teams, dtype=int)
    win_count   = np.zeros(n_teams, dtype=int)

    # QF: all 8 R16 winners reach the QF
    for tie_id in r16:
        w = r16_winner_idx(tie_id)
        np.add.at(qf_count, w, 1)

    # SF: all 4 QF winners
    for idx in qf_winner_idx:
        np.add.at(sf_count, idx, 1)

    # Final: both SF winners
    for idx in sf_winner_idx:
        np.add.at(final_count, idx, 1)

    # Winner
    np.add.at(win_count, final_winner_idx, 1)

    factor = 100.0 / n
    result: dict[str, dict[str, float]] = {}
    for i, key in enumerate(TEAM_KEYS):
        result[key] = {
            "qf":     round(qf_count[i]    * factor, 2),
            "sf":     round(sf_count[i]    * factor, 2),
            "final":  round(final_count[i] * factor, 2),
            "winner": round(win_count[i]   * factor, 2),
        }

    return result


def run_simulation_pre_r16(n: int = N_SIMS) -> dict[str, dict[str, float]]:
    """
    Run Monte Carlo using pre-R16 ELO values and no known results.
    Used exclusively for the Model Prediction bracket view.

    Temporarily replaces the module-level ELO_ARR with pre-R16 values,
    runs the simulation, then restores the original array.
    """
    global ELO_ARR
    saved = ELO_ARR
    ELO_ARR = np.array(
        [PRE_R16_ELO.get(k, TEAMS[k]["elo"]) for k in TEAM_KEYS], dtype=float
    )
    try:
        state = BracketState(r16={k: dict(v) for k, v in PRE_R16_TIES.items()})
        return run_simulation(state, n)
    finally:
        ELO_ARR = saved
