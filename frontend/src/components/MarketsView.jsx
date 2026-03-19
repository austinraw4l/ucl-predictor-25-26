import { useState, useEffect, useCallback } from 'react'
import { fetchCompare, fetchKalshi } from '../api.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEAM_DISPLAY = {
  PSG: 'PSG', Chelsea: 'Chelsea', Galatasaray: 'Galatasaray', Liverpool: 'Liverpool',
  RealMadrid: 'Real Madrid', ManCity: 'Man City', Atalanta: 'Atalanta', Bayern: 'Bayern Munich',
  Newcastle: 'Newcastle', Barcelona: 'Barcelona', Atletico: 'Atletico Madrid',
  Tottenham: 'Tottenham', Sporting: 'Sporting CP', Bodo: 'Bodo/Glimt',
  Leverkusen: 'Leverkusen', Arsenal: 'Arsenal',
}

const KALSHI_FALLBACK = {
  Bayern: 28.0, Arsenal: 22.0, RealMadrid: 18.0, PSG: 12.0, Barcelona: 8.0,
  Liverpool: 5.0, Atletico: 3.0, Leverkusen: 2.0, ManCity: 0.5,
  Newcastle: 0.5, Sporting: 0.5, Bodo: 0.0, Galatasaray: 0.0,
  Tottenham: 0.0, Atalanta: 0.0, Chelsea: 0.0,
}

const R16_TIES = [
  { id: 'PSG_Chelsea',    home: 'PSG',        away: 'Chelsea',      agg: '8-2',  confirmed: true,  winner: 'PSG',        path: 'silver' },
  { id: 'Gala_Liverpool', home: 'Galatasaray', away: 'Liverpool',   agg: '2-1',  confirmed: true,  winner: 'Liverpool',      path: 'silver' },
  { id: 'Real_ManCity',   home: 'RealMadrid', away: 'ManCity',      agg: '5-1',  confirmed: true,  winner: 'RealMadrid', path: 'silver' },
  { id: 'Atalanta_Bayern',home: 'Atalanta',   away: 'Bayern',       agg: '9-1',  confirmed: true,  winner: 'Bayern',     path: 'silver' },
  { id: 'Newcastle_Barca',home: 'Newcastle',  away: 'Barcelona',    agg: '1-2',  confirmed: true,  winner: 'Barcelona',  path: 'blue' },
  { id: 'Atletico_Spurs', home: 'Atletico',   away: 'Tottenham',    agg: '5-2',  confirmed: true,  winner: 'Atletico',   path: 'blue' },
  { id: 'Sporting_Bodo',  home: 'Sporting',   away: 'Bodo',         agg: '5-3',  confirmed: true,  winner: 'Sporting',   path: 'blue' },
  { id: 'Lev_Arsenal',    home: 'Leverkusen', away: 'Arsenal',      agg: '3-1',  confirmed: true,  winner: 'Arsenal',    path: 'blue' },
]

const QF_MATCHUPS = [
  { id: 'QF1', label: 'QF Path 1', teamA: 'PSG',        teamB: 'Liverpool',  path: 'silver' },
  { id: 'QF2', label: 'QF Path 2', teamA: 'RealMadrid', teamB: 'Bayern',     path: 'silver' },
  { id: 'QF3', label: 'QF Path 3', teamA: 'Barcelona',  teamB: 'Atletico',   path: 'blue' },
  { id: 'QF4', label: 'QF Path 4', teamA: 'Arsenal',    teamB: 'Sporting',   path: 'blue' },
]

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

function Spinner({ label = 'Loading...' }) {
  return (
    <div className="flex items-center gap-3 py-12 justify-center">
      <div className="w-8 h-8 border-3 border-brand-border border-t-brand-orange rounded-full animate-spin"
           style={{ borderWidth: 3, borderTopColor: '#D4401A' }} />
      <span className="text-brand-muted text-sm">{label}</span>
    </div>
  )
}

function Cents({ value, positive }) {
  if (value == null) return <span className="text-brand-muted">-</span>
  const cents = Math.round(value)
  const color = positive ? '#2e7d32' : cents >= 60 ? '#2e7d32' : cents >= 40 ? '#e65100' : '#c62828'
  return <span className="font-bold tabular-nums text-lg" style={{ color }}>{cents}c</span>
}

function SwarmSignal({ mcPct, swarmPct }) {
  if (swarmPct == null || mcPct == null) return null
  const diff = swarmPct - mcPct
  if (Math.abs(diff) < 5) return null
  if (diff > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium"
            style={{ background: '#e8f5e9', borderColor: '#a5d6a7', color: '#2e7d32' }}>
        Swarm bullish +{diff.toFixed(1)}%
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium"
          style={{ background: '#fce4ec', borderColor: '#f48fb1', color: '#c62828' }}>
      Swarm bearish {diff.toFixed(1)}%
    </span>
  )
}

// ---------------------------------------------------------------------------
// Section A: R16 results and advance markets
// ---------------------------------------------------------------------------

function R16Section({ kalshiData }) {
  const advance = kalshiData?.r16_advance || {}

  function PathBadge({ path }) {
    if (path === 'silver') {
      return (
        <span className="text-xs font-medium px-2 py-0.5 rounded border text-brand-navy bg-brand-shell border-brand-border">
          Silver Path
        </span>
      )
    }
    return (
      <span className="text-xs font-medium px-2 py-0.5 rounded border"
            style={{ color: '#1565c0', background: '#e3f2fd', borderColor: '#90caf9' }}>
        Blue Path
      </span>
    )
  }

  function TieCard({ tie }) {
    const homeAdv = advance[tie.home]
    const awayAdv = advance[tie.away]

    const cardBg = tie.confirmed
      ? { background: '#f1f8e9', borderColor: '#a5d6a7' }
      : { background: '#ade1ff', borderColor: '#dde2ee' }

    function rowStyle(isWinner, isAdvantage, isLoser) {
      if (isWinner) return { background: '#e8f5e9', borderColor: '#a5d6a7' }
      if (isAdvantage) return { background: '#fff8e1', borderColor: '#ffe082' }
      if (isLoser) return { background: '#fafafa', borderColor: '#dde2ee', opacity: 0.45 }
      return { background: '#f0f4f8', borderColor: '#dde2ee' }
    }

    const homeIsWinner = tie.confirmed && tie.winner === tie.home
    const awayIsWinner = tie.confirmed && tie.winner === tie.away
    const homeIsLoser  = tie.confirmed && tie.winner !== tie.home
    const awayIsLoser  = tie.confirmed && tie.winner !== tie.away

    return (
      <div className="rounded-lg border p-4" style={cardBg}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-brand-muted">R16 · Agg: {tie.agg}</span>
          {tie.confirmed
            ? <span className="text-xs font-medium" style={{ color: '#2e7d32' }}>Confirmed</span>
            : <span className="text-xs font-medium text-brand-orange">2nd leg tonight</span>}
        </div>

        {/* Home team */}
        <div className="flex items-center justify-between rounded border px-3 py-2 mb-1"
             style={rowStyle(homeIsWinner, tie.advantage === tie.home, homeIsLoser)}>
          <span className="font-display text-sm text-brand-ink" style={{ fontWeight: 600 }}>
            {TEAM_DISPLAY[tie.home] || tie.home}
          </span>
          {homeIsWinner ? (
            <span className="text-sm font-bold" style={{ color: '#2e7d32' }}>Through</span>
          ) : homeAdv ? (
            <Cents value={homeAdv.advance_prob} />
          ) : <span className="text-brand-muted text-xs">no market</span>}
        </div>

        {/* Away team */}
        <div className="flex items-center justify-between rounded border px-3 py-2"
             style={rowStyle(awayIsWinner, tie.advantage === tie.away, awayIsLoser)}>
          <span className="font-display text-sm text-brand-ink" style={{ fontWeight: 600 }}>
            {TEAM_DISPLAY[tie.away] || tie.away}
          </span>
          {awayIsLoser ? (
            <span className="text-xs font-medium line-through" style={{ color: '#c62828' }}>Out</span>
          ) : awayIsWinner ? (
            <span className="text-sm font-bold" style={{ color: '#2e7d32' }}>Through</span>
          ) : awayAdv ? (
            <Cents value={awayAdv.advance_prob} />
          ) : <span className="text-brand-muted text-xs">no market</span>}
        </div>

        {!tie.confirmed && (homeAdv || awayAdv) && (
          <p className="text-xs text-brand-muted mt-2 text-center">
            Kalshi KXUCLADVANCE · prices in cents (YES bid)
          </p>
        )}
      </div>
    )
  }

  const silverTies = R16_TIES.filter(t => t.path === 'silver')
  const blueTies   = R16_TIES.filter(t => t.path === 'blue')

  return (
    <div className="space-y-4">
      <h3 className="font-display text-base text-brand-ink" style={{ fontWeight: 600 }}>R16 Results and Advance Markets</h3>
      <div className="grid sm:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-1"><PathBadge path="silver" /></div>
          {silverTies.map(t => <TieCard key={t.id} tie={t} />)}
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-1"><PathBadge path="blue" /></div>
          {blueTies.map(t => <TieCard key={t.id} tie={t} />)}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section B: QF model odds
// ---------------------------------------------------------------------------

function QFSection({ compareData }) {
  const teams = compareData?.teams || []
  const byName = Object.fromEntries(teams.map(t => [t.name, t]))

  function teamData(key) {
    const name = TEAM_DISPLAY[key] || key
    return byName[name] || teams.find(t => t.name?.includes(key.replace('RealMadrid', 'Real'))) || {}
  }

  function QFCard({ qf }) {
    const tdA = teamData(qf.teamA)
    const tdB = qf.teamB ? teamData(qf.teamB) : null

    const mcA = tdA?.mc_winner
    const mcB = tdB?.mc_winner
    const swA = tdA?.swarm_winner
    const swB = tdB?.swarm_winner

    const pathStyle = qf.path === 'silver'
      ? { borderColor: '#dde2ee', background: '#ade1ff' }
      : { borderColor: '#90caf9', background: '#f0f7ff' }

    function PathBadge() {
      if (qf.path === 'silver') {
        return <span className="text-xs text-brand-muted bg-brand-shell px-1.5 py-0.5 rounded border border-brand-border">Silver</span>
      }
      return <span className="text-xs px-1.5 py-0.5 rounded border" style={{ color: '#1565c0', background: '#e3f2fd', borderColor: '#90caf9' }}>Blue</span>
    }

    function ProbCell({ value }) {
      if (value == null) return <span className="text-brand-muted text-lg font-bold">-</span>
      const color = value >= 15 ? '#2e7d32' : value >= 8 ? '#e65100' : '#3d4466'
      return <span className="font-bold tabular-nums text-lg" style={{ color }}>{Math.round(value)}c</span>
    }

    return (
      <div className="rounded-lg border p-4" style={pathStyle}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-brand-muted">{qf.label}</span>
          <PathBadge />
        </div>

        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="font-display text-brand-ink" style={{ fontWeight: 600 }}>{TEAM_DISPLAY[qf.teamA]}</div>
            <SwarmSignal mcPct={mcA} swarmPct={swA} />
          </div>
          <div className="text-right">
            <div className="text-xs text-brand-muted mb-0.5">MC to win UCL</div>
            <ProbCell value={mcA} />
          </div>
        </div>

        <div className="text-center text-brand-muted text-xs my-2">vs</div>

        {qf.teamB ? (
          <div className="flex items-center justify-between">
            <div>
              <div className="font-display text-brand-ink" style={{ fontWeight: 600 }}>{TEAM_DISPLAY[qf.teamB]}</div>
              <SwarmSignal mcPct={mcB} swarmPct={swB} />
            </div>
            <div className="text-right">
              <div className="text-xs text-brand-muted mb-0.5">MC to win UCL</div>
              <ProbCell value={mcB} />
            </div>
          </div>
        ) : (
          <div className="text-brand-muted text-sm italic">
            Opponent TBD: {qf.teamB_options?.map(k => TEAM_DISPLAY[k] || k).join(' or ')}
          </div>
        )}

        {!compareData?.swarm_available && (
          <p className="text-xs text-brand-muted mt-3 border-t border-brand-border pt-2">
            Run swarm to see swarm signals
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="font-display text-base text-brand-ink" style={{ fontWeight: 600 }}>QF Model Odds</h3>
      <p className="text-xs text-brand-muted">
        MC probabilities shown as cents per dollar. Swarm signal badge appears when swarm
        and Monte Carlo diverge by more than 5 percentage points.
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        {QF_MATCHUPS.map(qf => <QFCard key={qf.id} qf={qf} />)}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section C: Model vs market disparity
// ---------------------------------------------------------------------------

function DisparitySection({ compareData }) {
  const teams = compareData?.teams || []
  const swarmAvailable = compareData?.swarm_available

  const rows = teams
    .map(t => {
      const mc = t.mc_winner ?? 0
      const swarm = t.swarm_winner ?? null
      // Combined = MC×0.6 + Swarm×0.4 when swarm available, else MC only
      const combined = swarm != null ? mc * 0.6 + swarm * 0.4 : mc
      const kal = t.kalshi_winner ?? KALSHI_FALLBACK[
        Object.keys(TEAM_DISPLAY).find(k => TEAM_DISPLAY[k] === t.name) || ''
      ] ?? 0
      const gap = combined - kal
      return { name: t.name, combined, mc, swarm, kal, gap }
    })
    .filter(r => r.combined > 0 || r.kal > 0)
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))

  const interpretations = [
    rows[0] && (rows[0].gap > 0
      ? `The model consensus puts ${rows[0].name} at ${rows[0].combined.toFixed(1)}% to win the UCL. Kalshi prices them at ${rows[0].kal.toFixed(1)}%. The model may be overrating their current form relative to market perception.`
      : `The model consensus has ${rows[0].name} at ${rows[0].combined.toFixed(1)}%. Kalshi has them at ${rows[0].kal.toFixed(1)}%. Market pricing likely reflects historical pedigree or recent momentum beyond what phase stats support.`),
    rows[1] && (rows[1].gap > 0
      ? `${rows[1].name} is a potential model overweight at ${rows[1].combined.toFixed(1)}% vs ${rows[1].kal.toFixed(1)}% Kalshi. Worth watching. If their next result disappoints, expect the consensus to converge toward market.`
      : `Kalshi has ${rows[1].name} at ${rows[1].kal.toFixed(1)}% vs the model consensus of ${rows[1].combined.toFixed(1)}%. Market narrative likely driven by name recognition beyond current form.`),
    rows[2] && (rows[2].gap > 0
      ? `${rows[2].name}: model consensus is ${Math.abs(rows[2].gap).toFixed(1)}pp above market. Third-largest divergence. Watch for convergence if they advance.`
      : `${rows[2].name}: market is ${Math.abs(rows[2].gap).toFixed(1)}pp above model consensus. Third-largest divergence in the opposite direction.`),
  ].filter(Boolean)

  return (
    <div className="space-y-4">
      <h3 className="font-display text-base text-brand-ink" style={{ fontWeight: 600 }}>Model vs Market Disparity</h3>

      {interpretations.length > 0 && (
        <div className="space-y-2">
          {interpretations.map((text, i) => (
            <div key={i} className="flex gap-3 bg-brand-shell border border-brand-border rounded-lg px-4 py-3 text-sm text-brand-navy">
              <span className="text-brand-orange font-bold flex-shrink-0">{i + 1}.</span>
              <span>{text}</span>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-brand-border" style={{ background: '#ade1ff' }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-border" style={{ background: '#edf4fb' }}>
              <th className="text-left px-4 py-3 text-brand-muted font-medium">Team</th>
              <th className="text-right px-4 py-3 text-brand-muted font-medium">Model consensus %</th>
              <th className="text-right px-4 py-3 text-brand-muted font-medium">Kalshi %</th>
              <th className="text-right px-4 py-3 text-brand-muted font-medium">Gap</th>
              <th className="text-left px-4 py-3 text-brand-muted font-medium">Direction</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const gapColor = r.gap > 3 ? '#2e7d32' : r.gap < -3 ? '#c62828' : '#7a7f9a'
              return (
                <tr key={r.name} className="border-b border-brand-border hover:bg-[#edf4fb] transition-colors">
                  <td className="px-4 py-2.5 font-medium text-brand-ink">{r.name}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-brand-navy">{r.combined.toFixed(1)}%</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-brand-navy">{r.kal.toFixed(1)}%</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium" style={{ color: gapColor }}>
                    {r.gap > 0 ? '+' : ''}{r.gap.toFixed(1)}pp
                  </td>
                  <td className="px-4 py-2.5 text-xs text-brand-muted">
                    {r.gap > 3 ? 'Model overweights' : r.gap < -3 ? 'Market overweights' : 'Models agree'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-brand-muted">
        Kalshi prices from KXUCL markets (YES bid, normalised). Fallback estimates used when markets unavailable.
        Gap = Model consensus% minus Kalshi%. Sorted by absolute gap.
        {swarmAvailable
          ? ' Model consensus = Monte Carlo × 0.6 + Agent Swarm × 0.4.'
          : ' Swarm not yet run. Consensus equals Monte Carlo only.'}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function MarketsView() {
  const [compareData, setCompareData] = useState(null)
  const [kalshiData, setKalshiData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [cmp, kal] = await Promise.all([
        fetchCompare(),
        fetchKalshi(),
      ])
      setCompareData(cmp)
      setKalshiData(kal)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <Spinner label="Loading market data..." />

  if (error) {
    return (
      <div className="bg-[#fce4ec] border border-[#f48fb1] rounded-lg p-6 text-[#b71c1c]">
        <p className="font-medium mb-1">Failed to load market data</p>
        <p className="text-sm font-mono">{error}</p>
        <button onClick={() => load()} className="mt-3 px-4 py-1.5 bg-white border border-[#f48fb1] rounded text-sm text-[#c62828]">
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-base text-brand-ink" style={{ fontWeight: 600 }}>Markets</h2>
          <p className="text-sm text-brand-muted mt-0.5">
            Kalshi advance odds · QF model prices · Model vs market disparity
          </p>
        </div>
        <button
          onClick={() => load()}
          className="px-3 py-1.5 text-xs bg-brand-shell hover:bg-brand-sky border border-brand-border rounded text-brand-navy transition-colors"
        >
          Refresh Kalshi
        </button>
      </div>

      <R16Section kalshiData={kalshiData} />
      <div className="border-t border-brand-border" />
      <QFSection compareData={compareData} />
      <div className="border-t border-brand-border" />
      <DisparitySection compareData={compareData} kalshiData={kalshiData} />
    </div>
  )
}
