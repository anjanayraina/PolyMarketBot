from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.endpoints import router as api_router
import logging

# Configure structured logging for backend
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger("PolymarketBackend")

app = FastAPI(
    title="Polymarket Insider Tracker backend",
    description="Decoupled backend API strictly validated with Pydantic for Web3 data intelligence.",
    version="2.0.0"
)

# Enable CORS for frontend client interactions (Vite React defaults to port 5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permits scanning from external react clients
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount the router under '/api' prefix
app.include_router(api_router, prefix="/api")

@app.get("/")
def health_check():
    return {
        "status": "healthy",
        "service": "Polymarket Insider Tracker backend",
        "version": "2.0.0"
    }
