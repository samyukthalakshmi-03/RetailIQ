from __future__ import annotations

import json
import uuid
from io import BytesIO

import pandas as pd
from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse

from app.services.analysis import build_dashboard, predict_customers
from app.services.cleaning import clean_transactions
from app.services.model import ModelUnavailableError
from app.services.rfm import calculate_rfm
from app.services.storage import AnalysisSession, session_store
from app.services.validation import (
    MAX_UPLOAD_BYTES,
    DatasetValidationError,
    quality_report,
    read_transactions,
)


router = APIRouter(prefix="/api")


def _session_or_404(session_id: str) -> AnalysisSession:
    session = session_store.get(session_id)
    if session is None:
        raise HTTPException(
            status_code=404,
            detail="Analysis session not found or expired. Upload the dataset again.",
        )
    return session


def _registry(request: Request):
    return request.app.state.model_registry


@router.get("/health")
def health(request: Request) -> dict:
    status = _registry(request).status()
    return {
        "status": "ok",
        "model": status,
        "message": (
            "API is ready."
            if status["available"]
            else "API is running; model-based segmentation is unavailable until the original artifacts are installed."
        ),
    }


@router.post("/upload")
async def upload_dataset(request: Request, file: UploadFile = File(...)) -> dict:
    filename = file.filename or ""
    if not filename.lower().endswith(".csv"):
        raise HTTPException(status_code=415, detail="Upload a CSV file with a .csv extension.")
    contents = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="CSV files must be 25 MB or smaller.")
    try:
        raw = read_transactions(contents, filename)
    except DatasetValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    session_id = str(uuid.uuid4())
    session_store.add(session_id, AnalysisSession(raw=raw, filename=filename))
    registry = _registry(request)
    return {
        "session_id": session_id,
        "filename": filename,
        "quality": quality_report(raw),
        "preview": json.loads(raw.head(12).to_json(orient="records", date_format="iso")),
        "cleaned": False,
        "model": registry.status(),
    }


@router.post("/clean/{session_id}")
def clean_dataset(session_id: str) -> dict:
    session = _session_or_404(session_id)
    if session.cleaned is not None:
        return {
            "session_id": session_id,
            "summary": session.cleaning_summary,
            "preview": json.loads(
                session.cleaned.head(12).to_json(orient="records", date_format="iso")
            ),
            "quality": quality_report(session.cleaned),
            "rfm_ready": bool(session.product_sales is not None and len(session.product_sales)),
            "next_step": "Run RFM analysis and segmentation.",
        }
    if session.raw is None:
        raise HTTPException(
            status_code=409,
            detail="The raw upload is no longer available. Upload the dataset again.",
        )
    try:
        cleaned, product_sales, summary = clean_transactions(session.raw)
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"Could not clean the dataset: {exc}") from exc

    session.cleaned = cleaned
    session.product_sales = product_sales
    session.cleaning_summary = summary
    session.raw = None
    return {
        "session_id": session_id,
        "summary": summary,
        "preview": json.loads(cleaned.head(12).to_json(orient="records", date_format="iso")),
        "quality": quality_report(cleaned),
        "rfm_ready": len(product_sales) > 0,
        "next_step": "Run RFM analysis and segmentation." if len(product_sales) else "No eligible product sales were found.",
    }


@router.post("/analyze/rfm/{session_id}")
def analyze_rfm(session_id: str, request: Request) -> dict:
    session = _session_or_404(session_id)
    if session.product_sales is None or session.cleaning_summary is None:
        raise HTTPException(status_code=409, detail="Clean the uploaded dataset before running RFM analysis.")
    registry = _registry(request)
    if not registry.available:
        raise HTTPException(status_code=503, detail=registry.error or "The original fitted model artifacts are unavailable.")
    try:
        rfm, snapshot_date = calculate_rfm(session.product_sales)
        customers = predict_customers(rfm, registry)
        session.rfm = rfm
        session.customers = customers
        session.snapshot_date = snapshot_date.isoformat()
        session.dashboard = build_dashboard(session, registry)
    except ModelUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except (ValueError, KeyError) as exc:
        raise HTTPException(status_code=422, detail=f"RFM analysis could not be completed: {exc}") from exc
    return session.dashboard


@router.get("/dashboard/{session_id}")
def get_dashboard(session_id: str) -> dict:
    session = _session_or_404(session_id)
    if session.dashboard is None:
        raise HTTPException(status_code=409, detail="Complete dataset cleaning and segmentation to view analytics.")
    return session.dashboard


@router.get("/customers/{session_id}")
def get_customers(
    session_id: str,
    search: str = Query(default="", max_length=80),
    cluster: int | None = Query(default=None, ge=0),
    sort_by: str = Query(default="monetary", pattern="^(monetary|frequency|recency|customer_id)$"),
    descending: bool = True,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
) -> dict:
    session = _session_or_404(session_id)
    if session.customers is None:
        raise HTTPException(status_code=409, detail="Run RFM analysis before browsing customers.")
    customers = session.customers
    if search:
        customers = customers.loc[customers["CustomerID"].astype(str).str.contains(search, regex=False)]
    if cluster is not None:
        customers = customers.loc[customers["Cluster"] == cluster]
    dataframe_sort_column = {
        "customer_id": "CustomerID",
        "recency": "Recency",
        "frequency": "Frequency",
        "monetary": "Monetary",
    }[sort_by]
    customers = customers.sort_values(
        dataframe_sort_column,
        ascending=not descending,
        kind="stable",
    )
    records = customers.iloc[offset : offset + limit][
        ["CustomerID", "Recency", "Frequency", "Monetary", "Cluster"]
    ]
    return {
        "total": int(len(customers)),
        "offset": offset,
        "limit": limit,
        "customers": json.loads(records.to_json(orient="records")),
    }


@router.get("/customers/{session_id}/{customer_id}")
def get_customer(session_id: str, customer_id: str) -> dict:
    session = _session_or_404(session_id)
    if session.customers is None:
        raise HTTPException(status_code=409, detail="Run RFM analysis before browsing customers.")
    matches = session.customers.loc[
        session.customers["CustomerID"].astype(str) == customer_id
    ]
    if matches.empty:
        raise HTTPException(status_code=404, detail="Customer ID was not found in this analysis.")
    return json.loads(matches.iloc[0].to_json())


@router.get("/clusters/{session_id}")
def get_clusters(session_id: str) -> dict:
    session = _session_or_404(session_id)
    if session.dashboard is None:
        raise HTTPException(status_code=409, detail="Run customer segmentation before viewing clusters.")
    return {"clusters": session.dashboard["cluster_profiles"]}


def _csv_response(frame: pd.DataFrame, filename: str) -> StreamingResponse:
    buffer = BytesIO()
    frame.to_csv(buffer, index=False)
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/reports/{session_id}/cleaned.csv")
def download_cleaned(session_id: str) -> StreamingResponse:
    session = _session_or_404(session_id)
    if session.cleaned is None:
        raise HTTPException(status_code=409, detail="Clean the uploaded dataset before downloading it.")
    return _csv_response(session.cleaned, "retailiq-cleaned-transactions.csv")


@router.get("/reports/{session_id}/customers.csv")
def download_customers(session_id: str) -> StreamingResponse:
    session = _session_or_404(session_id)
    if session.customers is None:
        raise HTTPException(status_code=409, detail="Run customer segmentation before downloading results.")
    return _csv_response(session.customers, "retailiq-customer-segmentation.csv")


@router.get("/reports/{session_id}/profiles.csv")
def download_profiles(session_id: str) -> StreamingResponse:
    session = _session_or_404(session_id)
    if session.dashboard is None:
        raise HTTPException(status_code=409, detail="Run customer segmentation before downloading profiles.")
    return _csv_response(pd.DataFrame(session.dashboard["cluster_profiles"]), "retailiq-cluster-profiles.csv")


@router.get("/reports/{session_id}/summary.json")
def download_summary(session_id: str) -> StreamingResponse:
    session = _session_or_404(session_id)
    if session.dashboard is None:
        raise HTTPException(status_code=409, detail="Run customer segmentation before exporting a summary.")
    content = json.dumps(session.dashboard, indent=2, ensure_ascii=False).encode("utf-8")
    return StreamingResponse(
        BytesIO(content),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="retailiq-analysis-summary.json"'},
    )
