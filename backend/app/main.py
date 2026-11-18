import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.services.model import ModelRegistry


@asynccontextmanager
async def lifespan(app: FastAPI):
    registry = ModelRegistry()
    registry.load()
    app.state.model_registry = registry
    yield


app = FastAPI(
    title="RetailIQ API",
    description="Notebook-faithful retail transaction cleaning, RFM analysis, and customer segmentation.",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    # Local dev origins plus any deployed frontend URLs, e.g.
    # RETAILIQ_CORS_ORIGINS="https://retailiq.vercel.app,https://other.app"
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        *[
            origin.strip().rstrip("/")
            for origin in os.getenv("RETAILIQ_CORS_ORIGINS", "").split(",")
            if origin.strip()
        ],
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
app.include_router(router)
