from __future__ import annotations

import pandas as pd

from app.services.model import ModelRegistry
from app.services.rfm import transform_rfm
from app.services.storage import AnalysisSession


def _segment_descriptions(profiles: list[dict]) -> dict[int, dict]:
    if len(profiles) != 2:
        return {
            int(profile["cluster"]): {
                "name": f"Cluster {profile['cluster']}",
                "basis": "Descriptive profile based on this dataset's measured RFM averages.",
            }
            for profile in profiles
        }
    active = min(
        profiles,
        key=lambda profile: (
            profile["average_recency"],
            -profile["average_frequency"],
            -profile["average_monetary"],
        ),
    )
    less_active = next(profile for profile in profiles if profile is not active)
    return {
        int(active["cluster"]): {
            "name": "More recently active, higher-engagement customers",
            "basis": "This dataset's profile has lower average recency and higher average frequency and monetary value.",
        },
        int(less_active["cluster"]): {
            "name": "Less recently active, lower-engagement customers",
            "basis": "This dataset's profile has higher average recency and lower average frequency and monetary value.",
        },
    }


def build_dashboard(session: AnalysisSession, registry: ModelRegistry) -> dict:
    if (
        session.cleaned is None
        or session.product_sales is None
        or session.rfm is None
        or session.customers is None
        or session.cleaning_summary is None
    ):
        raise ValueError("Clean the uploaded transactions before requesting analysis.")

    customers = session.customers
    revenue = float(session.product_sales["TotalPrice"].sum())
    transaction_count = int(session.product_sales["InvoiceNo"].nunique())
    profile = (
        customers.groupby("Cluster")
        .agg(
            customer_count=("CustomerID", "count"),
            average_recency=("Recency", "mean"),
            average_frequency=("Frequency", "mean"),
            average_monetary=("Monetary", "mean"),
            median_monetary=("Monetary", "median"),
            cluster_revenue=("Monetary", "sum"),
        )
        .reset_index()
    )
    profile["customer_percentage"] = profile["customer_count"] / len(customers) * 100
    profile["revenue_percentage"] = profile["cluster_revenue"] / revenue * 100
    profiles = [
        {
            "cluster": int(row.Cluster),
            "customer_count": int(row.customer_count),
            "customer_percentage": round(float(row.customer_percentage), 2),
            "average_recency": round(float(row.average_recency), 2),
            "average_frequency": round(float(row.average_frequency), 2),
            "average_monetary": round(float(row.average_monetary), 2),
            "median_monetary": round(float(row.median_monetary), 2),
            "cluster_revenue": round(float(row.cluster_revenue), 2),
            "revenue_percentage": round(float(row.revenue_percentage), 2),
        }
        for row in profile.itertuples(index=False)
    ]
    descriptions = _segment_descriptions(profiles)
    for row in profiles:
        row["segment_name"] = descriptions[row["cluster"]]["name"]
        row["interpretation_basis"] = descriptions[row["cluster"]]["basis"]

    customer_records = customers[
        [
            "CustomerID",
            "Recency",
            "Frequency",
            "Monetary",
            "Cluster",
            "Log_Frequency",
            "Log_Monetary",
        ]
    ].copy()
    customer_records["CustomerID"] = customer_records["CustomerID"].astype(str)
    customer_records["Cluster"] = customer_records["Cluster"].astype(int)
    cluster_groups = {
        str(cluster): group.sort_values("Monetary", ascending=False).to_dict("records")
        for cluster, group in customer_records.groupby("Cluster")
    }
    for group in cluster_groups.values():
        for record in group:
            record["CustomerID"] = str(record["CustomerID"])
            for field in ("Recency", "Frequency", "Cluster"):
                record[field] = int(record[field])
            for field in ("Monetary", "Log_Frequency", "Log_Monetary"):
                record[field] = float(record[field])

    report = {
        "generated_at": pd.Timestamp.now(tz="UTC").isoformat(),
        "source_filename": session.filename,
        "analysis_reference_date": session.snapshot_date,
        "model": registry.status(),
        "training_evaluation": {
            "metric": "silhouette_score",
            "score": registry.metadata["silhouette_score"],
            "note": "Recorded training silhouette score; it is not model accuracy and was not recomputed on this upload.",
        },
        "metrics": {
            "total_customers": int(len(customers)),
            "total_transactions": transaction_count,
            "total_revenue": round(revenue, 2),
            "average_customer_spending": round(float(customers["Monetary"].mean()), 2),
            "customer_segments": int(customers["Cluster"].nunique()),
            "cleaned_transaction_rows": int(len(session.cleaned)),
            "product_sales_rows": int(len(session.product_sales)),
        },
        "customer_distribution": [
            {"name": item["segment_name"], "cluster": item["cluster"], "value": item["customer_count"]}
            for item in profiles
        ],
        "cluster_profiles": profiles,
        "recency_distribution": customers["Recency"].astype(int).tolist(),
        "frequency_distribution": customers["Frequency"].astype(int).tolist(),
        "monetary_distribution": customers["Monetary"].astype(float).tolist(),
        "scatter_points": [
            {
                "customer_id": record["CustomerID"],
                "log_frequency": float(record["Log_Frequency"]),
                "log_monetary": float(record["Log_Monetary"]),
                "cluster": int(record["Cluster"]),
            }
            for group in cluster_groups.values()
            for record in group
        ],
        "customers": sorted(
            [record for group in cluster_groups.values() for record in group],
            key=lambda record: record["CustomerID"],
        ),
        "cleaning_summary": session.cleaning_summary,
        "reference_comparison": _compare_reference(customers, registry),
    }
    return report


def _compare_reference(customers: pd.DataFrame, registry: ModelRegistry) -> dict:
    if not registry.reference_customers:
        return {
            "available": False,
            "matched_customer_ids": 0,
            "label_mismatches": None,
            "note": "The original final_customer_segmentation.csv export is unavailable for prediction comparison.",
        }
    actual = {
        str(int(customer_id)): int(cluster)
        for customer_id, cluster in zip(
            customers["CustomerID"], customers["Cluster"], strict=True
        )
    }
    shared = actual.keys() & registry.reference_customers.keys()
    if not shared:
        return {
            "available": True,
            "matched_customer_ids": 0,
            "label_mismatches": None,
            "note": "The upload contains no CustomerIDs shared with the notebook reference dataset.",
        }
    mismatches = sum(
        actual[customer_id] != registry.reference_customers[customer_id]
        for customer_id in shared
    )
    return {
        "available": True,
        "matched_customer_ids": len(shared),
        "label_mismatches": int(mismatches),
        "note": "Cluster labels are compared as saved by the original notebook for matching CustomerIDs.",
    }


def predict_customers(
    rfm: pd.DataFrame,
    registry: ModelRegistry,
) -> pd.DataFrame:
    transformed = transform_rfm(rfm, registry.preprocessing_features)
    labels = registry.predict(transformed)
    customers = rfm.copy()
    customers["Log_Recency"] = transformed["Log_Recency"]
    customers["Log_Frequency"] = transformed["Log_Frequency"]
    customers["Log_Monetary"] = transformed["Log_Monetary"]
    if registry.scaler is None:
        raise ValueError("The fitted notebook scaler is unavailable.")
    scaled = registry.scaler.transform(transformed)
    for index, name in enumerate(
        registry.model_input_features
    ):
        customers[name] = scaled[:, index]
    customers["Cluster"] = labels.astype(int)
    return customers
