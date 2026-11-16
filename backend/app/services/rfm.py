from __future__ import annotations

import numpy as np
import pandas as pd


RFM_FEATURES = ["Log_Recency", "Log_Frequency", "Log_Monetary"]
SCALED_FEATURES = [
    "Scaled_Recency",
    "Scaled_Frequency",
    "Scaled_Monetary",
]


def calculate_rfm(product_sales: pd.DataFrame) -> tuple[pd.DataFrame, pd.Timestamp]:
    identified = product_sales.loc[product_sales["CustomerID"].notna()].copy()
    if identified.empty:
        raise ValueError(
            "No eligible product sales with CustomerID were found. "
            "Check the notebook's positive-sales filters and customer identifiers."
        )

    numeric_ids = pd.to_numeric(identified["CustomerID"], errors="coerce")
    invalid_ids = numeric_ids.isna() | (numeric_ids % 1 != 0)
    if invalid_ids.any():
        raise ValueError(
            f"{int(invalid_ids.sum())} non-integer CustomerID value(s) cannot be "
            "represented by the original notebook's integer CustomerID pipeline."
        )
    identified["CustomerID"] = numeric_ids.astype("int64")
    snapshot_date = identified["InvoiceDate"].max() + pd.Timedelta(days=1)

    rfm = (
        identified.groupby("CustomerID", sort=True)
        .agg(
            Recency=(
                "InvoiceDate",
                lambda dates: int((snapshot_date - dates.max()).days),
            ),
            Frequency=("InvoiceNo", "nunique"),
            Monetary=("TotalPrice", "sum"),
        )
        .reset_index()
    )
    if not np.isfinite(rfm[["Recency", "Frequency", "Monetary"]]).all().all():
        raise ValueError("RFM calculations produced non-finite values.")
    if (rfm[["Recency", "Frequency", "Monetary"]] <= 0).any().any():
        raise ValueError(
            "RFM values must be positive for the notebook's numpy.log1p pipeline."
        )
    return rfm, snapshot_date


def transform_rfm(
    rfm: pd.DataFrame,
    feature_order: list[str] = RFM_FEATURES,
) -> pd.DataFrame:
    transformed = pd.DataFrame(index=rfm.index)
    raw_features = ["Recency", "Frequency", "Monetary"]
    feature_by_raw = dict(zip(raw_features, RFM_FEATURES, strict=True))
    expected_order = [feature_by_raw[raw] for raw in raw_features]
    if feature_order != expected_order:
        raise ValueError(
            f"Unsupported metadata feature order {feature_order}; expected {expected_order}."
        )
    for raw, feature in zip(raw_features, feature_order, strict=True):
        transformed[feature] = np.log1p(rfm[raw].to_numpy(dtype=float))
    return transformed
