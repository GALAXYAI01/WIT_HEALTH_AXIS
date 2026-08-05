"""Optional field-level encryption for sensitive patient metadata."""

import os
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken


@lru_cache(maxsize=1)
def _fernet() -> Fernet | None:
    key = os.environ.get("WIT_FIELD_ENCRYPTION_KEY", "").strip()
    prefix = "WIT_FIELD_ENCRYPTION_KEY="
    if key.startswith(prefix):
        key = key[len(prefix):].strip()
    key = key.strip('"').strip("'")
    if not key:
        return None
    try:
        return Fernet(key.encode("ascii"))
    except Exception as exc:
        raise RuntimeError("WIT_FIELD_ENCRYPTION_KEY must be a valid Fernet key") from exc


def encrypt_value(value: str | None) -> str | None:
    if value is None:
        return None
    fernet = _fernet()
    if fernet is None:
        return value
    return "enc:" + fernet.encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_value(value: str | None) -> str | None:
    if value is None or not value.startswith("enc:"):
        return value
    fernet = _fernet()
    if fernet is None:
        return "[encrypted field unavailable]"
    try:
        return fernet.decrypt(value[4:].encode("ascii")).decode("utf-8")
    except InvalidToken:
        return "[encrypted field unavailable]"
