import { useState, useEffect, useCallback } from 'react'
import { fetchRatings } from '../api.js'

const ACCENT = '#D4401A'
const LEAD_COLOR = '#1a7a3a'
const SORT_ACTIVE = '#4a4a4a'

function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 rounded-full animate-spin"
           style={{ border: '3px solid #dde2ee', borderTopColor: ACCENT }} />
      <span className="ml-3 text-brand-muted text-sm">Loading ratings...</span>
    </div>
  )
}

function DeltaBadge({ value }) {
  if (value === 0) return <span className="text-brand-muted">-</span>
  const color = value > 0 ? '#2e7d32' : '#c62828'
  return <span className="tabular-nums font-medium text-sm" style={{ color }}>{value > 0 ? '+' : ''}{value}</span>
}

const COLUMNS = [
  { key: 'elo',       label: 'ELO',       title: 'ELO rating' },
  { key: 'composite', label: 'Composite', title: '57% UCL + 25% DOM + 8% SOS + 7% KO History + 3% UEFA Coeff' },
  { key: 'ucl',       label: 'UCL',       title: 'UCL phase score (57% weight)' },
  { key: 'dom',       label: 'DOM',       title: 'Domestic form score (25% weight)' },
  { key: 'sos',       label: 'SOS',       title: 'Strength of Schedule (8% weight)' },
  { key: 'koh_pct',   label: 'KO Hist',   title: 'KO History % last 5 seasons (7% weight)' },
  { key: 'qawr',      label: 'QAWR',      title: 'Quality-Adjusted Win Rate' },
  { key: 'r16_delta', label: 'R16 Δ',     title: 'ELO change from R16 second leg result (K=32)' },
]

export default function RatingsTable() {
  const [ratings, setRatings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sortCol, setSortCol] = useState('elo')
  const [sortDir, setSortDir] = useState('desc')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchRatings()
      setRatings(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function handleSort(col) {
    if (sortCol === col) setSortDir((d) => d === 'desc' ? 'asc' : 'desc')
    else { setSortCol(col); setSortDir('desc') }
  }

  function SortIcon({ col }) {
    if (sortCol !== col) return <span className="ml-1" style={{ color: '#4a4a4a' }}>↕</span>
    return <span className="ml-1" style={{ color: SORT_ACTIVE }}>{sortDir === 'desc' ? '↓' : '↑'}</span>
  }

  const sorted = [...ratings].sort((a, b) => {
    const av = a[sortCol] ?? (sortDir === 'desc' ? -Infinity : Infinity)
    const bv = b[sortCol] ?? (sortDir === 'desc' ? -Infinity : Infinity)
    return sortDir === 'desc' ? bv - av : av - bv
  })

  if (loading) return <Spinner />

  if (error) {
    return (
      <div className="bg-[#fce4ec] border border-[#f48fb1] rounded-lg p-6 text-[#b71c1c]">
        <p className="font-medium mb-1">Failed to load ratings</p>
        <p className="text-sm font-mono">{error}</p>
        <button onClick={load} className="mt-3 px-4 py-1.5 bg-white border border-[#f48fb1] rounded text-sm text-[#c62828]">
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-base text-brand-ink" style={{ fontWeight: 600 }}>ELO Rankings</h2>
          <p className="text-sm text-brand-muted mt-0.5">
            57% UCL · 25% Domestic · 8% Schedule · 7% KO History · 3% UEFA Coefficient
          </p>
        </div>
        <button
          onClick={load}
          className="px-3 py-1.5 text-xs bg-brand-shell hover:bg-brand-sky border border-brand-border rounded text-brand-navy transition-colors"
        >
          Refresh
        </button>
      </div>

<div className="overflow-x-auto rounded-lg border border-brand-border" style={{ background: '#ade1ff' }}>
        <table className="w-full text-sm min-w-[800px]">
          <thead>
            <tr className="border-b border-brand-border" style={{ background: '#edf4fb' }}>
              <th className="font-display text-left px-3 py-3 text-brand-muted w-8" style={{ fontWeight: 600 }}>#</th>
              <th className="font-display text-left px-3 py-3 text-brand-muted" style={{ fontWeight: 600 }}>Team</th>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  title={col.title}
                  onClick={() => handleSort(col.key)}
                  className="font-display text-right px-3 py-3 text-brand-muted cursor-pointer hover:text-brand-ink select-none whitespace-nowrap transition-colors"
                  style={{ fontWeight: 600 }}
                >
                  {col.label} <SortIcon col={col.key} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, idx) => {
              const isTop = idx === 0 && !r.eliminated
              return (
                <tr
                  key={r.key}
                  className="border-b border-brand-border transition-colors hover:bg-[#edf4fb]"
                  style={{
                    opacity: r.eliminated ? 0.5 : 1,
                    borderLeft: isTop ? `3px solid ${ACCENT}` : undefined,
                  }}
                >
                  <td className="px-3 py-2.5 text-brand-muted tabular-nums">{idx + 1}</td>
                  <td className="px-3 py-2.5">
                    <span className={`font-display text-brand-ink ${r.eliminated ? 'line-through text-brand-muted' : ''}`}
                          style={{ fontWeight: 600 }}>
                      {r.name}
                    </span>
                    {r.eliminated && (
                      <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-[#fce4ec] border border-[#f48fb1] text-[#c62828] font-medium">
                        OUT
                      </span>
                    )}
                    {!r.eliminated && r.dc_bonus > 0 && (
                      <span className="ml-2 text-xs font-medium" style={{ color: ACCENT }} title="Defending champion bonus">DC</span>
                    )}
                  </td>
                  {/* ELO — numbers only, no bar */}
                  <td className="px-3 py-2.5 text-right">
                    <span className="tabular-nums font-medium"
                          style={{ color: r.elo >= 2100 ? LEAD_COLOR : r.elo >= 1900 ? '#388e3c' : '#3d4466' }}>
                      {r.elo.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-brand-navy">{r.composite.toFixed(1)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-brand-navy">{r.ucl.toFixed(1)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-brand-navy">{r.dom.toFixed(1)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-brand-muted">{r.sos.toFixed(1)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-brand-muted">{r.koh_pct.toFixed(0)}%</td>
                  {/* QAWR */}
                  <td className="px-3 py-2.5 text-right">
                    <span className="tabular-nums font-medium"
                          style={{ color: r.qawr >= 0.9 ? LEAD_COLOR : r.qawr >= 0.7 ? '#388e3c' : '#7a7f9a' }}>
                      {(r.qawr * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <DeltaBadge value={r.r16_delta ?? 0} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-brand-muted">
        <span><strong className="text-brand-navy">ELO range:</strong> 1650-2150 + KO and DC bonus</span>
        <span><strong className="text-brand-navy">QAWR:</strong> Quality-Adjusted Win Rate (opponent-weighted)</span>
        <span><strong className="text-brand-navy">R16 Δ:</strong> ELO change from R16 second leg (K=32)</span>
        <span>Click column headers to sort</span>
      </div>
    </div>
  )
}
