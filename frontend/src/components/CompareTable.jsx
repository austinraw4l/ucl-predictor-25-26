import { useState, useEffect, useCallback } from 'react'
import { fetchCompare, fetchRatings } from '../api.js'

function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-10 h-10 border-4 border-slate-600 border-t-yellow-400 rounded-full animate-spin" />
      <span className="ml-3 text-slate-400">Loading comparison data…</span>
    </div>
  )
}

function ProbBadge({ value, suffix = '%' }) {
  if (value == null || value === 0) {
    return <span className="text-slate-600">—</span>
  }
  const num = typeof value === 'string' ? parseFloat(value) : value
  let cls = 'text-slate-400'
  if (num >= 15) cls = 'text-emerald-400 font-semibold'
  else if (num >= 8) cls = 'text-yellow-400'

  return (
    <span className={cls}>
      {num.toFixed(1)}{suffix}
    </span>
  )
}

function GapBadge({ value }) {
  if (value == null) return <span className="text-slate-600">—</span>
  const num = typeof value === 'string' ? parseFloat(value) : value
  const abs = Math.abs(num)
  let cls = 'text-slate-400'
  let prefix = ''
  if (num > 3) { cls = 'text-emerald-400 font-semibold'; prefix = '+' }
  else if (num < -3) { cls = 'text-red-400 font-semibold'; prefix = '' }
  return (
    <span className={cls}>
      {prefix}{num.toFixed(1)}pp
    </span>
  )
}

function TeamBadge({ name, mcProb }) {
  const num = typeof mcProb === 'string' ? parseFloat(mcProb) : (mcProb || 0)
  let badge = null
  if (num >= 15) badge = <span title="Top MC favourite">👑</span>
  else if (num >= 10) badge = <span title="Strong MC contender">🔥</span>
  return (
    <span className="flex items-center gap-1.5">
      {badge}
      <span className="font-medium text-slate-100">{name}</span>
    </span>
  )
}

function SignalCard({ icon, label, team, value, sublabel }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 flex-1 min-w-0">
      <div className="text-xs text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1">
        <span>{icon}</span> {label}
      </div>
      <div className="text-lg font-bold text-white truncate">{team || '—'}</div>
      {value != null && (
        <div className="text-emerald-400 text-sm font-semibold mt-0.5">{value}</div>
      )}
      {sublabel && (
        <div className="text-slate-500 text-xs mt-0.5">{sublabel}</div>
      )}
    </div>
  )
}

// Merge compare data with ELO from ratings array
function mergeData(compareData, ratingsArray) {
  if (!compareData) return []
  // /api/ratings returns a flat array of { key, name, elo, ... }
  const ratingsByName = {}
  if (Array.isArray(ratingsArray)) {
    ratingsArray.forEach((r) => { ratingsByName[r.name] = r })
  }
  // /api/compare returns { teams: [ { name, elo, mc_winner, kalshi_winner, ... } ] }
  const teams = Array.isArray(compareData.teams) ? compareData.teams : []
  return teams.map((t) => ({
    key: t.name?.replace(/\s+/g, '') || t.name,
    name: t.name,
    elo: t.elo ?? ratingsByName[t.name]?.elo,
    mc_winner: t.mc_winner,
    kalshi_winner: t.kalshi_winner,
    swarm_winner: t.swarm_winner,
    mc_vs_kalshi: t.mc_vs_kalshi,
  }))
}

export default function CompareTable() {
  const [compareData, setCompareData] = useState(null)
  const [ratingsData, setRatingsData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sortCol, setSortCol] = useState('mc_winner')
  const [sortDir, setSortDir] = useState('desc')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [cmp, rat] = await Promise.all([fetchCompare(), fetchRatings()])
      setCompareData(cmp)
      setRatingsData(rat)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const rows = mergeData(compareData, ratingsData)

  // Sort rows
  const sorted = [...rows].sort((a, b) => {
    const av = a[sortCol] ?? -Infinity
    const bv = b[sortCol] ?? -Infinity
    const numA = typeof av === 'string' ? parseFloat(av) : av
    const numB = typeof bv === 'string' ? parseFloat(bv) : bv
    return sortDir === 'desc' ? numB - numA : numA - numB
  })

  function handleSort(col) {
    if (sortCol === col) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortCol(col)
      setSortDir('desc')
    }
  }

  function SortIcon({ col }) {
    if (sortCol !== col) return <span className="text-slate-600 ml-1">↕</span>
    return <span className="text-yellow-400 ml-1">{sortDir === 'desc' ? '↓' : '↑'}</span>
  }

  // Signal card data
  const topMC = rows.length
    ? [...rows].sort((a, b) => (b.mc_winner ?? 0) - (a.mc_winner ?? 0))[0]
    : null
  const topKalshi = rows.length
    ? [...rows].sort((a, b) => (b.kalshi_winner ?? 0) - (a.kalshi_winner ?? 0))[0]
    : null
  const topEdge = rows.length
    ? [...rows].sort((a, b) => Math.abs(b.mc_vs_kalshi ?? 0) - Math.abs(a.mc_vs_kalshi ?? 0))[0]
    : null

  if (loading) return <Spinner />

  if (error) {
    return (
      <div className="bg-red-950/40 border border-red-800 rounded-lg p-6 text-red-300">
        <h3 className="font-semibold text-red-200 mb-1">Failed to load comparison data</h3>
        <p className="text-sm font-mono">{error}</p>
        <button
          onClick={load}
          className="mt-3 px-4 py-1.5 bg-red-900/50 hover:bg-red-800/50 border border-red-700 rounded text-sm text-red-200 transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Signal Cards */}
      <div className="flex gap-3 flex-wrap">
        <SignalCard
          icon="🤖"
          label="MC Favourite"
          team={topMC?.name}
          value={topMC?.mc_winner != null ? `${parseFloat(topMC.mc_winner).toFixed(1)}% to win` : null}
          sublabel="50,000 simulations"
        />
        <SignalCard
          icon="📈"
          label="Kalshi Favourite"
          team={topKalshi?.name}
          value={topKalshi?.kalshi_winner != null ? `${parseFloat(topKalshi.kalshi_winner).toFixed(1)}% implied` : null}
          sublabel="Live prediction market"
        />
        <SignalCard
          icon="⚡"
          label="Biggest Model Edge"
          team={topEdge?.name}
          value={
            topEdge?.mc_vs_kalshi != null
              ? `${topEdge.mc_vs_kalshi > 0 ? '+' : ''}${parseFloat(topEdge.mc_vs_kalshi).toFixed(1)}pp vs Kalshi`
              : null
          }
          sublabel={topEdge?.mc_vs_kalshi > 0 ? 'Model overweights market' : 'Market overweights model'}
        />
      </div>

      {/* Refresh button */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-200">
          Model vs Market Comparison
          <span className="ml-2 text-sm font-normal text-slate-500">({rows.length} teams)</span>
        </h2>
        <button
          onClick={load}
          className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-slate-300 transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-800 border-b border-slate-700">
              <th className="text-left px-4 py-3 text-slate-400 font-medium w-8">#</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Team</th>
              <th
                className="text-right px-4 py-3 text-slate-400 font-medium cursor-pointer hover:text-white select-none"
                onClick={() => handleSort('elo')}
              >
                ELO <SortIcon col="elo" />
              </th>
              <th
                className="text-right px-4 py-3 text-slate-400 font-medium cursor-pointer hover:text-white select-none"
                onClick={() => handleSort('mc_winner')}
              >
                Monte Carlo <SortIcon col="mc_winner" />
              </th>
              <th
                className="text-right px-4 py-3 text-slate-400 font-medium cursor-pointer hover:text-white select-none"
                onClick={() => handleSort('kalshi_winner')}
              >
                Kalshi <SortIcon col="kalshi_winner" />
              </th>
              <th
                className="text-right px-4 py-3 text-slate-400 font-medium cursor-pointer hover:text-white select-none"
                onClick={() => handleSort('swarm_winner')}
              >
                Swarm <SortIcon col="swarm_winner" />
              </th>
              <th
                className="text-right px-4 py-3 text-slate-400 font-medium cursor-pointer hover:text-white select-none"
                onClick={() => handleSort('mc_vs_kalshi')}
              >
                Model vs Market <SortIcon col="mc_vs_kalshi" />
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((team, idx) => {
              const mcNum = parseFloat(team.mc_winner) || 0
              let rowBg = idx % 2 === 0 ? 'bg-slate-900' : 'bg-slate-800/60'
              return (
                <tr
                  key={team.key}
                  className={`${rowBg} border-b border-slate-800 hover:bg-slate-700/40 transition-colors`}
                >
                  <td className="px-4 py-3 text-slate-500">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <TeamBadge name={team.name} mcProb={team.mc_winner} />
                  </td>
                  <td className="px-4 py-3 text-right text-slate-300 tabular-nums">
                    {team.elo ? team.elo.toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <ProbBadge value={team.mc_winner} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <ProbBadge value={team.kalshi_winner} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <ProbBadge value={team.swarm_winner} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <GapBadge value={team.mc_vs_kalshi} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
        <span><span className="text-emerald-400">■</span> ≥15%, strong favourite</span>
        <span><span className="text-yellow-400">■</span> 8–15%, contender</span>
        <span><span className="text-slate-400">■</span> &lt;8%, outsider</span>
        <span><span className="text-emerald-400">+pp</span> Model overweights vs Kalshi</span>
        <span><span className="text-red-400">−pp</span> Market overweights vs model</span>
        <span>👑 MC winner prob ≥15%</span>
        <span>🔥 MC winner prob ≥10%</span>
      </div>
    </div>
  )
}
