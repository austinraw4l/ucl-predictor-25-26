import { useState } from 'react'
import RatingsTable from './components/RatingsTable.jsx'
import BracketView from './components/BracketView.jsx'
import SwarmView from './components/SwarmView.jsx'
import MarketsView from './components/MarketsView.jsx'
import ModelExplanation from './components/ModelExplanation.jsx'

const TABS = [
  { id: 'ratings', label: 'ELO Rankings' },
  { id: 'swarm',   label: 'Agent Swarm' },
  { id: 'bracket', label: 'Bracket' },
  { id: 'markets', label: 'Markets' },
  { id: 'explain', label: 'Explained' },
]

const ACCENT = '#D4401A'

export default function App() {
  const [activeTab, setActiveTab] = useState('ratings')

  return (
    <div className="min-h-screen bg-brand-sky">
      {/* Header */}
      <header className="bg-brand-sky border-b border-brand-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 pt-4 pb-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
            <div>
              <h1 className="font-display text-xl text-brand-ink tracking-tight" style={{ fontWeight: 600 }}>
                UCL 2025/26 Predictor
              </h1>
              {/* 3px accent rule directly under the title */}
              <div className="h-[3px] rounded-full mt-1 mb-1.5 w-48" style={{ background: ACCENT }} />
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2.5 py-1 rounded bg-brand-shell border border-brand-border text-brand-navy">
                18 Mar 2026
              </span>
              <span className="px-2.5 py-1 rounded bg-[#e8f5e9] border border-[#a5d6a7] text-[#2e7d32] font-medium">
                QF Draw Confirmed
              </span>
            </div>
          </div>

          {/* Tab Navigation */}
          <nav className="flex gap-0">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 text-sm transition-colors relative font-normal ${
                  activeTab === tab.id
                    ? 'text-brand-navy'
                    : 'text-brand-muted hover:text-brand-navy'
                }`}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <span
                    className="absolute bottom-0 left-0 right-0"
                    style={{ height: 3, background: ACCENT, borderRadius: '2px 2px 0 0' }}
                  />
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'ratings' && <RatingsTable />}
        {activeTab === 'bracket' && <BracketView />}
        {activeTab === 'swarm'   && <SwarmView />}
        {activeTab === 'markets' && <MarketsView />}
        {activeTab === 'explain' && <ModelExplanation />}
      </main>

      {/* Footer */}
      <footer className="border-t border-brand-border mt-12 py-6">
        <div className="max-w-7xl mx-auto px-4 text-center text-brand-muted text-xs">
          <p>UCL 2025/26 Predictor · ELO Rankings · 50k Monte Carlo · 100-Agent Swarm</p>
          <p className="mt-1">Backtest accuracy: 66% across 35 knockout ties (5 seasons) · Beats betting markets (57%)</p>
        </div>
      </footer>
    </div>
  )
}
