from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from app.services.analysis import predict_customers
from app.services.cleaning import clean_transactions
from app.services.model import ModelRegistry
from app.services.rfm import calculate_rfm


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Compare the original Online Retail dataset predictions to the notebook export."
    )
    parser.add_argument("dataset", type=Path, help="Path to the original Online Retail CSV.")
    parser.add_argument(
        "--reference",
        type=Path,
        default=None,
        help="Optional path to final_customer_segmentation.csv (defaults to the artifacts folder).",
    )
    args = parser.parse_args()

    registry = ModelRegistry()
    registry.load()
    if not registry.available:
        raise SystemExit(registry.error or "The original model artifacts are unavailable.")
    if args.reference is not None:
        reference = pd.read_csv(args.reference, usecols=["CustomerID", "Cluster"])
        registry.reference_customers = {
            str(int(customer_id)): int(cluster)
            for customer_id, cluster in zip(
                reference["CustomerID"], reference["Cluster"], strict=True
            )
        }
    if not registry.reference_customers:
        raise SystemExit(
            "Place final_customer_segmentation.csv in the artifacts directory or supply --reference."
        )

    raw = pd.read_csv(
        args.dataset,
        dtype={
            "InvoiceNo": "string",
            "StockCode": "string",
            "Description": "string",
            "CustomerID": "string",
            "Country": "string",
        },
        encoding="utf-8-sig",
    )
    raw["InvoiceDate"] = pd.to_datetime(raw["InvoiceDate"], errors="raise")
    cleaned, sales, cleaning_summary = clean_transactions(raw)
    rfm, _ = calculate_rfm(sales)
    customers = predict_customers(rfm, registry)
    assignments = {
        str(int(customer_id)): int(cluster)
        for customer_id, cluster in zip(
            customers["CustomerID"], customers["Cluster"], strict=True
        )
    }
    shared = assignments.keys() & registry.reference_customers.keys()
    mismatches = [
        customer_id
        for customer_id in shared
        if assignments[customer_id] != registry.reference_customers[customer_id]
    ]
    counts = customers["Cluster"].value_counts().sort_index().to_dict()

    print(f"Raw transaction rows: {len(raw):,}")
    print(f"Cleaned transaction rows: {len(cleaned):,}")
    print(f"Customers segmented: {len(customers):,}")
    print(f"Cluster counts: {counts}")
    print(f"Reference customer IDs compared: {len(shared):,}")
    print(f"Cluster label mismatches: {len(mismatches):,}")
    print(
        "Recorded training silhouette score (not accuracy): "
        f"{registry.metadata['evaluation']['final_score']}"
    )
    print(f"Cleaning summary: {cleaning_summary}")
    if len(customers) != 4335 or counts != {0: 1664, 1: 2671}:
        raise SystemExit("Original dataset customer or cluster counts do not match notebook outputs.")
    if not shared or mismatches:
        raise SystemExit("Predictions do not match all comparable notebook assignments.")


if __name__ == "__main__":
    main()
