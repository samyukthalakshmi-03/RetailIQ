from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field

import pandas as pd


SESSION_TTL_SECONDS = 60 * 60
MAX_SESSIONS = 1


@dataclass
class AnalysisSession:
    raw: pd.DataFrame | None
    filename: str
    created_at: float = field(default_factory=time.monotonic)
    cleaned: pd.DataFrame | None = None
    product_sales: pd.DataFrame | None = None
    rfm: pd.DataFrame | None = None
    customers: pd.DataFrame | None = None
    cleaning_summary: dict | None = None
    snapshot_date: str | None = None
    dashboard: dict | None = None


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, AnalysisSession] = {}
        self._lock = threading.Lock()

    def _expire(self) -> None:
        now = time.monotonic()
        self._sessions = {
            key: value
            for key, value in self._sessions.items()
            if now - value.created_at < SESSION_TTL_SECONDS
        }

    def add(self, session_id: str, session: AnalysisSession) -> None:
        with self._lock:
            self._expire()
            if session_id not in self._sessions and len(self._sessions) >= MAX_SESSIONS:
                oldest_id = min(
                    self._sessions,
                    key=lambda key: self._sessions[key].created_at,
                )
                del self._sessions[oldest_id]
            self._sessions[session_id] = session

    def get(self, session_id: str) -> AnalysisSession | None:
        with self._lock:
            self._expire()
            return self._sessions.get(session_id)


session_store = SessionStore()
