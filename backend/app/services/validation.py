from __future__ import annotations

from io import BytesIO

import pandas as pd
import numpy as np


REQUIRED_COLUMNS = [
    "InvoiceNo",
    "StockCode",
    "Description",
    "Quantity",
    "InvoiceDate",
    "UnitPrice",
    "CustomerID",
    "Country",
]
MAX_UPLOAD_BYTES = 64 * 1024 * 1024
MAX_ROWS = 600_000


class DatasetValidationError(ValueError):
    pass


def read_transactions(contents: bytes, filename: str) -> pd.DataFrame:
    if not contents:
        raise DatasetValidationError("The uploaded CSV is empty.")
    if len(contents) > MAX_UPLOAD_BYTES:
        raise DatasetValidationError("CSV files must be 25 MB or smaller.")
    if not filename.lower().endswith(".csv"):
        raise DatasetValidationError("Upload a CSV file with a .csv extension.")

    try:
        frame = pd.read_csv(
            BytesIO(contents),
            dtype={
                "InvoiceNo": "string",
                "StockCode": "string",
                "Description": "string",
                "CustomerID": "string",
                "Country": "string",
            },
            encoding="utf-8-sig",
        )
    except (UnicodeDecodeError, pd.errors.ParserError, ValueError) as exc:
        raise DatasetValidationError(
            f"Could not read this CSV. Check its encoding and delimiters: {exc}"
        ) from exc

    if frame.empty:
        raise DatasetValidationError("The CSV contains a header but no transaction rows.")
    if len(frame) > MAX_ROWS:
        raise DatasetValidationError("CSV files may contain at most 1,000,000 rows.")

    missing_columns = [column for column in REQUIRED_COLUMNS if column not in frame.columns]
    if missing_columns:
        raise DatasetValidationError(
            "The dataset is missing required Online Retail columns: "
            + ", ".join(missing_columns)
        )

    for column in ["InvoiceNo", "StockCode", "InvoiceDate", "Country"]:
        blank = frame[column].isna() | frame[column].str.strip().eq("").fillna(True)
        if blank.any():
            raise DatasetValidationError(
                f"{column} contains {int(blank.sum())} missing or blank value(s). "
                "The notebook requires this transaction field."
            )

    for column in ["Quantity", "UnitPrice"]:
        values = pd.to_numeric(frame[column], errors="coerce")
        invalid = values.isna() | ~np.isfinite(values)
        if invalid.any():
            raise DatasetValidationError(
                f"{column} contains {int(invalid.sum())} non-numeric, missing, or non-finite value(s)."
            )
        frame[column] = values

    dates = pd.to_datetime(frame["InvoiceDate"], errors="coerce")
    invalid_dates = dates.isna()
    if invalid_dates.any():
        raise DatasetValidationError(
            f"InvoiceDate contains {int(invalid_dates.sum())} unparseable value(s)."
        )
    frame["InvoiceDate"] = dates

    for column in ["InvoiceNo", "StockCode", "Description", "Country"]:
        frame[column] = frame[column].astype("category")

    return frame


def quality_report(frame: pd.DataFrame) -> dict:
    return {
        "rows": int(len(frame)),
        "columns": int(len(frame.columns)),
        "column_names": list(frame.columns),
        "missing_values": {
            str(column): int(count)
            for column, count in frame.isna().sum().items()
        },
        "duplicate_rows": int(frame.duplicated().sum()),
        "negative_quantity_rows": int((frame["Quantity"] < 0).sum()),
        "zero_quantity_rows": int((frame["Quantity"] == 0).sum()),
        "negative_price_rows": int((frame["UnitPrice"] < 0).sum()),
        "zero_price_rows": int((frame["UnitPrice"] == 0).sum()),
        "cancellation_rows": int(
            frame["InvoiceNo"].astype("string").str.startswith("C", na=False).sum()
        ),
    }
