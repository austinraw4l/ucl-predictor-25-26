import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend,
} from 'recharts'
import { fetchSwarm } from '../api.js'

const SWARM_ELIMINATED = new Set(['Chelsea','ManCity','Leverkusen','Bodo','Newcastle','Galatasaray','Tottenham','Atalanta'])

const TEAM_COLORS = {
  Arsenal:    '#EF0107', Bayern:     '#DC052D', RealMadrid: '#FEBE10',
  PSG:        '#004170', Barcelona:  '#A50044', Liverpool:  '#C8102E',
  Atletico:   '#CB3524', Sporting:   '#006600', Newcastle:  '#241F20',
  Chelsea:    '#034694', ManCity:    '#6CABDD', Leverkusen: '#E32221',
  Galatasaray:'#F5A623', Tottenham:  '#132257', Atalanta:   '#1E3A8A',
  Bodo:       '#FFDD00',
}

const TEAM_DISPLAY = {
  Bayern: 'Bayern', Arsenal: 'Arsenal', RealMadrid: 'Real Madrid',
  PSG: 'PSG', Barcelona: 'Barca', Liverpool: 'Liverpool',
  Leverkusen: 'Leverkusen', Atletico: 'Atletico', Sporting: 'Sporting',
  Newcastle: 'Newcastle', ManCity: 'Man City', Chelsea: 'Chelsea',
  Bodo: 'Bodo', Galatasaray: 'Galatasaray', Tottenham: 'Spurs', Atalanta: 'Atalanta',
}

const CONFIDENCE_STYLES = {
  HIGH: { color: '#2e7d32', bg: '#e8f5e9', border: '#a5d6a7' },
  MED:  { color: '#e65100', bg: '#fff3e0', border: '#ffcc80' },
  LOW:  { color: '#c62828', bg: '#fce4ec', border: '#f48fb1' },
}

function buildChartData(data) {
  const allTeams = Object.keys(data.final_consensus_probs)
    .filter(k => (data.final_consensus_probs[k] ?? 0) > 0)
    .sort((a, b) => data.final_consensus_probs[b] - data.final_consensus_probs[a])

  return allTeams.map((key) => ({
    team: TEAM_DISPLAY[key] || key,
    teamKey: key,
    r1: data.round1_picks?.[key] ?? 0,
    r2: data.round2_picks?.[key] ?? 0,
    final: data.final_consensus_probs?.[key] ?? 0,
  }))
}

function AgentChip({ name }) {
  return (
    <span className="inline-block bg-[#edf4fb] border border-brand-border rounded-full px-2.5 py-0.5 text-xs text-brand-navy">
      {name}
    </span>
  )
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-brand-border rounded-lg p-3 text-xs shadow-md">
      <p className="font-medium text-brand-ink mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' && p.name === 'final %' ? `${p.value.toFixed(1)}%` : p.value}
        </p>
      ))}
    </div>
  )
}

function cleanText(text) {
  if (!text) return text
  return text
    .replace(/ — /g, ', ')
    .replace(/—/g, ', ')
    .replace(/ – /g, ', ')
    .replace(/–/g, ', ')
}

function parseNarrative(text) {
  if (!text) return []
  const sections = []
  const lines = text.split('\n')
  let current = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (current) current.body.push('')
      continue
    }
    if (trimmed.startsWith('===') && trimmed.endsWith('===')) {
      if (current) sections.push(current)
      current = { heading: trimmed.replace(/===/g, '').trim(), body: [] }
    } else if (current) {
      current.body.push(trimmed)
    }
  }
  if (current) sections.push(current)
  return sections
}

function RoundSection({ section }) {
  const [open, setOpen] = useState(true)

  const roundStyles = {
    'ROUND 1: INDEPENDENT VIEWS': { border: '#90caf9', bg: '#e3f2fd33' },
    'ROUND 2: SOCIAL INTERACTION': { border: '#D4401A', bg: '#fff8f333' },
    'ROUND 3: CONSENSUS EMERGENCE': { border: '#a5d6a7', bg: '#f1f8e933' },
  }
  const style = roundStyles[section.heading] || { border: '#dde2ee', bg: '#ade1ff33' }

  const renderLines = (lines) => {
    const out = []
    let i = 0
    while (i < lines.length) {
      const line = lines[i]
      if (!line) { out.push(<div key={i} className="h-2" />); i++; continue }

      if (line === line.toUpperCase() && line.length > 4 && !line.startsWith('"')) {
        out.push(
          <p key={i} className="text-xs font-bold text-brand-muted uppercase tracking-widest mt-3 mb-1">
            {line}
          </p>
        )
        i++; continue
      }

      const speakerMatch = line.match(/^([A-ZÁ][a-záéíóúüñ\s.]+)\s*\(([^)]+)\):$/)
      if (speakerMatch) {
        const name = speakerMatch[1]
        const role = speakerMatch[2]
        const quoteLines = []
        i++
        while (i < lines.length && lines[i] !== '' && !lines[i].match(/^[A-Z][a-z\s.]+\s*\([^)]+\):$/)) {
          quoteLines.push(lines[i])
          i++
        }
        out.push(
          <div key={i} className="my-3 border-l-2 pl-3" style={{ borderColor: '#D4401A' }}>
            <div className="text-xs font-semibold text-brand-orange mb-0.5">{name}</div>
            <div className="text-xs text-brand-muted mb-1">{role}</div>
            <p className="text-sm italic text-brand-navy leading-relaxed">
              "{quoteLines.join(' ')}"
            </p>
          </div>
        )
        continue
      }

      if (line.startsWith('CLUSTER') || line.startsWith('KEY') || line.startsWith('AGENTS') || line.startsWith('FINAL STATE') || line.startsWith('ROUND')) {
        out.push(
          <p key={i} className="text-xs font-semibold text-brand-muted mt-3 mb-1 uppercase tracking-wide">
            {line}
          </p>
        )
        i++; continue
      }

      out.push(
        <p key={i} className="text-sm text-brand-navy leading-relaxed mb-1">
          {line}
        </p>
      )
      i++
    }
    return out
  }

  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: style.border, background: style.bg }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-brand-ink hover:bg-black/5 transition-colors"
      >
        <span>{section.heading}</span>
        <span className="text-brand-muted text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-black/5">
          {renderLines(section.body)}
        </div>
      )}
    </div>
  )
}

const ROUND_DEFS = [
  { cacheKey: 'round1', label: 'Round 1', color: '#1565c0' },
  { cacheKey: 'round2', label: 'Round 2', color: '#D4401A' },
  { cacheKey: 'round3', label: 'Round 3', color: '#2e7d32' },
]

function KeyLinesView({ roundKeyLines }) {
  const hasData = roundKeyLines &&
    (roundKeyLines.round1?.length > 0 || roundKeyLines.round2?.length > 0 || roundKeyLines.round3?.length > 0)

  if (!hasData) {
    return (
      <div className="bg-brand-shell border border-brand-border rounded-lg p-4">
        <h3 className="font-display text-sm text-brand-ink mb-2" style={{ fontWeight: 600 }}>Key Lines by Round</h3>
        <p className="text-sm text-brand-muted italic">The simulation has not run yet. Once run, key lines from each round will appear here.</p>
      </div>
    )
  }

  return (
    <div className="bg-brand-shell border border-brand-border rounded-lg p-4 space-y-6">
      <h3 className="font-display text-sm text-brand-ink" style={{ fontWeight: 600 }}>Key Lines by Round</h3>
      {ROUND_DEFS.map(({ cacheKey, label, color }) => {
        const quotes = roundKeyLines[cacheKey] ?? []
        if (quotes.length === 0) return null
        return (
          <div key={cacheKey}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-bold px-2 py-0.5 rounded"
                    style={{ background: color + '18', color, border: `1px solid ${color}40` }}>
                {label}
              </span>
            </div>
            <div className="space-y-3">
              {quotes.map((q, i) => (
                <div key={i} className="border-l-2 pl-4 py-1" style={{ borderColor: color }}>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-semibold text-brand-ink">{q.agent}</span>
                    <span className="text-xs text-brand-muted">{q.badge}</span>
                  </div>
                  <p className="text-sm italic text-brand-navy leading-relaxed">"{cleanText(q.quote)}"</p>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function SwarmView() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchSwarm(false)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-3 border-brand-border border-t-brand-orange rounded-full animate-spin"
             style={{ borderWidth: 3, borderTopColor: '#D4401A' }} />
        <span className="ml-3 text-brand-muted text-sm">Loading swarm data...</span>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center space-y-3">
        <h2 className="text-xl font-medium text-brand-ink">Swarm data unavailable</h2>
        <p className="text-brand-muted text-sm">{error || 'No data returned from API.'}</p>
      </div>
    )
  }

  const chartData = buildChartData(data)
  const winnerColor = TEAM_COLORS[data.swarm_winner] || '#D4401A'
  const confStyle = CONFIDENCE_STYLES[data.swarm_confidence] || CONFIDENCE_STYLES.MED

  const runDate = data.run_at
    ? new Date(data.run_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'unknown'

  const narrativeSections = parseNarrative(data.narrative)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base text-brand-ink" style={{ fontWeight: 600 }}>
            Agent Swarm
            <span className="ml-2 text-xs font-normal text-brand-muted bg-brand-shell border border-brand-border rounded px-2 py-0.5">
              snapshot
            </span>
          </h2>
          <p className="text-sm text-brand-muted mt-0.5">
            {data.total_agents} agents · {data.rounds} rounds · Simulation run: {runDate}
          </p>
        </div>
        <div className="text-xs text-brand-muted bg-brand-shell border border-brand-border rounded-lg px-3 py-2 max-w-xs text-right">
          Simulation run once after R16 second legs.<br />
          {data.total_agents} agents · {data.rounds} rounds · {runDate}.
        </div>
      </div>

      {/* Winner banner */}
      <div
        className="rounded-xl border p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4"
        style={{ borderColor: winnerColor + '60', background: winnerColor + '18' }}
      >
        <div className="flex-1">
          <div className="text-xs text-brand-muted uppercase tracking-wide mb-1">Swarm consensus winner</div>
          <div className="text-3xl font-black" style={{ color: winnerColor }}>
            {TEAM_DISPLAY[data.swarm_winner] || data.swarm_winner}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full border"
              style={{ color: confStyle.color, background: confStyle.bg, borderColor: confStyle.border }}
            >
              {data.swarm_confidence} confidence
            </span>
            <span className="text-sm text-brand-navy">
              {data.final_consensus_probs?.[data.swarm_winner]?.toFixed(1)}% consensus probability
            </span>
          </div>
        </div>
        <blockquote className="italic text-brand-muted text-sm max-w-xs border-l-2 pl-3 leading-relaxed" style={{ borderColor: '#dde2ee' }}>
          "{cleanText(data.emergent_narrative)}"
        </blockquote>
      </div>

      {/* Chart */}
      <div className="bg-brand-shell border border-brand-border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-1 self-stretch rounded-full" style={{ background: '#D4401A', minHeight: '1.1rem' }} />
          <h3 className="font-display text-sm text-brand-ink" style={{ fontWeight: 600 }}>
            Agent Picks by Round
          </h3>
        </div>
        <p className="text-xs text-brand-muted mb-4 ml-3">
          R1/R2 = agent count · Final = consensus % probability
        </p>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 0, right: 40, left: 130, bottom: 0 }}
          >
            <XAxis type="number" tick={{ fill: '#7a7f9a', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis
              type="category"
              dataKey="team"
              width={125}
              tick={{ fill: '#1a1a2e', fontSize: 12, fontFamily: 'DM Sans', fontWeight: 600 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
            <Legend formatter={(v) => <span style={{ color: '#7a7f9a', fontSize: 11 }}>{v}</span>} />
            <Bar dataKey="r1" name="R1 picks" fill="#dde2ee" radius={[0, 2, 2, 0]} />
            <Bar dataKey="r2" name="R2 picks" fill="#c5cad9" radius={[0, 2, 2, 0]} />
            <Bar dataKey="final" name="final %" radius={[0, 3, 3, 0]}>
              {chartData.map((entry) => (
                <Cell key={entry.teamKey} fill={TEAM_COLORS[entry.teamKey] || '#D4401A'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Final consensus probability grid */}
      <div className="bg-brand-shell border border-brand-border rounded-lg p-4">
        <h3 className="font-display text-sm text-brand-ink mb-3" style={{ fontWeight: 600 }}>Final Consensus Probabilities</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Object.entries(data.final_consensus_probs)
            .sort(([, a], [, b]) => b - a)
            .map(([key, prob]) => {
              const color = TEAM_COLORS[key] || '#3d4466'
              const maxProb = Math.max(...Object.values(data.final_consensus_probs))
              const pct = Math.min(100, (prob / maxProb) * 100)
              const isOut = SWARM_ELIMINATED.has(key)
              return (
                <div key={key} className="bg-white rounded-lg p-3 border border-brand-border" style={{ opacity: isOut ? 0.55 : 1 }}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                  <div className="font-display text-xs text-brand-muted truncate" style={{ fontWeight: 600 }}>{TEAM_DISPLAY[key] || key}</div>
                  {isOut && <span className="text-[9px] px-1 py-0.5 rounded font-medium flex-shrink-0" style={{ background: '#fce4ec', border: '1px solid #f48fb1', color: '#c62828' }}>OUT</span>}
                  </div>
                  <div className="mt-1">
                    <span className="text-lg font-bold tabular-nums" style={{ color }}>
                      {prob.toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-1.5 bg-brand-border rounded-full h-1">
                    <div className="h-1 rounded-full" style={{ width: `${pct}%`, background: color }} />
                  </div>
                </div>
              )
            })}
          {/* Eliminated teams not in probs */}
          {['Chelsea', 'ManCity', 'Leverkusen', 'Bodo', 'Newcastle', 'Galatasaray', 'Tottenham', 'Atalanta'].filter(k => !(k in data.final_consensus_probs)).map(key => (
            <div key={key} className="bg-white rounded-lg p-3 border border-brand-border opacity-50">
              <div className="flex items-center gap-1.5 mb-0.5">
                <div className="font-display text-xs text-brand-muted truncate" style={{ fontWeight: 600 }}>{TEAM_DISPLAY[key] || key}</div>
                <span className="text-[9px] px-1 py-0.5 rounded bg-[#fce4ec] border border-[#f48fb1] text-[#c62828] font-medium leading-none">OUT</span>
              </div>
              <div className="mt-1">
                <span className="text-lg font-bold tabular-nums text-brand-muted">0.0%</span>
              </div>
              <div className="mt-1.5 bg-brand-border rounded-full h-1" />
            </div>
          ))}
        </div>
      </div>

      {/* Key Lines by Round */}
      <KeyLinesView roundKeyLines={data.round_key_lines} />
    </div>
  )
}
