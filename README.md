# RetailIQ

RetailIQ is a locally runnable React/FastAPI application built around the existing RetailIQ notebook. It preserves the notebook's transaction filters, RFM definitions, `numpy.log1p` feature order, fitted `StandardScaler`, and fitted two-cluster K-Means model. It does not train, replace, or fabricate a model or customer assignments.

The project notebook remains at [`notebook/Retail_Data_Cleaning_Mini_Project (1).ipynb`](./notebook/Retail_Data_Cleaning_Mini_Project%20(1).ipynb). The exported model artifacts live in `backend/artifacts/`. The original raw Online Retail dataset is not included.

## Install the original model artifacts

The five exported files are expected in `backend/artifacts/`:

```text
RetailIQ/
  backend/
    artifacts/
      standard_scaler.joblib
      kmeans_model.joblib
      metadata.json
      final_customer_segmentation.csv
      cluster_profiles.csv
```

The first three files are required for predictions. The customer segmentation CSV enables direct prediction comparisons against the notebook. The profile CSV is a reference export; analytics profiles are computed from the uploaded transactions and model assignments.

The artifacts are loaded once at FastAPI startup. The loader validates the metadata feature order, scaler/model feature names, all 4,335 reference rows, saved scaled features, predictions, and cluster counts. Restart the backend after replacing artifacts. To use an alternate directory, set `RETAILIQ_ARTIFACTS_DIR` to its absolute path.

The metadata records Python 3.13.18 and scikit-learn 1.6.1. The backend requirements pin scikit-learn to 1.6.1. A version mismatch is reported visibly by `/api/health` and the UI because scikit-learn does not guarantee pickle compatibility across versions.

Joblib files can execute code when loaded. Only load the trusted files exported by your own notebook.

## Run locally on Windows

Open two PowerShell terminals from the project root.

### Backend

```powershell
py -3.13 -m venv backend\.venv
backend\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
Set-Location backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

If PowerShell blocks environment activation, run the interpreter directly:

```powershell
py -3.13 -m pip install -r backend\requirements.txt
py -3.13 -m uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```

### Frontend

```powershell
Set-Location frontend
npm install
npm run dev
```

Open the Vite URL printed in the terminal (normally `http://127.0.0.1:5173`). The API is at `http://127.0.0.1:8000`; its interactive docs are at `/docs`.

Optional: set `VITE_API_URL` before starting Vite to use a different backend URL.

## Analysis methodology

1. Validate the original Online Retail column names, parseable `InvoiceDate`, and numeric `Quantity` and `UnitPrice`.
2. Remove exact duplicate rows only.
3. Fill missing `Description` values only when `StockCode` has exactly one non-missing description.
4. Preserve cancellations, returns, zero/negative prices, and missing IDs in the cleaned transaction export.
5. For RFM only, exclude invoices starting with `C`, rows with `Quantity <= 0` or `UnitPrice <= 0`, descriptions `AMAZON FEE`, `POSTAGE`, `DOTCOM POSTAGE`, `Adjust bad debt`, and `Manual`, and missing `CustomerID`.
6. Compute Recency as whole days since the customer's latest invoice to `max(InvoiceDate) + 1 day`; Frequency as distinct `InvoiceNo`; Monetary as the sum of `Quantity * UnitPrice`.
7. Apply `numpy.log1p` in order `Log_Recency`, `Log_Frequency`, `Log_Monetary`; transform with the existing fitted scaler; then use `KMeans.predict()` in the matching scaled-feature order.

No `.fit()` or `.fit_predict()` occurs in inference. New datasets use the same notebook filters and snapshot-date rule; their cluster distribution can differ from the original training dataset.

The notebook's silhouette score of `0.4329` is reported as a **recorded training clustering evaluation**, never as model accuracy or an evaluation of a new upload.

## Test and verify

```powershell
py -3.13 -m pip install -r backend\requirements.txt
py -3.13 -m pytest backend\tests -q
```

To compare the original Online Retail CSV and saved assignments against the notebook, after installing the artifacts:

```powershell
py -3.13 backend\app\scripts\verify_original.py "C:\path\to\Online Retail.csv"
```

The verification command checks 4,335 customers, cluster counts 1,664/2,671, and all shared saved customer IDs. It exits with an error on any mismatch.

## Architecture

- `backend/app/services/validation.py` â€” CSV validation and quality report.
- `backend/app/services/cleaning.py` â€” notebook-faithful transaction cleaning and RFM eligibility.
- `backend/app/services/rfm.py` â€” customer feature extraction and log transform.
- `backend/app/services/model.py` â€” one-time loading and inference with the original fitted objects.
- `backend/app/services/analysis.py` â€” actual-result analytics, profiles, and optional notebook-label comparison.
- `backend/app/api/routes.py` â€” upload, clean, analysis, customer, health, and report endpoints.
- `frontend/src/pages/WorkspacePages.jsx` â€” responsive dashboard, upload, cleaning, RFM, customer explorer, insights, reports, and settings views.

Analysis data is held in memory for up to one hour, with at most three active uploads. MongoDB is not required because the app does not persist customer records or analysis history. Do not expose this unauthenticated local tool as a public service.

