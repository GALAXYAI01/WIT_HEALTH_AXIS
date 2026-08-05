import base64
import io
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from uuid import uuid4

from PIL import Image, ImageOps

from backend.crypto import decrypt_value, encrypt_value


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = PROJECT_ROOT / "data" / "scan_history.db"


def get_db_path() -> Path:
    configured = os.environ.get("WIT_HISTORY_DB_PATH")
    return Path(configured) if configured else DEFAULT_DB_PATH


def connect_db() -> sqlite3.Connection:
    path = get_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 5000")
    return connection


_connect = connect_db


def _ensure_column(connection: sqlite3.Connection, name: str, definition: str) -> None:
    columns = {row["name"] for row in connection.execute("PRAGMA table_info(scan_history)").fetchall()}
    if name not in columns:
        connection.execute(f"ALTER TABLE scan_history ADD COLUMN {name} {definition}")


def init_db() -> None:
    with _connect() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS scan_history (
                scan_id TEXT PRIMARY KEY,
                module TEXT NOT NULL,
                predicted_class TEXT,
                confidence REAL,
                status TEXT NOT NULL CHECK (status IN ('Completed', 'Failed')),
                error_message TEXT,
                created_at TEXT NOT NULL,
                image_name TEXT,
                thumbnail_data_url TEXT,
                model_version TEXT,
                user_id INTEGER,
                patient_name TEXT,
                patient_age TEXT,
                patient_gender TEXT,
                patient_sample_id TEXT,
                patient_date TEXT,
                class_probabilities_json TEXT,
                gradcam_data_url TEXT
            )
            """
        )
        _ensure_column(connection, "user_id", "INTEGER")
        _ensure_column(connection, "patient_name", "TEXT")
        _ensure_column(connection, "patient_age", "TEXT")
        _ensure_column(connection, "patient_gender", "TEXT")
        _ensure_column(connection, "patient_sample_id", "TEXT")
        _ensure_column(connection, "patient_date", "TEXT")
        _ensure_column(connection, "class_probabilities_json", "TEXT")
        _ensure_column(connection, "gradcam_data_url", "TEXT")
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_scan_history_created_at ON scan_history(created_at)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_scan_history_module ON scan_history(module)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_scan_history_user ON scan_history(user_id)"
        )


def create_scan(
    module: str,
    image_name: str = "",
    model_version: str = "",
    user_id: int | None = None,
    patient_name: str | None = None,
    patient_age: str | None = None,
    patient_gender: str | None = None,
    patient_sample_id: str | None = None,
    patient_date: str | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    scan_id = f"SCN-{now.strftime('%Y%m%d-%H%M%S')}-{uuid4().hex[:6].upper()}"
    with _connect() as connection:
        connection.execute(
            """
            INSERT INTO scan_history (
                scan_id, module, status, created_at, image_name, model_version, user_id,
                patient_name, patient_age, patient_gender, patient_sample_id, patient_date
            ) VALUES (?, ?, 'Failed', ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                scan_id,
                module,
                now.isoformat(),
                image_name or "",
                model_version or "",
                user_id,
                encrypt_value(patient_name),
                encrypt_value(patient_age),
                encrypt_value(patient_gender),
                encrypt_value(patient_sample_id),
                encrypt_value(patient_date),
            ),
        )
    return scan_id


def update_scan(
    scan_id: str,
    *,
    status: str,
    predicted_class: Optional[str] = None,
    confidence: Optional[float] = None,
    error_message: Optional[str] = None,
    thumbnail_data_url: Optional[str] = None,
    class_probabilities: Optional[dict[str, float]] = None,
    gradcam_data_url: Optional[str] = None,
) -> None:
    if status not in {"Completed", "Failed"}:
        raise ValueError(f"unsupported scan status: {status}")
    with _connect() as connection:
        connection.execute(
            """
            UPDATE scan_history
            SET status = ?, predicted_class = ?, confidence = ?, error_message = ?,
                thumbnail_data_url = COALESCE(?, thumbnail_data_url),
                class_probabilities_json = COALESCE(?, class_probabilities_json),
                gradcam_data_url = COALESCE(?, gradcam_data_url)
            WHERE scan_id = ?
            """,
            (
                status,
                predicted_class,
                confidence,
                error_message,
                thumbnail_data_url,
                json.dumps(class_probabilities, separators=(",", ":")) if class_probabilities else None,
                gradcam_data_url,
                scan_id,
            ),
        )


def make_thumbnail_data_url(image_bytes: bytes) -> Optional[str]:
    try:
        with Image.open(io.BytesIO(image_bytes)) as image:
            preview = ImageOps.exif_transpose(image).convert("RGB")
            preview.thumbnail((320, 320), Image.Resampling.LANCZOS)
            output = io.BytesIO()
            preview.save(output, format="JPEG", quality=72, optimize=True)
        encoded = base64.b64encode(output.getvalue()).decode("ascii")
        return f"data:image/jpeg;base64,{encoded}"
    except Exception:
        return None


def _row_to_dict(row: sqlite3.Row, include_error: bool = False) -> dict[str, Any]:
    record = dict(row)
    if not include_error:
        record.pop("error_message", None)
    for field in ("patient_name", "patient_age", "patient_gender", "patient_sample_id", "patient_date"):
        if field in record:
            record[field] = decrypt_value(record[field])
    if "class_probabilities_json" in record:
        raw_probabilities = record.pop("class_probabilities_json")
        try:
            record["class_probabilities"] = json.loads(raw_probabilities) if raw_probabilities else {}
        except json.JSONDecodeError:
            record["class_probabilities"] = {}
    return record


def list_scans(
    *,
    search: str = "",
    module: str = "",
    status: str = "",
    date: str = "",
    sort: str = "latest",
    page: int = 1,
    page_size: int = 12,
    user_id: int | None = None,
) -> dict[str, Any]:
    page = max(1, page)
    page_size = min(50, max(1, page_size))
    clauses: list[str] = []
    params: list[Any] = []
    if search:
        clauses.append("(scan_id LIKE ? OR module LIKE ? OR predicted_class LIKE ?)")
        term = f"%{search.strip()}%"
        params.extend([term, term, term])
    if module:
        clauses.append("module = ?")
        params.append(module)
    if status:
        clauses.append("status = ?")
        params.append(status)
    if date:
        clauses.append("substr(created_at, 1, 10) = ?")
        params.append(date)
    if user_id is not None:
        clauses.append("user_id = ?")
        params.append(user_id)

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    direction = "ASC" if sort == "oldest" else "DESC"
    offset = (page - 1) * page_size
    with _connect() as connection:
        total = connection.execute(
            f"SELECT COUNT(*) AS count FROM scan_history {where}", params
        ).fetchone()["count"]
        rows = connection.execute(
            f"""
            SELECT scan_id, module, predicted_class, confidence, status, created_at,
                   image_name, thumbnail_data_url, model_version, user_id,
                   patient_name, patient_age, patient_gender, patient_sample_id, patient_date,
                   class_probabilities_json
            FROM scan_history
            {where}
            ORDER BY created_at {direction}
            LIMIT ? OFFSET ?
            """,
            [*params, page_size, offset],
        ).fetchall()

        today = datetime.now(timezone.utc).date().isoformat()
        summary_clauses = ["1 = 1"]
        summary_params: list[Any] = []
        if user_id is not None:
            summary_clauses.append("user_id = ?")
            summary_params.append(user_id)
        summary = connection.execute(
            f"""
            SELECT COUNT(*) AS total_scans,
                   COUNT(DISTINCT module) AS diseases_analyzed,
                   SUM(CASE WHEN substr(created_at, 1, 10) = ? THEN 1 ELSE 0 END) AS todays_scans
            FROM scan_history WHERE {' AND '.join(summary_clauses)}
            """,
            [today, *summary_params],
        ).fetchone()

    return {
        "items": [_row_to_dict(row) for row in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "summary": {
            "total_scans": summary["total_scans"] or 0,
            "diseases_analyzed": summary["diseases_analyzed"] or 0,
            "todays_scans": summary["todays_scans"] or 0,
        },
    }


def get_scan(scan_id: str, user_id: int | None = None) -> Optional[dict[str, Any]]:
    with _connect() as connection:
        query = "SELECT * FROM scan_history WHERE scan_id = ?"
        params: list[Any] = [scan_id]
        if user_id is not None:
            query += " AND user_id = ?"
            params.append(user_id)
        row = connection.execute(query, params).fetchone()
    return _row_to_dict(row, include_error=True) if row else None


def delete_scan(scan_id: str) -> bool:
    with _connect() as connection:
        cursor = connection.execute("DELETE FROM scan_history WHERE scan_id = ?", (scan_id,))
    return cursor.rowcount > 0


def analytics(user_id: int | None = None) -> dict[str, Any]:
    where = "WHERE user_id = ?" if user_id is not None else ""
    params: list[Any] = [user_id] if user_id is not None else []
    with _connect() as connection:
        totals = connection.execute(
            f"""
            SELECT COUNT(*) AS total,
                   SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) AS completed,
                   SUM(CASE WHEN status = 'Failed' THEN 1 ELSE 0 END) AS failed,
                   AVG(CASE WHEN status = 'Completed' THEN confidence END) AS avg_confidence
            FROM scan_history {where}
            """,
            params,
        ).fetchone()
        modules = connection.execute(
            f"""
            SELECT module, COUNT(*) AS scans,
                   SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) AS completed,
                   AVG(CASE WHEN status = 'Completed' THEN confidence END) AS avg_confidence
            FROM scan_history {where}
            GROUP BY module ORDER BY scans DESC
            """,
            params,
        ).fetchall()
        daily = connection.execute(
            f"""
            SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS scans
            FROM scan_history {where}
            GROUP BY date ORDER BY date DESC LIMIT 14
            """,
            params,
        ).fetchall()
    return {
        "total_scans": totals["total"] or 0,
        "completed_scans": totals["completed"] or 0,
        "failed_scans": totals["failed"] or 0,
        "average_confidence": round(float(totals["avg_confidence"] or 0), 4),
        "by_module": [dict(row) for row in modules],
        "daily_scans": [dict(row) for row in reversed(daily)],
    }
