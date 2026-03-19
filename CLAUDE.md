# UCL 2025/26 Predictor — Claude Code Spec

## Project Overview

Full-stack UCL prediction application combining:
1. **v7 ELO model** — custom rating system with 5 components
2. **Monte Carlo simulation** — 50,000 tournament simulations using Poisson goal model
3. **Swarm intelligence** — 12-agent MiroFish-style debate via Anthropic API
4. **Kalshi integration** — live prediction market prices for comparison
5. **Live bracket** — R16 through Final with win probabilities

Final: 30 May 2026, Puskás Aréna, Budapest.

---

## Stack

```
backend/          FastAPI (Python 3.11+)
frontend/         React 18 + Vite
.env              API keys (never commit)
requirements.txt
package.json
```

**Backend:** FastAPI, uvicorn, anthropic, httpx, numpy, python-dotenv  
**Frontend:** React, Vite, Recharts (charts), Tailwind CSS

---

## v7 Model — Full Formula

### Composite split
```
57% UCL phase score
25% Domestic form score
 8% Strength of Schedule (SOS)
 7% KO History (5-year knockout tie win rate)
 3% UEFA coefficient
```

### UCL phase sub-components (sum to 100% within UCL block)
```
Attack    28%  →  Goals/g × 11  +  xG/g × 10  +  SOT/g × 7
Defence   36%  →  GA/g × 18  +  xGA/g × 18           (inverted — lower is better)
Clinical  16%  →  BC_conversion × 8  +  Away_xGD × 6  +  xG/shot × 2
Form      12%  →  QAWR × 12
Resilience 8%  →  Set_piece_xG × 4  +  Balls_rec × 2  +  Tackles × 2
```

### QAWR (Quality-Adjusted Win Rate)
```python
def qawr(matches):
    # matches = list of (opponent, venue, result, opponent_coeff)
    # result: 'W'=full weight, 'D'=0.5x, 'L'=0
    MEAN_COEFF = 93.4
    total_w = earned_w = 0
    n = len(matches)
    league_games = n - playoff_count
    for i, (opp, venue, result, coeff) in enumerate(matches):
        opp_w = coeff / MEAN_COEFF
        # Recency weighting
        recency = 1.2 if i >= n-4 else (0.8 if i < 4 else 1.0)
        # Playoff games worth more (knockout football)
        ko_mult = 1.3 if i >= league_games else 1.0
        w = opp_w * recency * ko_mult
        total_w += w
        if result == 'W':   earned_w += w
        elif result == 'D': earned_w += w * 0.5
    return earned_w / total_w
```

### Domestic score
```python
# Equal 25% weight on each component, multiplied by league strength
dom_raw = (xG_per_game * 25 + xGD_per_game * 25 + xPts_per_90 * 25 - xGA_per_game * 25) * league_strength

# League strength = UEFA assoc coefficient / England max (22.847)
LEAGUE_STRENGTH = {
    'PL': 1.000, 'LaLiga': 0.806, 'Bundesliga': 0.794,
    'SerieA': 0.785, 'PrimeiraLiga': 0.744, 'Ligue1': 0.686,
    'SuperLig': 0.467, 'Eliteserien': 0.352
}
```

### KO History (last 5 UCL seasons: 2020-21 to 2024-25)
```python
def ko_hist_rate(team):
    # ties_won/ties_played + finals_bonus + titles_bonus
    h = KO_HISTORY[team]
    if h['played'] == 0: return 0.40  # league average fallback
    return min(h['won']/h['played'] + h['finals']*0.04 + h['titles']*0.04, 1.0)
```

### KO Bonus (scaled, additive)
```python
# Applied after composite is computed
dampener = composite_score / 200   # 0 to 0.5
if raw_ko_bonus >= 0:
    final_ko = raw_ko_bonus * (1 + dampener)
else:
    final_ko = raw_ko_bonus * (1 - dampener)

# PSG defending champion flat bonus: +25 ELO
# Draws at home = 0 (should win with home advantage)
# Draws away = +15
```

### ELO range
```
ELO_MIN = 1650
ELO_MAX = 2150
final_elo = ELO_MIN + (composite_norm/100) * (ELO_MAX - ELO_MIN) + ko_scaled + dc_bonus
```

---

## v7 Team Ratings (current 2025-26)

```python
TEAMS = {
    'Bayern':     {'name':'Bayern Munich',    'elo':2240,'ucl':97.2,'dom':100.0,'sos':66.2,'koh':60.0,'coeff':92.2,'qawr':0.820,'dv6':+6},
    'Arsenal':    {'name':'Arsenal',          'elo':2210,'ucl':100.0,'dom':89.5,'sos':100.0,'koh':50.0,'coeff':57.8,'qawr':1.000,'dv6':0},
    'RealMadrid': {'name':'Real Madrid',      'elo':1953,'ucl':32.4,'dom':69.8,'sos':45.2,'koh':100.0,'coeff':100.0,'qawr':0.684,'dv6':+31},
    'Liverpool':  {'name':'Liverpool',        'elo':1931,'ucl':61.2,'dom':37.7,'sos':63.2,'koh':54.0,'coeff':80.0,'qawr':0.738,'dv6':+2},
    'Barcelona':  {'name':'Barcelona',        'elo':1911,'ucl':21.5,'dom':92.5,'sos':77.9,'koh':50.0,'coeff':81.1,'qawr':0.809,'dv6':+15},
    'Leverkusen': {'name':'Bayer Leverkusen', 'elo':1898,'ucl':56.2,'dom':38.8,'sos':26.0,'koh':50.0,'coeff':40.0,'qawr':0.702,'dv6':+9},
    'PSG':        {'name':'PSG',              'elo':1893,'ucl':26.7,'dom':47.6,'sos':37.4,'koh':58.0,'coeff':68.9,'qawr':0.828,'dv6':+14},
    'Newcastle':  {'name':'Newcastle',        'elo':1871,'ucl':62.2,'dom':18.7,'sos':10.7,'koh':40.0,'coeff':4.4,'qawr':0.639,'dv6':+6},
    'ManCity':    {'name':'Man City',         'elo':1844,'ucl':29.2,'dom':63.6,'sos':61.9,'koh':78.7,'coeff':95.6,'qawr':0.395,'dv6':+20},
    'Chelsea':    {'name':'Chelsea',          'elo':1825,'ucl':25.0,'dom':76.8,'sos':24.7,'koh':70.5,'coeff':61.1,'qawr':0.473,'dv6':+27},
    'Atletico':   {'name':'Atletico Madrid',  'elo':1817,'ucl':16.7,'dom':40.2,'sos':57.5,'koh':37.5,'coeff':57.8,'qawr':0.624,'dv6':+9},
    'Tottenham':  {'name':'Tottenham',        'elo':1815,'ucl':65.9,'dom':0.0,'sos':35.2,'koh':0.0,'coeff':21.1,'qawr':0.918,'dv6':-18},
    'Sporting':   {'name':'Sporting CP',      'elo':1745,'ucl':27.4,'dom':31.9,'sos':9.1,'koh':50.0,'coeff':28.9,'qawr':0.583,'dv6':+17},
    'Atalanta':   {'name':'Atalanta',         'elo':1703,'ucl':19.6,'dom':28.4,'sos':27.4,'koh':25.0,'coeff':31.1,'qawr':0.745,'dv6':+5},
    'Galatasaray':{'name':'Galatasaray',      'elo':1665,'ucl':0.0,'dom':18.3,'sos':0.0,'koh':0.0,'coeff':23.3,'qawr':0.628,'dv6':0},
    'Bodo':       {'name':'Bodø/Glimt',       'elo':1786,'ucl':15.4,'dom':18.7,'sos':44.3,'koh':50.0,'coeff':0.0,'qawr':0.667,'dv6':+16},
}

KO_HISTORY = {
    'RealMadrid':  {'played':14,'won':11,'finals':4,'titles':3},
    'ManCity':     {'played':12,'won':8,'finals':2,'titles':1},
    'Chelsea':     {'played':8,'won':5,'finals':1,'titles':1},
    'Bayern':      {'played':10,'won':6,'finals':0,'titles':0},
    'PSG':         {'played':12,'won':6,'finals':1,'titles':1},
    'Liverpool':   {'played':10,'won':5,'finals':1,'titles':0},
    'Barcelona':   {'played':8,'won':4,'finals':0,'titles':0},
    'Arsenal':     {'played':4,'won':2,'finals':0,'titles':0},
    'Leverkusen':  {'played':2,'won':1,'finals':0,'titles':0},
    'Sporting':    {'played':2,'won':1,'finals':0,'titles':0},
    'Bodo':        {'played':2,'won':1,'finals':0,'titles':0},
    'Newcastle':   {'played':0,'won':0,'finals':0,'titles':0},
    'Atletico':    {'played':8,'won':3,'finals':0,'titles':0},
    'Atalanta':    {'played':4,'won':1,'finals':0,'titles':0},
    'Tottenham':   {'played':2,'won':0,'finals':0,'titles':0},
    'Galatasaray': {'played':2,'won':0,'finals':0,'titles':0},
}

KO_RAW_BONUS = {
    'Bayern':+60,'Arsenal':+40,'RealMadrid':+40,'PSG':+35,
    'Atletico':+30,'Bodo':+45,'Liverpool':-10,'Leverkusen':0,
    'Barcelona':+15,'Galatasaray':+15,'Newcastle':0,'Sporting':-45,
    'Chelsea':-45,'ManCity':-50,'Tottenham':-50,'Atalanta':-55,
}

DC_BONUS = {'PSG': 25}   # Defending champion
```

---

## Monte Carlo Engine

```python
import numpy as np

def elo_win_prob(elo_a, elo_b):
    return 1 / (1 + 10 ** ((elo_b - elo_a) / 400))

def poisson_goal(lam):
    # Draw from Poisson distribution
    L = np.exp(-lam)
    k, p = 0, 1.0
    while p > L:
        k += 1
        p *= np.random.random()
    return k - 1

def simulate_tie(team_a, team_b, teams_dict):
    """Simulate a two-legged knockout tie. Returns winner key."""
    elo_a = teams_dict[team_a]['elo']
    elo_b = teams_dict[team_b]['elo']
    p_a = elo_win_prob(elo_a, elo_b)
    
    # UCL average ~2.6 goals/game, split by win probability
    BASE_LAMBDA = 1.35
    lam_a1 = BASE_LAMBDA * p_a / 0.5       # team_a at home leg 1
    lam_b1 = BASE_LAMBDA * (1-p_a) / 0.5
    lam_a2 = BASE_LAMBDA * (1-p_a) / 0.5   # team_a away leg 2
    lam_b2 = BASE_LAMBDA * p_a / 0.5
    
    g1a, g1b = poisson_goal(lam_a1), poisson_goal(lam_b1)
    g2a, g2b = poisson_goal(lam_a2), poisson_goal(lam_b2)
    
    agg_a = g1a + g2b
    agg_b = g1b + g2a
    
    if agg_a > agg_b: return team_a
    if agg_b > agg_a: return team_b
    # Pens: ELO-weighted coin flip
    return team_a if np.random.random() < p_a else team_b

def run_simulation(bracket, teams_dict):
    """Run one full tournament simulation from R16 onwards."""
    # bracket: list of R16 ties with known/estimated winners
    # Returns: {team_key: stage_reached}
    # Stages: 'r16', 'qf', 'sf', 'final', 'winner'
    pass  # implement full bracket traversal

def monte_carlo(bracket, teams_dict, n=50000):
    """Run N simulations. Returns probability dict per team per stage."""
    counts = {t: {'qf':0,'sf':0,'final':0,'winner':0} for t in teams_dict}
    for _ in range(n):
        result = run_simulation(bracket, teams_dict)
        for team, stage in result.items():
            for s in ['qf','sf','final','winner']:
                if stage_reached(stage, s):
                    counts[team][s] += 1
    return {t: {s: counts[t][s]/n*100 for s in counts[t]} for t in counts}
```

---

## Bracket Structure (2025-26, fixed after R16 draw)

```
R16 ties → QF pairs → SF pairs → Final

QF path 1:  PSG/Chelsea    vs  Galatasaray/Liverpool
QF path 2:  RealMadrid/ManCity vs  Atalanta/Bayern
QF path 3:  Newcastle/Barcelona vs  Atletico/Tottenham
QF path 4:  Sporting/Bodo  vs  Leverkusen/Arsenal

SF 1: QF1 winner vs QF2 winner
SF 2: QF3 winner vs QF4 winner
Final: SF1 winner vs SF2 winner
```

### R16 first leg results (confirmed)
```python
R16_RESULTS = {
    'PSG_Chelsea':      {'home':'PSG','away':'Chelsea','l1h':5,'l1a':2},
    'Gala_Liverpool':   {'home':'Galatasaray','away':'Liverpool','l1h':1,'l1a':0},
    'Real_ManCity':     {'home':'RealMadrid','away':'ManCity','l1h':3,'l1a':0},
    'Atalanta_Bayern':  {'home':'Atalanta','away':'Bayern','l1h':1,'l1a':6},
    'Newcastle_Barca':  {'home':'Newcastle','away':'Barcelona','l1h':1,'l1a':1},
    'Atletico_Spurs':   {'home':'Atletico','away':'Tottenham','l1h':5,'l1a':2},
    'Sporting_Bodo':    {'home':'Sporting','away':'Bodo','l1h':0,'l1a':3,
                         'l2h':5,'l2a':0,'winner':'Sporting'},  # CONFIRMED THROUGH
    'Lev_Arsenal':      {'home':'Leverkusen','away':'Arsenal','l1h':1,'l1a':1},
}
# Second legs: 17-18 March 2026
# Update winners as results come in tonight
```

---

## Swarm Intelligence Engine (MiroFish Mirror)

### Architecture
- 12 analyst agents with distinct personas and biases
- Round 1: independent analysis from v7 seed data
- Round 2: agents read all R1 outputs, update beliefs
- Aggregation: confidence-weighted average of R2 probabilities
- Output: swarm % per team, compared to Monte Carlo %

### Agent definitions
```python
AGENTS = [
    {'id':'quant',  'name':'Dr. Elena Vasquez',  'badge':'STAT-PURIST',
     'persona':'Quantitative analyst. Trusts only xG, xGA, QAWR. Dismisses psychological factors and historical pedigree as noise. Arsenal QAWR=1.000 is her north star.'},
    {'id':'hist',   'name':'Marco Ferretti',     'badge':'HISTORIAN',
     'persona':'25yr UCL journalist. Deep belief in knockout pedigree. "Real Madrid always find a way." KO history above all stats. Cites 2022 comeback tour.'},
    {'id':'psych',  'name':'Prof. James Okafor', 'badge':'PSYCH',
     'persona':'Sports psychologist. Squad momentum, manager confidence, pressure handling. Bullish on Bayern Kompany-era swagger and PSG post-superstar transformation.'},
    {'id':'bear',   'name':'Sceptic Sara',       'badge':'CONTRARIAN',
     'persona':'Fades every model favourite. Arsenal no striker. Barca defend badly. Thinks Atletico and Leverkusen are this year dark horses.'},
    {'id':'mkt',    'name':'Tomás Reyes',        'badge':'MARKET-ANCHOR',
     'persona':'Ex-prediction market trader. Anchors to efficient market prices. Adjusts only on strong model evidence. Bayern = current market favourite.'},
    {'id':'form',   'name':'Priya Nair',         'badge':'FORM',
     'persona':'Only cares about last 6 weeks. Arsenal winning streak. Real Madrid La Liga dominance. PSG peaking late. QAWR recency weighting is her natural lens.'},
    {'id':'tact',   'name':'Hans Brandt',        'badge':'TACTICAL',
     'persona':'Former Bundesliga coach. Bayern pressing under Kompany most evolved system. Worried about Real Madrid wide defensive gaps.'},
    {'id':'xg',     'name':'Aisha Kamara',       'badge':'xG-ANALYST',
     'persona':'xG specialist. Barcelona DOM=93 vs UCL=22 is massive regression-to-mean case. Bullish on Barca in knockouts.'},
    {'id':'upset',  'name':'Carlos Mendez',      'badge':'UPSET-HUNTER',
     'persona':'1 pre-tournament favourite in last 5 UCLs. Fades Bayern and Arsenal. Fancies Atletico, Leverkusen, Sporting as dark horses.'},
    {'id':'dom',    'name':'Sophie Laurent',     'badge':'DOM-FORM',
     'persona':'Domestic stats specialist. 30 games > 8 UCL games for reliability. Arsenal and Barcelona domestic xG most reliable signal.'},
    {'id':'finals', 'name':'Yusuf Al-Hassan',    'badge':'FINALS-EXPERT',
     'persona':'Semis and finals specialist only. Real Madrid KOH=100, PSG won 2025 final 5-0. Dismisses league phase entirely.'},
    {'id':'bayes',  'name':'Dr. Wei Chen',       'badge':'BAYESIAN',
     'persona':'Academic forecaster. 20% base rate for favourite. Bayesian updates on each signal. No anchoring bias.'},
]
```

### API call structure (backend)
```python
async def run_agent_round1(agent, seed_data, client):
    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=800,
        system=build_system_prompt(agent),
        messages=[{"role":"user","content":build_r1_prompt(agent, seed_data)}]
    )
    return parse_agent_json(response.content[0].text)

async def run_agent_round2(agent, seed_data, r1_results, client):
    other_views = format_other_views(r1_results, agent['id'])
    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=800,
        system=build_system_prompt(agent),
        messages=[{"role":"user","content":build_r2_prompt(agent, seed_data, other_views)}]
    )
    return parse_agent_json(response.content[0].text)

# Run all R1 agents in parallel, then all R2 agents in parallel
async def run_swarm(seed_data):
    async with anthropic.AsyncAnthropic() as client:
        r1 = await asyncio.gather(*[run_agent_round1(a, seed_data, client) for a in AGENTS])
        r2 = await asyncio.gather(*[run_agent_round2(a, seed_data, r1, client) for a in AGENTS])
    return aggregate(r2)

def aggregate(r2_results):
    conf_weights = {'HIGH':1.5,'MED':1.0,'LOW':0.6}
    totals, total_w = {}, 0
    for r in r2_results:
        w = conf_weights.get(r['confidence'], 1.0)
        total_w += w
        for team, prob in r['probabilities'].items():
            totals[team] = totals.get(team, 0) + prob * w
    return {t: round(v/total_w, 1) for t, v in totals.items()}
```

### Sample swarm output (run 17 March 2026)
```json
{
  "swarm_winner_probs": {
    "Bayern": 18.1, "Arsenal": 18.6, "RealMadrid": 14.5, "PSG": 12.3,
    "Barcelona": 12.4, "Leverkusen": 9.0, "Atletico": 7.2, "Liverpool": 4.4,
    "ManCity": 2.4, "Newcastle": 2.3, "Sporting": 2.4, "Chelsea": 1.5,
    "Galatasaray": 0.7, "Tottenham": 0.5, "Atalanta": 0.9
  },
  "agent_winner_picks_r2": {
    "quant":"Arsenal","hist":"RealMadrid","psych":"Bayern","bear":"Atletico",
    "mkt":"Bayern","form":"Arsenal","tact":"Bayern","xg":"Barcelona",
    "upset":"Leverkusen","dom":"Arsenal","finals":"RealMadrid","bayes":"Bayern"
  }
}
```

---

## Kalshi Integration

```python
# Public API — no auth required for market data
KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2"

async def get_ucl_markets():
    """Fetch all open UCL winner markets."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{KALSHI_BASE}/markets", params={
            "series_ticker": "SOCCER",  # browse to find UCL series ticker
            "status": "open"
        })
        return resp.json()

async def get_market_odds(ticker):
    """Get orderbook for specific market. YES bid ≈ market probability."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{KALSHI_BASE}/markets/{ticker}/orderbook")
        data = resp.json()
        return data['orderbook_fp']['yes_dollars']  # best bid = market prob

# Map Kalshi market titles to our team keys
KALSHI_TEAM_MAP = {
    "Bayern Munich": "Bayern",
    "Arsenal": "Arsenal",
    "Real Madrid": "RealMadrid",
    "Paris Saint-Germain": "PSG",
    # etc.
}
```

---

## API Endpoints

```
GET  /api/ratings              → all v7 team ratings
GET  /api/monte-carlo          → run 50k MC simulation, return probs
POST /api/monte-carlo          → run with updated bracket state
GET  /api/swarm                → run 12-agent swarm (calls Anthropic API)
GET  /api/kalshi               → fetch live Kalshi UCL market prices
GET  /api/compare              → all three models side by side + gap
POST /api/results              → update R16/QF/SF results, recalculate
GET  /api/bracket              → current bracket state with win probs
```

---

## Environment Variables

```bash
ANTHROPIC_API_KEY=sk-ant-...      # for swarm agent calls
KALSHI_API_KEY=                   # optional — only needed for trading, not data
```

---

## Key Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| Attack vs Defence weight | 28% / 36% (asymmetric) | 12/15 UCL champions had top-5 xGA |
| QAWR vs raw PPG | QAWR | Opponent-quality adjusted, not raw wins |
| Domestic weight | 25% | 30-game sample > 8-game UCL sample |
| KO History weight | 7% | Captures knockout mentality not in stats |
| Playoff game multiplier | 1.3× | KO games more informative than league phase |
| Recency weighting | last-4: 1.2×, first-4: 0.8× | Captures PSG-style late peaking |
| ELO range | 1650–2150 | Enough spread to separate teams clearly |
| Monte Carlo sims | 50,000 | Stable distribution, fast enough for web |
| Swarm agents | 12 | MiroFish minimum viable, diverse enough |
| Claude model | claude-sonnet-4-20250514 | Best quality/cost for agent reasoning |

---

## Historical Accuracy (5 UCL seasons backtest)

| Model | QF (20 ties) | SF (10 ties) | Final (5) | Total | % |
|---|---|---|---|---|---|
| v7 | 14/20 (70%) | 6/10 (60%) | 3/5 (60%) | 23/35 | **66%** |
| v6 | 14/20 (70%) | 5/10 (50%) | 2/5 (40%) | 21/35 | 60% |
| Betting | 13/20 (65%) | 5/10 (50%) | 2/5 (40%) | 20/35 | 57% |
| FiveThirtyEight | 13/20 (65%) | 5/10 (50%) | 2/5 (40%) | 19/35 | 54% |

Random baseline: 50% = 17-18/35. v7 beats all alternatives on this 5-year window.

---

## First Claude Code Session — Suggested Prompts

```
# Session 1 — backend foundation
"Read CLAUDE.md fully. Create the FastAPI project structure. 
 Implement model/ratings.py with the full v7 formula and all 
 team data from CLAUDE.md. Add /api/ratings endpoint."

# Session 2 — Monte Carlo
"Implement model/monte_carlo.py using the Poisson simulation 
 engine in CLAUDE.md. Add /api/monte-carlo endpoint that 
 accepts optional bracket state in the request body."

# Session 3 — swarm
"Implement api/swarm.py using the AsyncAnthropic client.
 Run all 12 agents in parallel for round 1, then round 2.
 Aggregate with confidence weighting. Add /api/swarm endpoint."

# Session 4 — Kalshi
"Implement api/kalshi.py. Fetch UCL winner markets from the 
 public Kalshi API. Map team names to our keys. Return YES 
 bid prices as market probabilities. Add /api/kalshi endpoint."

# Session 5 — compare endpoint + frontend
"Build /api/compare that returns v7 MC probs, swarm probs, 
 Kalshi market prices, and deltas for all teams in one response.
 Then scaffold the React frontend with bracket view, probability 
 comparison table, and agent cards."
```

---

## Notes for Future Development

- **Rate limits**: Swarm runs 24 Anthropic API calls (12 agents × 2 rounds). At Sonnet pricing this costs ~$0.05–0.15 per full run. Cache results for 1 hour.
- **Kalshi sports markets**: UCL winner market may be under `SOCCER` or `SPORTS` series ticker. Browse the API first session to find the correct ticker.
- **MiroFish proper**: For full MiroFish integration, clone `666ghj/MiroFish` or `nikmcfly/MiroFish-Offline`. Run via Docker. POST seed material (v7 team data as JSON) to localhost:5001. The offline fork supports any OpenAI-compatible API including Anthropic.
- **Updating results**: POST to `/api/results` with second leg scores. The endpoint should recompute aggregate winners, update bracket state, invalidate MC/swarm cache, return new probabilities.
- **v7 vs v7b**: v7 uses asymmetric 36/28 defence/attack split. v7b uses symmetric 30/30. v7 scores 66% on 5-year backtest vs v7b's 57%. Use v7.
