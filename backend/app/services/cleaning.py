from __future__ import annotations

import pandas as pd

from app.services.validation import quality_report


NON_PRODUCT_DESCRIPTIONS = {
    "AMAZON FEE",
    "POSTAGE",
    "DOTCOM POSTAGE",
    "ADJUST BAD DEBT",
    "MANUAL",
}


def clean_transactions(raw: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    before = quality_report(raw)
    cleaned = raw.drop_duplicates().copy()

    unique_description_counts = (
        cleaned.loc[cleaned["Description"].notna()]
        .groupby("StockCode", dropna=False)["Description"]
        .nunique()
    )
    unambiguous_codes = unique_description_counts[
        unique_description_counts == 1
    ].index
    mapping = (
        cleaned.loc[
            cleaned["Description"].notna()
            & cleaned["StockCode"].isin(unambiguous_codes)
        ]
        .drop_duplicates(subset="StockCode")
        .set_index("StockCode")["Description"]
    )
    missing_descriptions_before = int(cleaned["Description"].isna().sum())
    cleaned["Description"] = cleaned["Description"].fillna(
        cleaned["StockCode"].map(mapping)
    )
    descriptions_recovered = missing_descriptions_before - int(
        cleaned["Description"].isna().sum()
    )

    cancellation = cleaned["InvoiceNo"].str.startswith("C", na=False)
    regular_sales = cleaned.loc[
        ~cancellation
        & (cleaned["Quantity"] > 0)
        & (cleaned["UnitPrice"] > 0)
    ].copy()
    regular_sales["TotalPrice"] = (
        regular_sales["Quantity"] * regular_sales["UnitPrice"]
    )
    non_product = (
        regular_sales["Description"]
        .str.strip()
        .str.upper()
        .isin(NON_PRODUCT_DESCRIPTIONS)
    )
    product_sales = regular_sales.loc[~non_product].copy()

    after = quality_report(cleaned)
    summary = {
        "original_rows": before["rows"],
        "cleaned_rows": after["rows"],
        "duplicate_rows_removed": before["duplicate_rows"],
        "missing_descriptions_recovered": descriptions_recovered,
        "remaining_missing_descriptions": after["missing_values"]["Description"],
        "remaining_missing_customer_ids": after["missing_values"]["CustomerID"],
        "retained_cancellation_rows": after["cancellation_rows"],
        "retained_negative_quantity_rows": after["negative_quantity_rows"],
        "retained_zero_price_rows": after["zero_price_rows"],
        "retained_negative_price_rows": after["negative_price_rows"],
        "positive_sales_rows_before_non_product_filter": int(len(regular_sales)),
        "non_product_charge_rows_excluded_from_rfm": int(non_product.sum()),
        "product_sales_rows_for_rfm": int(len(product_sales)),
        "rows_without_customer_id_excluded_from_rfm": int(
            product_sales["CustomerID"].isna().sum()
        ),
        "product_sales_rows_with_customer_id": int(
            product_sales["CustomerID"].notna().sum()
        ),
        "cleaned_quality_before": before,
        "cleaned_quality_after": after,
        "decisions": [
            "Removed exact duplicate rows, as in the notebook.",
            "Recovered descriptions only for StockCodes with one unique non-missing description.",
            "Kept returns, cancellations, zero-price rows, negative-price rows, and unidentified transactions in the cleaned transaction export.",
            "For RFM only, excluded cancellation invoices, non-positive quantity or unit-price rows, the notebook's five non-product charge descriptions, and rows without CustomerID.",
        ],
    }
    return cleaned, product_sales, summary
