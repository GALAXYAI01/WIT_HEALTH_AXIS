import os
import tempfile
from pathlib import Path


db_path = Path(tempfile.mkdtemp(prefix="wit-auth-persistence-test-")) / "history.db"
os.environ["WIT_HISTORY_DB_PATH"] = str(db_path)
os.environ["WIT_ADMIN_EMAIL"] = "bootstrap@example.test"
os.environ["WIT_ADMIN_PASSWORD"] = "a-secure-bootstrap-password"

from backend import history
from backend.schemas import AdminUserCreate
from backend.security import authenticate, create_user, init_auth_db


history.init_db()
init_auth_db()

bootstrap = authenticate("BOOTSTRAP@example.test", "a-secure-bootstrap-password")
assert bootstrap and bootstrap["role"] == "admin"

payload = AdminUserCreate(email="new-admin@example.test", password="a-secure-new-password")
assert payload.role == "admin"
created = create_user(payload.email, payload.password, payload.role)
assert created["role"] == "admin"

# Simulate a restart after an accidental role change in the persisted database.
with history.connect_db() as connection:
    connection.execute("UPDATE users SET role = 'researcher' WHERE email = ?", ("bootstrap@example.test",))
init_auth_db()

restored = authenticate("bootstrap@example.test", "a-secure-bootstrap-password")
assert restored and restored["role"] == "admin"
reopened = authenticate("new-admin@example.test", "a-secure-new-password")
assert reopened and reopened["role"] == "admin"

print("configured bootstrap admin survives initialization: PASS")
print("bootstrap role recovery: PASS")
print("admin user default role: PASS")
print("persisted admin login after restart simulation: PASS")
