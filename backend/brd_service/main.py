"""
Edge Assistant BRD Service
──────────────────────────
Runs on port 8001. Provides the BRD Studio API.
"""

import os
import sys
import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from core.db import engine, Base

# Import models to register them with SQLAlchemy metadata
from brd_service.models import BrdProject, BrdVideo, BrdCapture, BrdSection, BrdVersion, BrdDocument
from brd_service.router import router, BRD_FRAMES_DIR, BRD_EXPORTS_DIR

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all tables on startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("[BRD Service] Database tables ensured")
    yield


app = FastAPI(
    title="Edge Assistant BRD Service",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://mspeventwin2.westus.cloudapp.azure.com",
        "http://mspeventwin2.westus.cloudapp.azure.com:3000",
        "https://mspeventwin2.westus.cloudapp.azure.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include BRD router
app.include_router(router)

# Frame images are now served via router.get("/api/brd/frames/...") in router.py
# for better CORS middleware support (needed for the canvas editor).

# Serve export files
os.makedirs(BRD_EXPORTS_DIR, exist_ok=True)
app.mount("/api/brd/exports", StaticFiles(directory=BRD_EXPORTS_DIR), name="brd_exports")


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "BRD Studio", "version": "2.0.0"}
