## UCL 2025/26 Predictor
A football forecasting tool that combines a custom ELO model, Monte Carlo simulations, live Kalshi prediction market data, and an agent AI debate swarm to predict the UEFA Champions League winner.

## Why this exists
Most football predictions rely on intuition or simple form tables. This project builds a probabilistic forecasting system that combines statistical modelling, simulation, and AI reasoning to produce structured, explainable forecasts with quantified uncertainty.

## How it works

Custom ELO model
A custom ELO system built specifically for European football. It weights recent form heavily, adjusts for margin of victory, separates domestic from European performance, and corrects for home advantage by venue. The output is a continuously updated strength rating for every club in the competition.

50,000 Monte Carlo simulations
The full tournament is simulated 50,000 times, drawing each match outcome probabilistically from ELO-derived distributions and agent swam sentiment, propagating results through the bracket. The output is a probability distribution across all 32 clubs that reflects both the strength of each team and the randomness of a knockout competition.

Kalshi prediction market integration
Live UCL winner odds from Kalshi are used as a calibration check against the model and as a weighted input in the final ensemble. Where the model and the market disagree sharply, that tension is surfaced directly in the UI.

AI agent debate swarm
111 AI agents with individual personalities, biases and thought processs are assigned distinct roles and tasked with arguing for and against each club's chances. The swarm is designed to simulate a prediction market wherein agents with different information and incentives reach a consensus through structured debate, in the same way a liquid market prices an outcome through the aggregation of competing views. The result is a probability estimate grounded in reasoning rather than just historical data.

Use case
Built for analysts who want a rigorous, explainable forecast and for anyone comparing model output against live market prices. The agent debate transcripts are readable, so it is possible to understand not just who is favoured but why.

## Stack
| Layer               | Technology                               |        
| --------            | --------                                 |
| Backend             | FastAPI, Python                          |
| Frontend            | React, Vite                              |
| Agents              | Claude API                               |
| Simulation          | NumPy, custom Monte Carlo engine         |
| Prediction Markets  | Kalshi REST API                          |
| Data                | StatsBomb, FBref (match results for ELO) |


## Setup
cp .env.example .env

// Backend
cd backend && pip install -r requirements.txt
uvicorn main:app --reload

// Frontend
cd frontend && npm install && npm run dev

## Disclaimer
This project is for analytical and educational purposes. Nothing here constitutes financial or betting advice. Prediction markets involve real money and real risk. Do your own research.
