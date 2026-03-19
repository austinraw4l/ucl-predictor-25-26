"""
v7 ELO model — composite rating system for UCL 2025-26.

Composite split:
  57% UCL phase score
  25% Domestic form score
   8% Strength of Schedule (SOS)
   7% KO History (5-year knockout tie win rate)
   3% UEFA coefficient

ELO values updated after R16 second legs (18 Mar 2026).
K=32 applied to each confirmed knockout result.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Literal

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Teams eliminated from UCL 2025-26 (all R16 second legs confirmed 18 Mar 2026)
ELIMINATED: set[str] = {"Chelsea", "ManCity", "Leverkusen", "Bodo", "Newcastle", "Galatasaray", "Atalanta", "Tottenham"}

ELO_MIN = 1650
ELO_MAX = 2150
MEAN_COEFF = 93.4

LEAGUE_STRENGTH: dict[str, float] = {
    "PL": 1.000,
    "LaLiga": 0.806,
    "Bundesliga": 0.794,
    "SerieA": 0.785,
    "PrimeiraLiga": 0.744,
    "Ligue1": 0.686,
    "SuperLig": 0.467,
    "Eliteserien": 0.352,
}

# ---------------------------------------------------------------------------
# Raw team data (v7, 2025-26) — ELOs updated post R16 second legs
# ---------------------------------------------------------------------------

# ELO update formula: New ELO = Old + K*(actual - expected), K=32
# Confirmed R16 second leg results applied:
#   PSG 3-0 Chelsea      → PSG +13, Chelsea -13
#   Real Madrid 2-1 City → RM  +11, ManCity  -11
#   Arsenal 2-0 Lev      → ARS +5,  Lev      -5
#   Sporting 5-0 Bodo    → SPO +18, Bodo     -18
#   Barcelona 1-0 Newc   → BAR +14, Newcastle -14

TEAMS: dict[str, dict] = {
    "Bayern":     {"name": "Bayern Munich",    "elo": 2241, "ucl": 97.2,  "dom": 100.0, "sos": 66.2,  "koh": 60.0,  "coeff": 92.2,  "qawr": 0.820, "dv6": +6},
    "Arsenal":    {"name": "Arsenal",          "elo": 2215, "ucl": 100.0, "dom": 89.5,  "sos": 100.0, "koh": 50.0,  "coeff": 57.8,  "qawr": 1.000, "dv6":  0},
    "RealMadrid": {"name": "Real Madrid",      "elo": 1964, "ucl": 32.4,  "dom": 69.8,  "sos": 45.2,  "koh": 100.0, "coeff": 100.0, "qawr": 0.684, "dv6": +31},
    "Liverpool":  {"name": "Liverpool",        "elo": 1937, "ucl": 61.2,  "dom": 37.7,  "sos": 63.2,  "koh": 54.0,  "coeff": 80.0,  "qawr": 0.738, "dv6": +2},
    "Barcelona":  {"name": "Barcelona",        "elo": 1925, "ucl": 21.5,  "dom": 92.5,  "sos": 77.9,  "koh": 50.0,  "coeff": 81.1,  "qawr": 0.809, "dv6": +15},
    "PSG":        {"name": "PSG",              "elo": 1906, "ucl": 26.7,  "dom": 47.6,  "sos": 37.4,  "koh": 58.0,  "coeff": 68.9,  "qawr": 0.828, "dv6": +14},
    "Leverkusen": {"name": "Bayer Leverkusen", "elo": 1893, "ucl": 56.2,  "dom": 38.8,  "sos": 26.0,  "koh": 50.0,  "coeff": 40.0,  "qawr": 0.702, "dv6": +9},
    "Newcastle":  {"name": "Newcastle",        "elo": 1857, "ucl": 62.2,  "dom": 18.7,  "sos": 10.7,  "koh": 40.0,  "coeff": 4.4,   "qawr": 0.639, "dv6": +6},
    "ManCity":    {"name": "Man City",         "elo": 1833, "ucl": 29.2,  "dom": 63.6,  "sos": 61.9,  "koh": 78.7,  "coeff": 95.6,  "qawr": 0.395, "dv6": +20},
    "Chelsea":    {"name": "Chelsea",          "elo": 1812, "ucl": 25.0,  "dom": 76.8,  "sos": 24.7,  "koh": 70.5,  "coeff": 61.1,  "qawr": 0.473, "dv6": +27},
    "Atletico":   {"name": "Atletico Madrid",  "elo": 1833, "ucl": 16.7,  "dom": 40.2,  "sos": 57.5,  "koh": 37.5,  "coeff": 57.8,  "qawr": 0.624, "dv6": +9},
    "Tottenham":  {"name": "Tottenham",        "elo": 1799, "ucl": 65.9,  "dom": 0.0,   "sos": 35.2,  "koh": 0.0,   "coeff": 21.1,  "qawr": 0.918, "dv6": -18},
    "Sporting":   {"name": "Sporting CP",      "elo": 1763, "ucl": 27.4,  "dom": 31.9,  "sos": 9.1,   "koh": 50.0,  "coeff": 28.9,  "qawr": 0.583, "dv6": +17},
    "Bodo":       {"name": "Bodø/Glimt",       "elo": 1768, "ucl": 15.4,  "dom": 18.7,  "sos": 44.3,  "koh": 50.0,  "coeff": 0.0,   "qawr": 0.667, "dv6": +16},
    "Atalanta":   {"name": "Atalanta",         "elo": 1702, "ucl": 19.6,  "dom": 28.4,  "sos": 27.4,  "koh": 25.0,  "coeff": 31.1,  "qawr": 0.745, "dv6": +5},
    "Galatasaray":{"name": "Galatasaray",      "elo": 1659, "ucl": 0.0,   "dom": 18.3,  "sos": 0.0,   "koh": 0.0,   "coeff": 23.3,  "qawr": 0.628, "dv6":  0},
}

# ELO change from R16 second leg (K=32 updates). 0 = game not yet played.
R16_DELTA: dict[str, int] = {
    "Bayern": +1, "Arsenal": +5, "RealMadrid": +11, "Liverpool": +6,
    "Barcelona": +14, "PSG": +13, "Leverkusen": -5, "Newcastle": -14,
    "ManCity": -11, "Chelsea": -13, "Atletico": +16, "Tottenham": -16,
    "Sporting": +18, "Bodo": -18, "Atalanta": -1, "Galatasaray": -6,
}

KO_HISTORY: dict[str, dict] = {
    "RealMadrid":  {"played": 14, "won": 11, "finals": 4, "titles": 3},
    "ManCity":     {"played": 12, "won":  8, "finals": 2, "titles": 1},
    "Chelsea":     {"played":  8, "won":  5, "finals": 1, "titles": 1},
    "Bayern":      {"played": 10, "won":  6, "finals": 0, "titles": 0},
    "PSG":         {"played": 12, "won":  6, "finals": 1, "titles": 1},
    "Liverpool":   {"played": 10, "won":  5, "finals": 1, "titles": 0},
    "Barcelona":   {"played":  8, "won":  4, "finals": 0, "titles": 0},
    "Arsenal":     {"played":  4, "won":  2, "finals": 0, "titles": 0},
    "Leverkusen":  {"played":  2, "won":  1, "finals": 0, "titles": 0},
    "Sporting":    {"played":  2, "won":  1, "finals": 0, "titles": 0},
    "Bodo":        {"played":  2, "won":  1, "finals": 0, "titles": 0},
    "Newcastle":   {"played":  0, "won":  0, "finals": 0, "titles": 0},
    "Atletico":    {"played":  8, "won":  3, "finals": 0, "titles": 0},
    "Atalanta":    {"played":  4, "won":  1, "finals": 0, "titles": 0},
    "Tottenham":   {"played":  2, "won":  0, "finals": 0, "titles": 0},
    "Galatasaray": {"played":  2, "won":  0, "finals": 0, "titles": 0},
}

KO_RAW_BONUS: dict[str, int] = {
    "Bayern": +60, "Arsenal": +40, "RealMadrid": +40, "PSG": +35,
    "Atletico": +30, "Bodo": +45, "Liverpool": -10, "Leverkusen": 0,
    "Barcelona": +15, "Galatasaray": +15, "Newcastle": 0, "Sporting": -45,
    "Chelsea": -45, "ManCity": -50, "Tottenham": -50, "Atalanta": -55,
}

DC_BONUS: dict[str, int] = {"PSG": 25}  # Defending champion

# ---------------------------------------------------------------------------
# R16 match statistics — both legs combined (18 Mar 2026)
# xG figures are model estimates based on actual results and shot data
# ---------------------------------------------------------------------------

R16_MATCH_STATS: dict[str, dict] = {
    "PSG":        {"gf": 8, "ga": 2, "xg_for": 6.8, "xg_against": 2.4, "sot_for": 18, "sot_against":  8, "opponent": "Chelsea",     "agg": "8-2", "result": "W"},
    "Liverpool":  {"gf": 2, "ga": 1, "xg_for": 2.1, "xg_against": 1.3, "sot_for":  8, "sot_against":  5, "opponent": "Galatasaray", "agg": "2-1", "result": "W"},
    "RealMadrid": {"gf": 5, "ga": 1, "xg_for": 4.6, "xg_against": 1.8, "sot_for": 14, "sot_against":  7, "opponent": "Man City",    "agg": "5-1", "result": "W"},
    "Bayern":     {"gf": 9, "ga": 1, "xg_for": 7.9, "xg_against": 1.6, "sot_for": 21, "sot_against":  6, "opponent": "Atalanta",    "agg": "9-1", "result": "W"},
    "Barcelona":  {"gf": 2, "ga": 1, "xg_for": 2.3, "xg_against": 1.5, "sot_for":  9, "sot_against":  7, "opponent": "Newcastle",   "agg": "2-1", "result": "W"},
    "Atletico":   {"gf": 6, "ga": 3, "xg_for": 4.9, "xg_against": 3.1, "sot_for": 13, "sot_against": 10, "opponent": "Tottenham",   "agg": "6-3", "result": "W"},
    "Sporting":   {"gf": 5, "ga": 3, "xg_for": 3.4, "xg_against": 3.3, "sot_for": 14, "sot_against": 11, "opponent": "Bodø/Glimt",  "agg": "5-3", "result": "W"},
    "Arsenal":    {"gf": 3, "ga": 1, "xg_for": 2.9, "xg_against": 0.9, "sot_for": 10, "sot_against":  4, "opponent": "Leverkusen",  "agg": "3-1", "result": "W"},
    "Chelsea":    {"gf": 2, "ga": 8, "xg_for": 2.4, "xg_against": 6.8, "sot_for":  8, "sot_against": 18, "opponent": "PSG",         "agg": "2-8", "result": "L"},
    "Galatasaray":{"gf": 1, "ga": 2, "xg_for": 1.3, "xg_against": 2.1, "sot_for":  5, "sot_against":  8, "opponent": "Liverpool",   "agg": "1-2", "result": "L"},
    "ManCity":    {"gf": 1, "ga": 5, "xg_for": 1.8, "xg_against": 4.6, "sot_for":  7, "sot_against": 14, "opponent": "Real Madrid",  "agg": "1-5", "result": "L"},
    "Atalanta":   {"gf": 1, "ga": 9, "xg_for": 1.6, "xg_against": 7.9, "sot_for":  6, "sot_against": 21, "opponent": "Bayern",      "agg": "1-9", "result": "L"},
    "Newcastle":  {"gf": 1, "ga": 2, "xg_for": 1.5, "xg_against": 2.3, "sot_for":  7, "sot_against":  9, "opponent": "Barcelona",   "agg": "1-2", "result": "L"},
    "Tottenham":  {"gf": 3, "ga": 6, "xg_for": 3.1, "xg_against": 4.9, "sot_for": 10, "sot_against": 13, "opponent": "Atletico",    "agg": "3-6", "result": "L"},
    "Bodo":       {"gf": 3, "ga": 5, "xg_for": 3.3, "xg_against": 3.4, "sot_for": 11, "sot_against": 14, "opponent": "Sporting CP", "agg": "3-5", "result": "L"},
    "Leverkusen": {"gf": 1, "ga": 3, "xg_for": 0.9, "xg_against": 2.9, "sot_for":  4, "sot_against": 10, "opponent": "Arsenal",     "agg": "1-3", "result": "L"},
}

# ---------------------------------------------------------------------------
# Sub-formula helpers
# ---------------------------------------------------------------------------

def ko_hist_rate(team_key: str) -> float:
    """5-year knockout tie win rate with finals/titles bonus."""
    h = KO_HISTORY.get(team_key)
    if h is None or h["played"] == 0:
        return 0.40  # league average fallback
    return min(h["won"] / h["played"] + h["finals"] * 0.04 + h["titles"] * 0.04, 1.0)


def qawr(matches: list[tuple]) -> float:
    """
    Quality-Adjusted Win Rate.

    matches: list of (opponent_key, venue, result, opponent_coeff)
      venue:  'H' or 'A'
      result: 'W', 'D', or 'L'
      opponent_coeff: raw UEFA coefficient
    """
    n = len(matches)
    if n == 0:
        return 0.0

    playoff_count = sum(1 for m in matches if m[0] == "PLAYOFF")  # placeholder
    league_games = n - playoff_count

    total_w = earned_w = 0.0

    for i, (opp, venue, result, coeff) in enumerate(matches):
        opp_w = coeff / MEAN_COEFF
        recency = 1.2 if i >= n - 4 else (0.8 if i < 4 else 1.0)
        ko_mult = 1.3 if i >= league_games else 1.0
        w = opp_w * recency * ko_mult
        total_w += w
        if result == "W":
            earned_w += w
        elif result == "D":
            earned_w += w * 0.5

    return earned_w / total_w if total_w > 0 else 0.0


def ko_scaled_bonus(team_key: str, composite_score: float) -> float:
    """
    Apply KO bonus with dampener based on composite score.
    composite_score: 0-100 normalised composite before KO bonus.
    """
    raw = KO_RAW_BONUS.get(team_key, 0)
    dampener = composite_score / 200  # 0 to 0.5
    if raw >= 0:
        return raw * (1 + dampener)
    else:
        return raw * (1 - dampener)


# ---------------------------------------------------------------------------
# Composite score → ELO
# ---------------------------------------------------------------------------

def compute_composite(team_key: str) -> float:
    """
    Compute the 0-100 normalised composite score from stored sub-scores.
    Weights: 57% UCL, 25% DOM, 8% SOS, 7% KOH, 3% COEFF.
    """
    t = TEAMS[team_key]
    composite = (
        0.57 * t["ucl"]
        + 0.25 * t["dom"]
        + 0.08 * t["sos"]
        + 0.07 * t["koh"]
        + 0.03 * t["coeff"]
    )
    return composite


def compute_elo_from_scratch(team_key: str) -> float:
    """
    Recompute ELO from the v7 formula.
    Uses stored sub-scores rather than the pre-computed elo field.
    """
    composite = compute_composite(team_key)
    ko_bonus = ko_scaled_bonus(team_key, composite)
    dc_bonus = DC_BONUS.get(team_key, 0)
    elo = ELO_MIN + (composite / 100) * (ELO_MAX - ELO_MIN) + ko_bonus + dc_bonus
    return round(elo, 1)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

@dataclass
class TeamRating:
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
    r16_delta: int = 0
    eliminated: bool = False


def get_all_ratings() -> list[TeamRating]:
    """Return full v7 rating breakdown for every team, sorted by ELO descending."""
    ratings: list[TeamRating] = []
    for key, t in TEAMS.items():
        composite = compute_composite(key)
        ko_bonus = ko_scaled_bonus(key, composite)
        ratings.append(TeamRating(
            key=key,
            name=t["name"],
            elo=t["elo"],
            elo_computed=compute_elo_from_scratch(key),
            composite=round(composite, 2),
            ucl=t["ucl"],
            dom=t["dom"],
            sos=t["sos"],
            koh_pct=t["koh"],
            coeff=t["coeff"],
            qawr=t["qawr"],
            ko_hist_rate=round(ko_hist_rate(key), 4),
            ko_raw_bonus=KO_RAW_BONUS.get(key, 0),
            ko_scaled_bonus=round(ko_bonus, 2),
            dc_bonus=DC_BONUS.get(key, 0),
            dv6=t["dv6"],
            r16_delta=R16_DELTA.get(key, 0),
            eliminated=key in ELIMINATED,
        ))
    ratings.sort(key=lambda r: r.elo, reverse=True)
    return ratings


def get_rating(team_key: str) -> TeamRating | None:
    if team_key not in TEAMS:
        return None
    ratings = {r.key: r for r in get_all_ratings()}
    return ratings.get(team_key)
