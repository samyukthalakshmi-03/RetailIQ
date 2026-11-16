from __future__ import annotations

import json
import os
import pickle
import warnings
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.cluster import KMeans
from sklearn.exceptions import InconsistentVersionWarning
from sklearn.preprocessing import StandardScaler

from app.services.rfm import RFM_FEATURES, SCALED_FEATURES


BACKEND_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ARTIFACTS_DIR = BACKEND_ROOT / "artifacts"


class ModelUnavailableError(RuntimeError):
    pass


class ModelRegistry:
    def __init__(self) -> None:
        self.scaler: StandardScaler | None = None
        self.kmeans: KMeans | None = None
        self.metadata: dict | None = None
        self.reference_customers: dict[str, int] = {}
        self.reference_profiles: pd.DataFrame | None = None
        self.preprocessing_features: list[str] = []
        self.model_input_features: list[str] = []
        self.compatibility_warning: str | None = None
        self.error: str | None = None
        self.artifacts_dir = Path(
            os.getenv("RETAILIQ_ARTIFACTS_DIR", str(DEFAULT_ARTIFACTS_DIR))
        )

    def load(self) -> None:
        scaler_path = self.artifacts_dir / "standard_scaler.joblib"
        kmeans_path = self.artifacts_dir / "kmeans_model.joblib"
        metadata_path = self.artifacts_dir / "metadata.json"
        customers_path = self.artifacts_dir / "final_customer_segmentation.csv"
        profiles_path = self.artifacts_dir / "cluster_profiles.csv"
        missing = [
            path.name
            for path in (
                scaler_path,
                kmeans_path,
                metadata_path,
                customers_path,
                profiles_path,
            )
            if not path.is_file()
        ]
        if missing:
            self.error = (
                f"Required original model artifact(s) are missing from "
                f"the configured artifacts directory: {', '.join(missing)}. "
                "Copy the existing notebook exports into the artifacts folder; "
                "RetailIQ will not train or substitute a model."
            )
            return

        try:
            with metadata_path.open(encoding="utf-8") as file:
                metadata = json.load(file)
            raw_features = metadata.get("features")
            transformed_features = metadata.get("scaled_features")
            model_input_features = metadata.get("model_input_features")
            transformation = metadata.get("transformation")

            if raw_features != ["Recency", "Frequency", "Monetary"]:
                raise ValueError("metadata.json has an unexpected raw RFM feature order.")
            if transformed_features != RFM_FEATURES:
                raise ValueError(
                    "metadata.json scaled_features must list the log-transformed "
                    "features in Recency, Frequency, Monetary order."
                )
            if model_input_features != SCALED_FEATURES:
                raise ValueError("metadata.json has an unexpected K-Means input feature order.")
            if transformation != "log1p":
                raise ValueError(
                    f"Unsupported metadata transformation {transformation!r}; expected 'log1p'."
                )

            versions = metadata.get("software_versions", {})
            trained_version = versions.get("scikit_learn")
            if not trained_version:
                raise ValueError("metadata.json is missing software_versions.scikit_learn.")
            self.compatibility_warning = None
            if trained_version != sklearn.__version__:
                self.compatibility_warning = (
                    f"These Joblib artifacts were exported with scikit-learn "
                    f"{trained_version}, but RetailIQ is running {sklearn.__version__}. "
                    "Predictions are checked against the exported notebook assignments, "
                    "but use the exact exported version for supported model compatibility."
                )

            with warnings.catch_warnings(record=True) as load_warnings:
                warnings.simplefilter("always", InconsistentVersionWarning)
                scaler = joblib.load(scaler_path)
                kmeans = joblib.load(kmeans_path)
            if not isinstance(scaler, StandardScaler):
                raise ValueError("standard_scaler.joblib is not a fitted StandardScaler.")
            if not isinstance(kmeans, KMeans):
                raise ValueError("kmeans_model.joblib is not a fitted K-Means model.")
            if not hasattr(scaler, "mean_") or not hasattr(kmeans, "cluster_centers_"):
                raise ValueError("The exported scaler or K-Means model is not fitted.")
            if list(scaler.feature_names_in_) != transformed_features:
                raise ValueError("The fitted scaler does not match metadata.json scaled_features.")
            if list(kmeans.feature_names_in_) != model_input_features:
                raise ValueError("The fitted K-Means model does not match metadata.json model_input_features.")
            if scaler.n_features_in_ != 3 or kmeans.n_features_in_ != 3:
                raise ValueError("The exported models must each use three RFM features.")
            if int(metadata["clusters"]) != kmeans.n_clusters:
                raise ValueError("metadata.json cluster count does not match the fitted K-Means model.")
            if load_warnings and not self.compatibility_warning:
                self.compatibility_warning = "; ".join(
                    str(item.message)
                    for item in load_warnings
                    if issubclass(item.category, InconsistentVersionWarning)
                ) or None

            reference = pd.read_csv(customers_path)
            required_columns = {
                "CustomerID",
                "Recency",
                "Frequency",
                "Monetary",
                *transformed_features,
                *model_input_features,
                "Cluster",
            }
            if not required_columns.issubset(reference.columns):
                raise ValueError(
                    "final_customer_segmentation.csv is missing one or more "
                    "notebook RFM, transformed, scaled, or cluster columns."
                )
            if len(reference) != int(metadata["training_customers"]):
                raise ValueError(
                    "final_customer_segmentation.csv row count does not match metadata.json."
                )
            if reference["CustomerID"].duplicated().any():
                raise ValueError("final_customer_segmentation.csv has duplicate CustomerIDs.")

            expected_log_features = np.log1p(
                reference[raw_features].to_numpy(dtype=float)
            )
            np.testing.assert_allclose(
                expected_log_features,
                reference[transformed_features].to_numpy(dtype=float),
                rtol=1e-10,
                atol=1e-10,
            )
            expected_scaled = scaler.transform(reference[transformed_features])
            np.testing.assert_allclose(
                expected_scaled,
                reference[model_input_features].to_numpy(dtype=float),
                rtol=1e-7,
                atol=1e-8,
            )
            reference_predictions = kmeans.predict(
                pd.DataFrame(expected_scaled, columns=model_input_features)
            )
            np.testing.assert_array_equal(
                reference_predictions,
                reference["Cluster"].to_numpy(dtype=int),
            )

            profiles = pd.read_csv(profiles_path)
            profile_columns = {
                "Cluster",
                "Customer_Count",
                "Average_Recency",
                "Average_Frequency",
                "Average_Monetary",
                "Customer_Percentage",
            }
            if not profile_columns.issubset(profiles.columns):
                raise ValueError("cluster_profiles.csv is missing expected notebook profile columns.")
            reference_counts = reference["Cluster"].value_counts().sort_index()
            profile_counts = profiles.set_index("Cluster")["Customer_Count"].sort_index()
            if not reference_counts.equals(profile_counts.reindex(reference_counts.index)):
                raise ValueError(
                    "cluster_profiles.csv customer counts do not match the saved segmentation."
                )

            self.scaler = scaler
            self.kmeans = kmeans
            self.metadata = metadata
            self.preprocessing_features = list(transformed_features)
            self.model_input_features = list(model_input_features)
            self.reference_customers = {
                str(int(customer_id)): int(cluster)
                for customer_id, cluster in zip(
                    reference["CustomerID"], reference["Cluster"], strict=True
                )
            }
            self.reference_profiles = profiles
            self.error = None
        except (
            OSError,
            ValueError,
            AssertionError,
            KeyError,
            TypeError,
            EOFError,
            json.JSONDecodeError,
            pickle.UnpicklingError,
            ImportError,
            AttributeError,
        ) as exc:
            self.error = (
                f"Could not load and validate the exported model artifacts in "
                f"{self.artifacts_dir}: {exc}"
            )
            self.scaler = None
            self.kmeans = None
            self.metadata = None
            self.reference_customers = {}
            self.reference_profiles = None
            self.preprocessing_features = []
            self.model_input_features = []

    @property
    def available(self) -> bool:
        return self.scaler is not None and self.kmeans is not None and self.metadata is not None

    def predict(self, transformed_features: pd.DataFrame) -> np.ndarray:
        if not self.available:
            raise ModelUnavailableError(self.error or "The original fitted model is unavailable.")
        expected = self.preprocessing_features
        if list(transformed_features.columns) != expected:
            raise ValueError(f"Expected transformed features in this order: {expected}.")
        assert self.scaler is not None
        assert self.kmeans is not None
        scaled = self.scaler.transform(transformed_features)
        scaled_frame = pd.DataFrame(scaled, columns=self.model_input_features)
        return self.kmeans.predict(scaled_frame)

    def status(self) -> dict:
        return {
            "available": self.available,
            "artifacts_directory": (
                "artifacts"
                if self.artifacts_dir == DEFAULT_ARTIFACTS_DIR
                else self.artifacts_dir.name
            ),
            "message": self.error or "The original fitted scaler and K-Means model are loaded.",
            "compatibility_warning": self.compatibility_warning,
            "silhouette_score": (
                self.metadata.get("silhouette_score")
                if self.metadata
                else None
            ),
        }
