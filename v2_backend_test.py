import os
import tempfile
from pathlib import Path

os.environ["WIT_HISTORY_DB_PATH"] = str(Path(tempfile.mkdtemp(prefix="wit-v2-test-")) / "history.db")
os.environ["WIT_JWT_SECRET"] = "v2-test-secret-with-enough-entropy"
os.environ.pop("WIT_ADMIN_EMAIL", None)
os.environ.pop("WIT_ADMIN_PASSWORD", None)

from fastapi.testclient import TestClient

from backend import history
from backend import main
from backend.security import init_auth_db


history.init_db()
init_auth_db()

with TestClient(main.app) as client:
    assert client.get("/admin/analytics").status_code == 401
    registered = client.post("/auth/register", json={"email": "admin@example.test", "password": "a-secure-test-password"})
    assert registered.status_code == 201, registered.text
    assert registered.json()["role"] == "admin"

    login = client.post("/auth/login", json={"email": "admin@example.test", "password": "a-secure-test-password"})
    assert login.status_code == 200, login.text
    assert client.get("/auth/me").json()["role"] == "admin"
    assert client.get("/admin/system-health").status_code == 200
    assert client.get("/admin/analytics").status_code == 200
    csrf = client.cookies.get("csrf_token")
    created_user = client.post(
        "/admin/users",
        headers={"X-CSRF-Token": csrf},
        json={"email": "researcher@example.test", "password": "a-secure-user-password", "role": "researcher"},
    )
    assert created_user.status_code == 201, created_user.text
    assert created_user.json()["role"] == "researcher"
    assert client.post(
        "/admin/users",
        headers={"X-CSRF-Token": csrf},
        json={"email": "second@example.test", "password": "a-secure-user-password", "role": "viewer"},
    ).status_code == 201
    scan_id = history.create_scan("malaria", "sample.png", "efficientnet_b3-224")
    history.update_scan(scan_id, status="Completed", predicted_class="Parasitized", confidence=0.98, class_probabilities={"Parasitized": 0.98, "Uninfected": 0.02})
    report = client.get(f"/history/{scan_id}/report")
    assert report.status_code == 200 and report.content.startswith(b"%PDF-1.4"), report.text
    assert client.delete(f"/admin/history/{scan_id}").status_code == 403
    deleted = client.delete(f"/admin/history/{scan_id}", headers={"X-CSRF-Token": csrf})
    assert deleted.status_code == 204, deleted.text
    assert client.get(f"/history/{scan_id}").status_code == 404
    settings = client.patch("/admin/settings", headers={"X-CSRF-Token": csrf}, json={"require_auth_for_predictions": True})
    assert settings.status_code == 200, settings.text
    assert settings.json()["require_auth_for_predictions"] is True
    assert client.get("/admin/audit-logs").status_code == 200
    assert client.post("/auth/logout", headers={"X-CSRF-Token": csrf}).json()["ok"] is True
    assert client.get("/auth/me").status_code == 401

print("unauthenticated admin blocked: PASS")
print("first-account admin bootstrap: PASS")
print("bcrypt login and JWT session cookie: PASS")
print("RBAC admin endpoints: PASS")
print("admin user creation: PASS")
print("history PDF endpoint: PASS")
print("admin history deletion and CSRF protection: PASS")
print("CSRF-protected settings update: PASS")
print("audit log and logout revocation: PASS")
