from fastapi.testclient import TestClient
import pandas as pd
import pytest

from app.main import app
from app.services.cleaning import clean_transactions
from app.services.model import ModelRegistry
from app.services.rfm import calculate_rfm, transform_rfm


def test_cleaning_preserves_notebook_filters_and_rfm_features():
    transactions = pd.DataFrame(
        [
            ["100", "A", "Product A", 2, "2011-01-01", 5.0, "12345", "UK"],
            ["100", "A", "Product A", 2, "2011-01-01", 5.0, "12345", "UK"],
            ["101", "A", None, 1, "2011-01-02", 5.0, "12345", "UK"],
            ["102", "B", "POSTAGE", 1, "2011-01-03", 2.0, "12345", "UK"],
            ["103", "A", "Product A", 1, "2011-01-04", 5.0, None, "UK"],
            ["C104", "A", "Product A", 1, "2011-01-05", 5.0, "12345", "UK"],
            ["105", "A", "Product A", -1, "2011-01-06", 5.0, "12345", "UK"],
            ["106", "A", "Product A", 1, "2011-01-07", 0.0, "12345", "UK"],
        ],
        columns=[
            "InvoiceNo",
            "StockCode",
            "Description",
            "Quantity",
            "InvoiceDate",
            "UnitPrice",
            "CustomerID",
            "Country",
        ],
    )
    transactions["InvoiceDate"] = pd.to_datetime(transactions["InvoiceDate"])

    cleaned, sales, summary = clean_transactions(transactions)
    rfm, snapshot = calculate_rfm(sales)
    transformed = transform_rfm(rfm)

    assert len(cleaned) == 7
    assert summary["duplicate_rows_removed"] == 1
    assert summary["missing_descriptions_recovered"] == 1
    assert summary["retained_cancellation_rows"] == 1
    assert summary["retained_negative_quantity_rows"] == 1
    assert summary["retained_zero_price_rows"] == 1
    assert summary["non_product_charge_rows_excluded_from_rfm"] == 1
    assert len(sales) == 3
    assert snapshot == pd.Timestamp("2011-01-03")
    assert rfm.to_dict("records") == [
        {
            "CustomerID": 12345,
            "Recency": 1,
            "Frequency": 2,
            "Monetary": 15.0,
        }
    ]
    assert list(transformed.columns) == [
        "Log_Recency",
        "Log_Frequency",
        "Log_Monetary",
    ]


def test_model_registry_loads_and_reproduces_notebook_artifacts():
    registry = ModelRegistry()
    registry.load()
    if not registry.available:
        pytest.skip(registry.error or "Exported model artifacts are unavailable.")

    assert registry.metadata is not None
    assert registry.scaler is not None
    assert registry.kmeans is not None
    assert len(registry.reference_customers) == 4335
    assert registry.metadata["silhouette_score"] == pytest.approx(0.4328513952)
    assert pd.Series(registry.reference_customers).value_counts().sort_index().to_dict() == {
        0: 1664,
        1: 2671,
    }


def test_health_reports_loaded_original_model():
    with TestClient(app) as client:
        response = client.get("/api/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"
        if not response.json()["model"]["available"]:
            pytest.skip(response.json()["model"]["message"])
        assert response.json()["model"]["artifacts_directory"] == "artifacts"
        assert response.json()["model"]["silhouette_score"] == pytest.approx(0.4328513952)


def test_upload_rejects_missing_online_retail_columns():
    with TestClient(app) as client:
        response = client.post(
            "/api/upload",
            files={"file": ("incomplete.csv", b"CustomerID,Amount\n1,10\n", "text/csv")},
        )
        assert response.status_code == 422
        assert "InvoiceNo" in response.json()["detail"]


def test_upload_rejects_invalid_invoice_date():
    content = (
        b"InvoiceNo,StockCode,Description,Quantity,InvoiceDate,UnitPrice,CustomerID,Country\n"
        b"1,100,Product,1,not-a-date,1,12345,UK\n"
    )
    with TestClient(app) as client:
        response = client.post(
            "/api/upload",
            files={"file": ("invalid.csv", content, "text/csv")},
        )
        assert response.status_code == 422
        assert "InvoiceDate" in response.json()["detail"]


def test_upload_to_segmentation_uses_original_fitted_model():
    content = (
        b"InvoiceNo,StockCode,Description,Quantity,InvoiceDate,UnitPrice,CustomerID,Country\n"
        b"100,A,Product A,2,2011-01-01,5,990001,UK\n"
        b"101,A,Product A,1,2011-01-02,5,990001,UK\n"
        b"102,B,Product B,2,2011-01-03,4,990002,UK\n"
        b"103,B,Product B,3,2011-01-04,4,990002,UK\n"
        b"104,C,Product C,1,2011-01-05,8,990003,UK\n"
        b"105,C,Product C,2,2011-01-06,8,990003,UK\n"
    )
    with TestClient(app) as client:
        uploaded = client.post(
            "/api/upload",
            files={"file": ("transactions.csv", content, "text/csv")},
        )
        assert uploaded.status_code == 200
        session_id = uploaded.json()["session_id"]
        cleaned = client.post(f"/api/clean/{session_id}")
        assert cleaned.status_code == 200
        assert cleaned.json()["summary"]["product_sales_rows_with_customer_id"] == 6
        analysis = client.post(f"/api/analyze/rfm/{session_id}")
        if analysis.status_code == 503:
            pytest.skip(analysis.json()["detail"])
        assert analysis.status_code == 200, analysis.text
        result = analysis.json()
        assert result["metrics"]["total_customers"] == 3
        assert result["metrics"]["customer_segments"] > 0
        assert result["training_evaluation"]["score"] == pytest.approx(0.4328513952)
        assert result["reference_comparison"]["available"] is True
        assert result["reference_comparison"]["matched_customer_ids"] == 0
        assert result["reference_comparison"]["label_mismatches"] is None
        assert sum(item["customer_count"] for item in result["cluster_profiles"]) == 3

        customers = client.get(f"/api/customers/{session_id}?limit=10")
        assert customers.status_code == 200
        assert customers.json()["total"] == 3
        assert {item["CustomerID"] for item in customers.json()["customers"]} == {
            990001,
            990002,
            990003,
        }

        export = client.get(f"/api/reports/{session_id}/customers.csv")
        assert export.status_code == 200
        assert len(pd.read_csv(pd.io.common.BytesIO(export.content))) == 3
