// In dev, Vite proxies /api → http://localhost:8000
// In production set VITE_API_URL to your backend origin
const BASE_URL = import.meta.env.VITE_API_URL || ''

async function apiFetch(path, options = {}) {
  const url = `${BASE_URL}${path}`
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`API error ${response.status}: ${errorText}`)
  }

  return response.json()
}

/**
 * Fetch comparison data: MC probs, Kalshi probs, swarm probs, gaps
 * GET /api/compare
 */
export async function fetchCompare() {
  return apiFetch('/api/compare')
}

/**
 * Fetch all v7 team ratings
 * GET /api/ratings
 */
export async function fetchRatings() {
  return apiFetch('/api/ratings')
}

/**
 * Run 50k Monte Carlo simulation
 * GET /api/monte-carlo
 */
export async function fetchMonteCarlo() {
  return apiFetch('/api/monte-carlo')
}

/**
 * Run 50k Monte Carlo using pre-R16 ELOs and no known results
 * GET /api/monte-carlo/pre-r16
 */
export async function fetchPreR16MonteCarlo() {
  return apiFetch('/api/monte-carlo/pre-r16')
}

/**
 * Fetch live Kalshi UCL winner market prices
 * GET /api/kalshi
 */
export async function fetchKalshi() {
  return apiFetch('/api/kalshi')
}

/**
 * Fetch static swarm snapshot (17 March 2026 run)
 * GET /api/swarm
 */
export async function fetchSwarm() {
  return apiFetch('/api/swarm')
}

/**
 * Get current bracket state with win probabilities
 * GET /api/bracket
 */
export async function fetchBracket() {
  return apiFetch('/api/bracket')
}

/**
 * Update results for R16/QF/SF ties
 * POST /api/results
 * @param {object} results - Result payload
 */
export async function postResults(results) {
  return apiFetch('/api/results', {
    method: 'POST',
    body: JSON.stringify(results),
  })
}
