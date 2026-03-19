import { useState, useEffect, useCallback } from 'react'
import { fetchMonteCarlo, fetchPreR16MonteCarlo } from '../api.js'

// ---------------------------------------------------------------------------
// Team data
// ---------------------------------------------------------------------------

const TEAM_DISPLAY = {
  PSG: 'PSG', Chelsea: 'Chelsea', Galatasaray: 'Galatasaray', Liverpool: 'Liverpool',
  RealMadrid: 'Real Madrid', ManCity: 'Man City', Atalanta: 'Atalanta', Bayern: 'Bayern',
  Newcastle: 'Newcastle', Barcelona: 'Barcelona', Atletico: 'Atletico',
  Tottenham: 'Tottenham', Sporting: 'Sporting CP', Bodo: 'Bodø/Glimt',
  Leverkusen: 'Leverkusen', Arsenal: 'Arsenal',
}

const TEAM_COLORS = {
  Arsenal:    '#EF0107', Bayern:     '#DC052D', RealMadrid: '#FEBE10',
  PSG:        '#004170', Barcelona:  '#A50044', Liverpool:  '#C8102E',
  Atletico:   '#CB3524', Sporting:   '#006600', Newcastle:  '#241F20',
  Chelsea:    '#034694', ManCity:    '#6CABDD', Leverkusen: '#E32221',
  Galatasaray:'#F5A623', Tottenham:  '#132257', Atalanta:   '#1E3A8A',
  Bodo:       '#FFDD00',
}

const TEAM_ELO = {
  Bayern: 2241, Arsenal: 2215, RealMadrid: 1964, Liverpool: 1937, Barcelona: 1925,
  PSG: 1906, Leverkusen: 1893, Newcastle: 1857, ManCity: 1833, Chelsea: 1812,
  Atletico: 1833, Tottenham: 1799, Bodo: 1768, Sporting: 1763, Atalanta: 1702, Galatasaray: 1659,
}

// Pre-R16 ELOs — before K=32 updates from second legs (17 Mar 2026)
const PRE_R16_ELO = {
  Bayern: 2240, Arsenal: 2210, RealMadrid: 1953, Liverpool: 1931, Barcelona: 1911,
  PSG: 1893, Leverkusen: 1898, Newcastle: 1871, ManCity: 1844, Chelsea: 1825,
  Atletico: 1817, Tottenham: 1815, Bodo: 1786, Sporting: 1745, Atalanta: 1703, Galatasaray: 1665,
}

const ELIMINATED = new Set(['Chelsea','ManCity','Leverkusen','Bodo','Newcastle','Galatasaray','Tottenham','Atalanta'])

// ---------------------------------------------------------------------------
// Bracket data
// ---------------------------------------------------------------------------

const LIVE_R16 = [
  { id:'PSG_Chelsea',    home:'PSG',        away:'Chelsea',    agg:'8–2',  confirmed:true,  winner:'PSG',        path:'silver' },
  { id:'Gala_Liverpool', home:'Galatasaray', away:'Liverpool', agg:'1–1',  confirmed:true,  winner:'Liverpool',  path:'silver' },
  { id:'Real_ManCity',   home:'RealMadrid',  away:'ManCity',   agg:'5–1',  confirmed:true,  winner:'RealMadrid', path:'silver' },
  { id:'Atalanta_Bayern',home:'Atalanta',    away:'Bayern',    agg:'9–1',  confirmed:true,  winner:'Bayern',     path:'silver' },
  { id:'Newcastle_Barca',home:'Newcastle',   away:'Barcelona', agg:'1–2',  confirmed:true,  winner:'Barcelona',  path:'blue' },
  { id:'Atletico_Spurs', home:'Atletico',    away:'Tottenham', agg:'6–3',  confirmed:true,  winner:'Atletico',   path:'blue' },
  { id:'Sporting_Bodo',  home:'Sporting',    away:'Bodo',      agg:'5–3',  confirmed:true,  winner:'Sporting',   path:'blue' },
  { id:'Lev_Arsenal',    home:'Leverkusen',  away:'Arsenal',   agg:'3–1',  confirmed:true,  winner:'Arsenal',    path:'blue' },
]

const QF_LIVE = [
  { id:'QF1', slotA:{tieId:'PSG_Chelsea',    confirmed:'PSG'},       slotB:{tieId:'Gala_Liverpool',  confirmed:'Liverpool'} },
  { id:'QF2', slotA:{tieId:'Real_ManCity',   confirmed:'RealMadrid'},slotB:{tieId:'Atalanta_Bayern', confirmed:'Bayern'} },
  { id:'QF3', slotA:{tieId:'Newcastle_Barca',confirmed:'Barcelona'}, slotB:{tieId:'Atletico_Spurs',  confirmed:'Atletico'} },
  { id:'QF4', slotA:{tieId:'Sporting_Bodo',  confirmed:'Sporting'},  slotB:{tieId:'Lev_Arsenal',     confirmed:'Arsenal'} },
]

// ---------------------------------------------------------------------------
// Model view: ELO-based predictions
// ---------------------------------------------------------------------------

function modelPick(a, b) {
  return (PRE_R16_ELO[a] || 0) >= (PRE_R16_ELO[b] || 0) ? a : b
}

const MODEL_R16 = LIVE_R16.map(tie => ({
  ...tie,
  modelWinner: modelPick(tie.home, tie.away),
  upset: tie.confirmed && tie.winner && tie.winner !== modelPick(tie.home, tie.away),
}))

const MODEL_QF = QF_LIVE.map(qf => {
  const tieA = MODEL_R16.find(t => t.id === qf.slotA.tieId)
  const tieB = MODEL_R16.find(t => t.id === qf.slotB.tieId)
  const mA = tieA?.modelWinner ?? null
  const mB = tieB?.modelWinner ?? null
  return { ...qf, slotA:{ ...qf.slotA, confirmed: mA }, slotB:{ ...qf.slotB, confirmed: mB }, modelWinner: modelPick(mA, mB) }
})

function modelQFWinner(qfId) {
  return MODEL_QF.find(q => q.id === qfId)?.modelWinner
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function p(val) {
  if (val == null) return null
  const n = parseFloat(val)
  return isNaN(n) ? null : n
}

function OutBadge() {
  return (
    <span style={{
      fontSize: 9, padding: '0 3px', lineHeight: '14px', borderRadius: 3, fontWeight: 700,
      background: '#fce4ec', border: '1px solid #f48fb1', color: '#c62828',
      marginLeft: 4, whiteSpace: 'nowrap', flexShrink: 0,
    }}>OUT</span>
  )
}

// ---------------------------------------------------------------------------
// Compact R16 tie card
// ---------------------------------------------------------------------------

function R16Card({ tieId, view, mcProbs }) {
  const source = view === 'model' ? MODEL_R16 : LIVE_R16
  const tie = source.find(t => t.id === tieId)
  if (!tie) return null

  // For live view, look up whether this was a model upset
  const modelTie = MODEL_R16.find(t => t.id === tieId)
  const isUpset = modelTie?.upset

  const isConf = view === 'model' ? !!tie.modelWinner : tie.confirmed
  const winner = view === 'model' ? tie.modelWinner : tie.winner

  function TeamRow({ teamKey }) {
    const name = TEAM_DISPLAY[teamKey] || teamKey
    const isWinner = isConf && winner === teamKey
    const isLoser  = isConf && winner !== teamKey
    const isOut    = view !== 'model' && (isLoser || ELIMINATED.has(teamKey))
    const isLeading = !isConf && tie.advantage === teamKey
    const mcWin = isWinner ? p(mcProbs?.[teamKey]?.winner) : null

    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderRadius: 4, padding: '2px 4px',
        background: isWinner ? '#dcfce7' : isLeading ? '#fffbeb' : 'transparent',
        opacity: isOut ? 0.55 : 1,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
          {isWinner && <span style={{ color: '#16a34a', fontSize: 10, marginRight: 3 }}>✓</span>}
          <span style={{
            fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 600, fontSize: 11,
            color: isWinner ? '#166534' : isOut ? '#aaa' : isLeading ? '#92400e' : '#3d4466',
            textDecoration: isOut ? 'line-through' : 'none',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {name}
          </span>
          {isOut && <OutBadge />}
        </div>
        {mcWin != null && (
          <span style={{ fontSize: 9, color: '#2e7d32', fontWeight: 700, marginLeft: 4, flexShrink: 0 }}>
            {mcWin.toFixed(1)}%
          </span>
        )}
      </div>
    )
  }

  return (
    <div style={{
      width: 160, borderRadius: 6, flexShrink: 0,
      border: `1px solid ${isConf ? '#86efac' : '#dde2ee'}`,
      background: isConf ? '#f0fdf4' : '#ade1ff',
      padding: '5px 7px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 9, color: '#7a7f9a', fontWeight: 600 }}>{tie.agg}</span>
        {isConf
          ? <span style={{ fontSize: 9, color: '#16a34a', fontWeight: 700 }}>CONFIRMED</span>
          : <span style={{ fontSize: 9, color: '#D4401A', fontWeight: 700 }}>LIVE</span>}
      </div>
      <TeamRow teamKey={tie.home} />
      <TeamRow teamKey={tie.away} />
      {view === 'model' && isUpset && (
        <div style={{ fontSize: 8, color: '#c2410c', marginTop: 2, textAlign: 'right', fontWeight: 600 }}>
          ⚡ UPSET IN LIVE
        </div>
      )}
      {view === 'live' && isUpset && (
        <div style={{ fontSize: 8, color: '#c2410c', marginTop: 2, textAlign: 'right', fontWeight: 600 }}>
          ⚡ UPSET
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// QF slot card
// ---------------------------------------------------------------------------

function QFCard({ qfId, view, mcProbs }) {
  const source = view === 'model' ? MODEL_QF : QF_LIVE
  const qf = source.find(q => q.id === qfId)
  if (!qf) return null

  const tieById = Object.fromEntries(LIVE_R16.map(t => [t.id, t]))

  function Slot({ slot }) {
    if (slot.confirmed) {
      const key = slot.confirmed
      const mcWin = p(mcProbs?.[key]?.winner)
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#e8f5e9', border: '1px solid #81c784', borderRadius: 4, padding: '3px 6px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ color: '#16a34a', fontSize: 10, marginRight: 3 }}>✓</span>
            <span style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 600, fontSize: 11, color: '#166534' }}>
              {TEAM_DISPLAY[key] || key}
            </span>
          </div>
          {mcWin != null && (
            <span style={{ fontSize: 9, color: '#2e7d32', fontWeight: 700, marginLeft: 4 }}>
              {mcWin.toFixed(1)}%
            </span>
          )}
        </div>
      )
    }
    const tie = tieById[slot.tieId]
    const label = tie ? `${TEAM_DISPLAY[tie.home]} / ${TEAM_DISPLAY[tie.away]}` : 'TBD'
    return (
      <div style={{
        border: '1px dashed #c5cad9', borderRadius: 4, padding: '3px 6px',
        fontSize: 10, color: '#7a7f9a', fontStyle: 'italic',
      }}>
        {label}
      </div>
    )
  }

  return (
    <div style={{
      width: 152, borderRadius: 6, flexShrink: 0,
      border: '1px solid #dde2ee', background: '#ade1ff', padding: '5px 7px',
    }}>
      <div style={{ fontSize: 9, color: '#7a7f9a', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {qf.id}
      </div>
      <Slot slot={qf.slotA} />
      <div style={{ textAlign: 'center', fontSize: 9, color: '#7a7f9a', margin: '2px 0' }}>vs</div>
      <Slot slot={qf.slotB} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// SF slot card
// ---------------------------------------------------------------------------

function SFCard({ sfId, qfAId, qfBId, view, mcProbs }) {
  const liveQFById = Object.fromEntries(QF_LIVE.map(q => [q.id, q]))
  const modelQFById = Object.fromEntries(MODEL_QF.map(q => [q.id, q]))

  function SFSlot({ qfId }) {
    const liveQF = liveQFById[qfId]
    const modelQF = modelQFById[qfId]
    const bothConfirmed = liveQF?.slotA.confirmed && liveQF?.slotB.confirmed
    const modelW = modelQF?.modelWinner

    if (view === 'model' && modelW) {
      const mcWin = p(mcProbs?.[modelW]?.winner)
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#fff3e0', border: '1px solid #ffb74d', borderRadius: 4, padding: '3px 6px',
        }}>
          <span style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 600, fontSize: 11, color: '#92400e' }}>
            {TEAM_DISPLAY[modelW] || modelW}
          </span>
          {mcWin != null && <span style={{ fontSize: 9, color: '#e65100', fontWeight: 700, marginLeft: 4 }}>{mcWin.toFixed(1)}%</span>}
        </div>
      )
    }

    if (view === 'live' && bothConfirmed) {
      const a = liveQF.slotA.confirmed
      const b = liveQF.slotB.confirmed
      return (
        <div style={{ border: '1px dashed #c5cad9', borderRadius: 4, padding: '3px 6px', fontSize: 10, color: '#7a7f9a', fontStyle: 'italic' }}>
          {TEAM_DISPLAY[a]} vs {TEAM_DISPLAY[b]}
        </div>
      )
    }

    return (
      <div style={{ border: '1px dashed #c5cad9', borderRadius: 4, padding: '3px 6px', fontSize: 10, color: '#7a7f9a', fontStyle: 'italic' }}>
        {qfId} winner
      </div>
    )
  }

  return (
    <div style={{
      width: 144, borderRadius: 6, flexShrink: 0,
      border: '1px solid #dde2ee', background: '#ade1ff', padding: '5px 7px',
    }}>
      <div style={{ fontSize: 9, color: '#7a7f9a', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {sfId}
      </div>
      <SFSlot qfId={qfAId} />
      <div style={{ textAlign: 'center', fontSize: 9, color: '#7a7f9a', margin: '2px 0' }}>vs</div>
      <SFSlot qfId={qfBId} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Final card
// ---------------------------------------------------------------------------

function FinalCard({ view, mcProbs }) {
  const sf1w = view === 'model' ? modelQFWinner('QF1') && modelQFWinner('QF2') ? modelPick(modelQFWinner('QF1'), modelQFWinner('QF2')) : null : null
  const sf2w = view === 'model' ? modelQFWinner('QF3') && modelQFWinner('QF4') ? modelPick(modelQFWinner('QF3'), modelQFWinner('QF4')) : null : null
  const finalW = sf1w && sf2w ? modelPick(sf1w, sf2w) : null

  function FinalSlot({ sfId, teamKey }) {
    if (view === 'model' && teamKey) {
      const mcWin = p(mcProbs?.[teamKey]?.winner)
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: finalW === teamKey ? '#fff3e0' : 'transparent',
          border: `1px solid ${finalW === teamKey ? '#ffb74d' : '#ffe082'}`,
          borderRadius: 4, padding: '3px 6px',
        }}>
          <span style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 600, fontSize: 11, color: '#7f4f00' }}>
            {TEAM_DISPLAY[teamKey] || teamKey}
          </span>
          {mcWin != null && <span style={{ fontSize: 9, color: '#D4401A', fontWeight: 700, marginLeft: 4 }}>{mcWin.toFixed(1)}%</span>}
        </div>
      )
    }
    return (
      <div style={{ border: '1px dashed #fbbf24', borderRadius: 4, padding: '3px 6px', fontSize: 10, color: '#7a7f9a', fontStyle: 'italic', textAlign: 'center' }}>
        {sfId} winner
      </div>
    )
  }

  return (
    <div style={{
      width: 148, borderRadius: 8, flexShrink: 0,
      border: '1px solid #ffb74d80', background: '#fff8e1',
      padding: '7px 9px',
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#D4401A', textAlign: 'center', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        UCL Final
      </div>
      <FinalSlot sfId="SF1" teamKey={sf1w} />
      <div style={{ textAlign: 'center', fontSize: 9, color: '#7a7f9a', margin: '3px 0' }}>vs</div>
      <FinalSlot sfId="SF2" teamKey={sf2w} />
      <div style={{ marginTop: 6, paddingTop: 5, borderTop: '1px solid #ffe082', textAlign: 'center' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: '#1a1a2e' }}>30 May 2026</div>
        <div style={{ fontSize: 9, color: '#7a7f9a' }}>Puskás Aréna · Budapest</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bracket structural components
// ---------------------------------------------------------------------------

const CONN_COLOR = '#b0bec5'

// Merges two vertically-stacked children into one output via bracket lines
function BracketGroup({ topChild, bottomChild, output, gap = 8 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch' }}>
      {/* The two stacked inputs */}
      <div style={{ display: 'flex', flexDirection: 'column', gap }}>
        {topChild}
        {bottomChild}
      </div>
      {/* Bracket connector: top-half has border-right + border-bottom, bottom-half has border-right + border-top */}
      <div style={{ width: 14, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ flex: 1, borderRight: `2px solid ${CONN_COLOR}`, borderBottom: `2px solid ${CONN_COLOR}`, borderRadius: '0 0 3px 0' }} />
        <div style={{ flex: 1, borderRight: `2px solid ${CONN_COLOR}`, borderTop: `2px solid ${CONN_COLOR}`, borderRadius: '0 3px 0 0' }} />
      </div>
      {/* Short horizontal line to output */}
      <div style={{ width: 10, height: 2, background: CONN_COLOR, alignSelf: 'center', flexShrink: 0 }} />
      {/* Output card, vertically centered */}
      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        {output}
      </div>
    </div>
  )
}

// Stage column header
function StageLabel({ label }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, color: '#7a7f9a', textTransform: 'uppercase',
      letterSpacing: '0.08em', textAlign: 'center', marginBottom: 6,
    }}>
      {label}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Win probability chart (below bracket)
// ---------------------------------------------------------------------------

function WinProbChart({ mcProbs }) {
  const teams = Object.entries(mcProbs)
    .map(([k, v]) => ({ key: k, name: TEAM_DISPLAY[k] || k, val: parseFloat(v.winner || 0) }))
    .filter(t => t.val > 0.5)
    .sort((a, b) => b.val - a.val)
    .slice(0, 8)
  const max = teams[0]?.val || 1

  return (
    <div className="rounded-lg border border-brand-border p-4 bg-brand-shell">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1 self-stretch rounded-full" style={{ background: '#D4401A', minHeight: '1.2rem' }} />
        <h3 className="font-display text-sm text-brand-ink" style={{ fontWeight: 600 }}>
          Tournament Win Probability
        </h3>
      </div>
      <div className="space-y-2">
        {teams.map((t) => {
          const color = TEAM_COLORS[t.key] || '#7a7f9a'
          return (
            <div key={t.key} className="flex items-center gap-2">
              <span className="font-display text-xs w-28 truncate text-brand-navy" style={{ fontWeight: 600 }}>
                {t.name}
              </span>
              <div className="flex-1 rounded-full h-2" style={{ background: '#dde2ee' }}>
                <div className="h-2 rounded-full" style={{ width: `${(t.val / max) * 100}%`, background: color }} />
              </div>
              <span className="text-xs tabular-nums w-12 text-right font-medium" style={{ color }}>
                {t.val.toFixed(1)}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export default function BracketView() {
  const [mcProbs, setMcProbs] = useState(null)
  const [preR16McProbs, setPreR16McProbs] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [view, setView] = useState('live')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [live, preR16] = await Promise.all([
        fetchMonteCarlo(),
        fetchPreR16MonteCarlo(),
      ])
      setMcProbs(live.probabilities || {})
      setPreR16McProbs(preR16.probabilities || {})
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 rounded-full animate-spin"
             style={{ border: '3px solid #dde2ee', borderTopColor: '#D4401A' }} />
        <span className="ml-3 text-brand-muted text-sm">Running 50,000 simulations…</span>
      </div>
    )
  }

  // Active probs: model view uses pre-R16 MC, live view uses post-R16 MC
  const activeProbs = view === 'model' ? (preR16McProbs || {}) : (mcProbs || {})

  // Build bracket using nested BracketGroup components
  // Structure: [R16 pair] → QF → [QF pair] → SF → [SF pair] → Final

  function R16(id) {
    return <R16Card key={id} tieId={id} view={view} mcProbs={activeProbs} />
  }
  function QF(id) {
    return <QFCard key={id} qfId={id} view={view} mcProbs={activeProbs} />
  }
  function SF(id, a, b) {
    return <SFCard sfId={id} qfAId={a} qfBId={b} view={view} mcProbs={activeProbs} />
  }

  const bracket = (
    <BracketGroup gap={40}
      topChild={
        <BracketGroup gap={20}
          topChild={<BracketGroup gap={4} topChild={R16('PSG_Chelsea')}    bottomChild={R16('Gala_Liverpool')}  output={QF('QF1')} />}
          bottomChild={<BracketGroup gap={4} topChild={R16('Real_ManCity')}   bottomChild={R16('Atalanta_Bayern')} output={QF('QF2')} />}
          output={SF('SF1','QF1','QF2')}
        />
      }
      bottomChild={
        <BracketGroup gap={20}
          topChild={<BracketGroup gap={4} topChild={R16('Newcastle_Barca')} bottomChild={R16('Atletico_Spurs')}  output={QF('QF3')} />}
          bottomChild={<BracketGroup gap={4} topChild={R16('Sporting_Bodo')}  bottomChild={R16('Lev_Arsenal')}    output={QF('QF4')} />}
          output={SF('SF2','QF3','QF4')}
        />
      }
      output={<FinalCard view={view} mcProbs={activeProbs} />}
    />
  )

  return (
    <div className="space-y-5">
      {/* Header + toggle */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base text-brand-ink" style={{ fontWeight: 600 }}>
            UCL 2025/26 Bracket
          </h2>
          <p className="text-sm text-brand-muted mt-0.5">
            All 8 R16 ties confirmed · QF draw set · Win % from 50k Monte Carlo
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {[
            { id: 'live',  label: 'Live bracket' },
            { id: 'model', label: 'Model picks' },
          ].map(v => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className="px-3 py-1.5 text-xs rounded border transition-colors"
              style={{
                background: view === v.id ? '#1a1a2e' : '#ade1ff',
                color: view === v.id ? '#fff' : '#3d4466',
                borderColor: view === v.id ? '#1a1a2e' : '#dde2ee',
                fontWeight: view === v.id ? 600 : 400,
              }}
            >
              {v.label}
            </button>
          ))}
          <button
            onClick={load}
            className="px-3 py-1.5 text-xs rounded border bg-brand-shell border-brand-border text-brand-navy hover:bg-brand-sky transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded p-3 text-sm" style={{ background: '#fff8e1', border: '1px solid #ffe082', color: '#7f4f00' }}>
          Monte Carlo unavailable: {error}
        </div>
      )}

      {view === 'model' && (
        <div className="rounded-lg border p-3 text-sm text-brand-navy"
             style={{ background: '#edf4fb', borderColor: '#90caf9' }}>
          <span style={{ fontWeight: 500 }}>Pre-R16 model prediction.</span> Team picks and win probabilities based on pre-R16 ELO ratings and 50k Monte Carlo simulation using only data available before 17 March 2026. ⚡ marks ties where a lower-ELO team won.
        </div>
      )}

      {/* Stage header labels */}
      <div style={{ display: 'flex', gap: 0, paddingLeft: 0, overflowX: 'auto', paddingBottom: 4 }}>
        <div style={{ width: 160, flexShrink: 0 }}><StageLabel label="Round of 16" /></div>
        <div style={{ width: 24, flexShrink: 0 }} />
        <div style={{ width: 152, flexShrink: 0 }}><StageLabel label="Quarter-Finals" /></div>
        <div style={{ width: 24, flexShrink: 0 }} />
        <div style={{ width: 144, flexShrink: 0 }}><StageLabel label="Semi-Finals" /></div>
        <div style={{ width: 24, flexShrink: 0 }} />
        <div style={{ width: 148, flexShrink: 0 }}><StageLabel label="Final" /></div>
      </div>

      {/* Bracket */}
      <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
        {bracket}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-brand-muted pt-2 border-t border-brand-border">
        <span><span style={{ color: '#16a34a' }}>✓</span> Confirmed through</span>
        <span style={{ color: '#D4401A' }}>LIVE</span> = second leg in progress
        {view === 'model' && <span>⚡ UPSET = lower ELO team won</span>}
        <span>Win % = 50k Monte Carlo {view === 'model' ? '(pre-R16 basis)' : '(post-R16 basis)'}</span>
      </div>

      {/* Win probability chart */}
      {Object.keys(activeProbs).length > 0 && (
        <WinProbChart mcProbs={activeProbs} />
      )}
    </div>
  )
}
