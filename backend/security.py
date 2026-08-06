"""Authentication, sessions, RBAC, CSRF, rate limiting, and audit logging."""

import hashlib
import json
import logging
import os
import re
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

import bcrypt
import jwt
from fastapi import HTTPException, Request, status

from backend.history import connect_db


LOGGER = logging.getLogger("wit.security")
JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ.get("WIT_JWT_SECRET") or secrets.token_urlsafe(48)
ACCESS_MINUTES = max(5, int(os.environ.get("WIT_ACCESS_TOKEN_MINUTES", "30")))
REFRESH_DAYS = max(1, int(os.environ.get("WIT_SESSION_DAYS", "7")))
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
ROLES = {"admin", "researcher", "viewer"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime | None = None) -> str:
    return (value or _now()).isoformat()


def _token_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("ascii"))
    except (ValueError, TypeError):
        return False


def validate_email(email: str) -> str:
    normalized = email.strip().lower()
    if len(normalized) > 254 or not EMAIL_RE.fullmatch(normalized):
        raise HTTPException(status_code=422, detail="a valid email address is required")
    return normalized


def validate_password(password: str) -> str:
    if len(password) < 12:
        raise HTTPException(status_code=422, detail="password must be at least 12 characters")
    if len(password.encode("utf-8")) > 72:
        raise HTTPException(status_code=422, detail="password must be 72 UTF-8 bytes or fewer")
    return password


def init_auth_db() -> None:
    with connect_db() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('admin', 'researcher', 'viewer')),
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                last_login_at TEXT
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                csrf_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                revoked_at TEXT,
                ip_address TEXT,
                user_agent TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )
        connection.execute("CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)")
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                action TEXT NOT NULL,
                resource_type TEXT NOT NULL,
                resource_id TEXT,
                metadata_json TEXT,
                ip_address TEXT,
                user_agent TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )
        connection.execute("CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at)")
        connection.execute(
            "CREATE TABLE IF NOT EXISTS system_settings (setting_key TEXT PRIMARY KEY, setting_value TEXT NOT NULL)"
        )

    _ensure_bootstrap_admin()


def _ensure_bootstrap_admin() -> None:
    """Keep the explicitly configured recovery administrator available after a reset."""
    bootstrap_email = os.environ.get("WIT_ADMIN_EMAIL", "").strip()
    bootstrap_password = os.environ.get("WIT_ADMIN_PASSWORD", "")
    if not bootstrap_email or not bootstrap_password:
        return

    bootstrap_email = validate_email(bootstrap_email)
    validate_password(bootstrap_password)
    with connect_db() as connection:
        existing = connection.execute(
            "SELECT id, role, is_active FROM users WHERE email = ?",
            (bootstrap_email,),
        ).fetchone()

    if existing is None:
        create_user(bootstrap_email, bootstrap_password, "admin")
        LOGGER.info("Bootstrapped the configured admin account from environment configuration")
        return

    # The bootstrap identity is an explicit recovery administrator. Promote it
    # back to admin if a database reset or an earlier role assignment changed it.
    if existing["role"] != "admin" or not existing["is_active"]:
        with connect_db() as connection:
            connection.execute(
                "UPDATE users SET role = 'admin', is_active = 1 WHERE id = ?",
                (existing["id"],),
            )
        LOGGER.info("Restored admin access for the configured bootstrap account")


def create_user(email: str, password: str, role: str = "viewer") -> dict[str, Any]:
    email = validate_email(email)
    validate_password(password)
    if role not in ROLES:
        raise HTTPException(status_code=422, detail="unsupported role")
    try:
        with connect_db() as connection:
            cursor = connection.execute(
                "INSERT INTO users (email, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
                (email, hash_password(password), role, _iso()),
            )
            user_id = cursor.lastrowid
    except Exception as exc:
        if "UNIQUE" in str(exc).upper():
            raise HTTPException(status_code=409, detail="an account with that email already exists") from exc
        raise
    return get_user(int(user_id))


def user_count() -> int:
    with connect_db() as connection:
        return int(connection.execute("SELECT COUNT(*) AS count FROM users").fetchone()["count"])


def get_setting(key: str, default: str = "") -> str:
    with connect_db() as connection:
        connection.execute(
            "CREATE TABLE IF NOT EXISTS system_settings (setting_key TEXT PRIMARY KEY, setting_value TEXT NOT NULL)"
        )
        row = connection.execute("SELECT setting_value FROM system_settings WHERE setting_key = ?", (key,)).fetchone()
    return str(row["setting_value"]) if row else default


def set_setting(key: str, value: str) -> None:
    with connect_db() as connection:
        connection.execute(
            "CREATE TABLE IF NOT EXISTS system_settings (setting_key TEXT PRIMARY KEY, setting_value TEXT NOT NULL)"
        )
        connection.execute(
            "INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value",
            (key, value),
        )


def get_user(user_id: int) -> dict[str, Any] | None:
    with connect_db() as connection:
        row = connection.execute(
            "SELECT id, email, role, is_active, created_at, last_login_at FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    return dict(row) if row else None


def _get_user_with_password(email: str) -> dict[str, Any] | None:
    with connect_db() as connection:
        row = connection.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    return dict(row) if row else None


def authenticate(email: str, password: str) -> dict[str, Any] | None:
    normalized = validate_email(email)
    row = _get_user_with_password(normalized)
    if not row or not row["is_active"] or not verify_password(password, row["password_hash"]):
        return None
    with connect_db() as connection:
        connection.execute("UPDATE users SET last_login_at = ? WHERE id = ?", (_iso(), row["id"]))
    return get_user(int(row["id"]))


def _access_token(user: dict[str, Any]) -> str:
    issued = _now()
    payload = {
        "sub": str(user["id"]),
        "role": user["role"],
        "type": "access",
        "iat": int(issued.timestamp()),
        "exp": int((issued + timedelta(minutes=ACCESS_MINUTES)).timestamp()),
        "jti": secrets.token_urlsafe(12),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def issue_session(user: dict[str, Any], request: Request) -> tuple[str, str, str]:
    access_token = _access_token(user)
    refresh_token = secrets.token_urlsafe(48)
    csrf_token = secrets.token_urlsafe(32)
    now = _now()
    with connect_db() as connection:
        connection.execute(
            "INSERT INTO sessions (id, user_id, token_hash, csrf_hash, created_at, expires_at, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                secrets.token_urlsafe(18),
                user["id"],
                _token_hash(refresh_token),
                _token_hash(csrf_token),
                _iso(now),
                _iso(now + timedelta(days=REFRESH_DAYS)),
                request.client.host if request.client else "",
                request.headers.get("user-agent", "")[:300],
            ),
        )
    return access_token, refresh_token, csrf_token


def rotate_session(refresh_token: str, request: Request) -> tuple[dict[str, Any], str, str, str] | None:
    with connect_db() as connection:
        row = connection.execute(
            "SELECT * FROM sessions WHERE token_hash = ? AND revoked_at IS NULL",
            (_token_hash(refresh_token),),
        ).fetchone()
        if not row or datetime.fromisoformat(row["expires_at"]) <= _now():
            return None
        connection.execute("UPDATE sessions SET revoked_at = ? WHERE id = ?", (_iso(), row["id"]))
    user = get_user(int(row["user_id"]))
    if not user or not user["is_active"]:
        return None
    access, refresh, csrf = issue_session(user, request)
    return user, access, refresh, csrf


def revoke_session(refresh_token: str | None) -> None:
    if not refresh_token:
        return
    with connect_db() as connection:
        connection.execute(
            "UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL",
            (_iso(), _token_hash(refresh_token)),
        )


def _token_from_request(request: Request) -> str | None:
    authorization = request.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return request.cookies.get("access_token")


def optional_user(request: Request) -> dict[str, Any] | None:
    token = _token_from_request(request)
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            return None
        user = get_user(int(payload["sub"]))
        if not user or not user["is_active"]:
            return None
        request.state.user = user
        return user
    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError):
        return None


def current_user(request: Request) -> dict[str, Any]:
    user = optional_user(request)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="authentication required")
    return user


def require_roles(*roles: str) -> Callable[[Request], dict[str, Any]]:
    allowed = set(roles)

    def dependency(request: Request) -> dict[str, Any]:
        user = current_user(request)
        if user["role"] not in allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="insufficient permissions")
        return user

    return dependency


def require_csrf(request: Request) -> None:
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return
    cookie_token = request.cookies.get("csrf_token", "")
    header_token = request.headers.get("x-csrf-token", "")
    if not cookie_token or not header_token or not secrets.compare_digest(cookie_token, header_token):
        raise HTTPException(status_code=403, detail="CSRF validation failed")


class RateLimiter:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._buckets: dict[str, list[float]] = {}

    def allow(self, key: str, limit: int, window: int) -> bool:
        now = time.monotonic()
        with self._lock:
            timestamps = [stamp for stamp in self._buckets.get(key, []) if now - stamp < window]
            if len(timestamps) >= limit:
                self._buckets[key] = timestamps
                return False
            timestamps.append(now)
            self._buckets[key] = timestamps
            if len(self._buckets) > 5000:
                self._buckets = {bucket: values for bucket, values in self._buckets.items() if values}
            return True


rate_limiter = RateLimiter()


def record_audit(
    request: Request | None,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    user_id: int | None = None,
) -> None:
    try:
        if user_id is None and request is not None:
            user = optional_user(request)
            user_id = int(user["id"]) if user else None
        with connect_db() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    action TEXT NOT NULL,
                    resource_type TEXT NOT NULL,
                    resource_id TEXT,
                    metadata_json TEXT,
                    ip_address TEXT,
                    user_agent TEXT,
                    created_at TEXT NOT NULL
                )
                """
            )
            connection.execute(
                "INSERT INTO audit_logs (user_id, action, resource_type, resource_id, metadata_json, ip_address, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    user_id,
                    action,
                    resource_type,
                    resource_id,
                    json.dumps(metadata or {}, separators=(",", ":"))[:4000],
                    request.client.host if request and request.client else "",
                    request.headers.get("user-agent", "")[:300] if request else "",
                    _iso(),
                ),
            )
    except Exception:
        LOGGER.exception("audit log write failed")


def list_audit_logs(limit: int = 100, offset: int = 0) -> list[dict[str, Any]]:
    limit = min(200, max(1, limit))
    offset = max(0, offset)
    with connect_db() as connection:
        rows = connection.execute(
            """
            SELECT a.id, a.action, a.resource_type, a.resource_id, a.metadata_json,
                   a.ip_address, a.user_agent, a.created_at, u.email
            FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
            ORDER BY a.created_at DESC LIMIT ? OFFSET ?
            """,
            (limit, offset),
        ).fetchall()
    return [
        {
            **dict(row),
            "metadata": json.loads(row["metadata_json"] or "{}"),
        }
        for row in rows
    ]
