import os

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.ratings import router as ratings_router
from backend.api.monte_carlo import router as mc_router
from backend.api.swarm import router as swarm_router
from backend.api.kalshi import router as kalshi_router
from backend.api.compare import router as compare_router

app = FastAPI(
    title="UCL 2025/26 Predictor",
    description="v7 ELO model + Monte Carlo + Swarm Intelligence",
    version="0.1.0",
)

# Base origins — localhost for dev, any *.vercel.app for prod
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
]
# Additional custom domains (comma-separated) set via env var
_extra = os.environ.get("ALLOWED_ORIGINS", "")
if _extra:
    ALLOWED_ORIGINS += [o.strip() for o in _extra.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ratings_router, prefix="/api")
app.include_router(mc_router, prefix="/api")
app.include_router(swarm_router, prefix="/api")
app.include_router(kalshi_router, prefix="/api")
app.include_router(compare_router, prefix="/api")


@app.get("/", tags=["health"])
def root():
    return {"status": "ok", "project": "UCL 2025/26 Predictor", "model": "v7"}
