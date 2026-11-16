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
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
app.include_router(router)
