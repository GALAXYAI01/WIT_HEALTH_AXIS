import os
import logging
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Any, List, Literal

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
from dotenv import load_dotenv
from pydantic import BaseModel, Field

from backend.history import (
    analytics,
    create_scan,
    delete_scan,
    get_scan,
    init_db,
    list_scans,
    make_thumbnail_data_url,
    update_scan,
)
from backend.security import (
    authenticate,
    create_user,
    current_user,
    get_setting,
    init_auth_db,
    issue_session,
    list_audit_logs,
    optional_user,
    rate_limiter,
    record_audit,
    require_csrf,
    require_roles,
    revoke_session,
    rotate_session,
    set_setting,
    user_count,
)
from backend.inference import load_available_detectors
from backend.reports import build_history_pdf
from backend.schemas import (
    HealthResponse,
    ModuleInfo,
    PredictionResponse,
    ScanHistoryDetail,
    ScanHistoryResponse,
    AdminSettings,
    AdminSettingsUpdate,
    AnalyticsResponse,
    AdminUserCreate,
    AuthCredentials,
    AuthRegisterRequest,
    AuthUser,
)
from src.config import MODULES

load_dotenv()
LOGGER = logging.getLogger("wit.api")
gemini_client = (
    genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
    if os.environ.get("GEMINI_API_KEY")
    else None
)
CHAT_MODEL = "gemini-3-flash-preview"

SYSTEM_PROMPT = """You are the assistant for WIT Research & Analysis, a research and
educational tool from Walchand Institute of Technology that screens microscopy images
for malaria, leukemia, and histopathologic cancer using deep learning, with Grad-CAM
visualizations. This is explicitly a research and educational prototype, not a
validated clinical diagnostic tool. If someone describes their own symptoms and asks
what they have, don't diagnose them, point them to a real doctor.

You answer two kinds of questions: how this system itself works (upload an image on
the malaria, leukemia, or histopathology page, click Analyze, then check the Summary,
All Probabilities, and Grad-CAM tabs; Download Report produces a PDF), and general
educational questions about any disease, not just these three. When someone wants to
go to a specific page, use the navigate_to_page tool instead of just describing where
it is. Pages that exist: home, about, detection, malaria, leukemia, histopathology,
 guidelines, contact, history."""

SYSTEM_PROMPT += """

Keep every reply concise: use at most 2 short sentences or 3 short bullets. Do not
repeat the full site description unless asked. Offer one useful next step when it
fits, and never diagnose a person's symptoms."""

NAVIGATE_FUNCTION = types.FunctionDeclaration(
    name="navigate_to_page",
    description="Navigate the user's browser to a specific page on this site.",
    parameters=types.Schema(
        type="OBJECT",
        properties={"page": types.Schema(type="STRING",
            enum=["home", "about", "detection", "malaria", "leukemia",
                  "histopathology", "guidelines", "contact", "history"])},
        required=["page"],
    ),
)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=20)

detectors = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    init_auth_db()
    detectors.update(load_available_detectors())
    yield
    detectors.clear()


app = FastAPI(title="Disease Detection Framework API", lifespan=lifespan)


def _truthy(value: str | None) -> bool:
    return str(value or "").lower() in {"1", "true", "yes", "on"}


def _allowed_origins() -> list[str]:
    raw = os.environ.get(
        "WIT_ALLOWED_ORIGINS",
        "http://127.0.0.1:5500,http://localhost:5500",
    )
    return [origin.strip().rstrip("/") for origin in raw.split(",") if origin.strip()]


COOKIE_SECURE = _truthy(os.environ.get("WIT_COOKIE_SECURE"))
COOKIE_SAMESITE = os.environ.get("WIT_COOKIE_SAMESITE", "lax").lower()
if COOKIE_SAMESITE not in {"lax", "strict", "none"}:
    COOKIE_SAMESITE = "lax"


def _set_session_cookies(response: Response, access: str, refresh: str, csrf: str) -> None:
    response.set_cookie(
        "access_token", access, httponly=True, secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE, max_age=30 * 60, path="/",
    )
    response.set_cookie(
        "refresh_token", refresh, httponly=True, secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE, max_age=7 * 24 * 60 * 60, path="/auth",
    )
    response.set_cookie(
        "csrf_token", csrf, httponly=False, secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE, max_age=7 * 24 * 60 * 60, path="/",
    )


def _clear_session_cookies(response: Response) -> None:
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/auth")
    response.delete_cookie("csrf_token", path="/")


def _redact_public_record(record: dict[str, Any], user: dict[str, Any] | None) -> dict[str, Any]:
    if user:
        return record
    safe = dict(record)
    for field in ("user_id", "patient_name", "patient_age", "patient_gender", "patient_sample_id", "patient_date"):
        if field in safe:
            safe[field] = None
    return safe


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    content_length = int(request.headers.get("content-length", "0") or 0)
    max_body = max(1, int(os.environ.get("WIT_MAX_REQUEST_MB", "60"))) * 1024 * 1024
    if content_length > max_body:
        return Response("request body is too large", status_code=413, media_type="text/plain")

    path = request.url.path
    if request.method != "OPTIONS" and path.startswith(("/auth/", "/chat", "/predict/")):
        prefix = "auth" if path.startswith("/auth/") else "chat" if path == "/chat" else "predict"
        limits = {"auth": (12, 60), "chat": (20, 60), "predict": (30, 60)}
        ip = request.client.host if request.client else "unknown"
        limit, window = limits[prefix]
        if not rate_limiter.allow(f"{prefix}:{ip}", limit, window):
            return Response("rate limit exceeded", status_code=429, media_type="text/plain", headers={"Retry-After": str(window)})

    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Cache-Control"] = "no-store" if path.startswith(("/auth/", "/history", "/admin/")) else response.headers.get("Cache-Control", "no-cache")
    if request.url.scheme == "https" or _truthy(os.environ.get("WIT_ENABLE_HSTS")):
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-CSRF-Token"],
)


@app.get("/health", response_model=HealthResponse)
def health():
    return {"status": "ok", "available_modules": list(detectors.keys())}


@app.get("/modules", response_model=List[ModuleInfo])
def list_modules():
    return [
        {"name": name, "class_names": config.class_names, "available": name in detectors}
        for name, config in MODULES.items()
    ]


@app.get("/history", response_model=ScanHistoryResponse)
def history(
    request: Request,
    search: str = "",
    module: str = "",
    status: str = "",
    date: str = "",
    sort: str = "latest",
    page: int = 1,
    page_size: int = 12,
):
    user = optional_user(request)
    user_id = None if user and user["role"] == "admin" else int(user["id"]) if user else None
    result = list_scans(
        search=search,
        module=module,
        status=status,
        date=date,
        sort=sort,
        page=page,
        page_size=page_size,
        user_id=user_id,
    )
    result["items"] = [_redact_public_record(item, user) for item in result["items"]]
    return result


@app.get("/history/{scan_id}", response_model=ScanHistoryDetail)
def history_detail(scan_id: str, request: Request):
    user = optional_user(request)
    user_id = None if user and user["role"] == "admin" else int(user["id"]) if user else None
    record = get_scan(scan_id, user_id=user_id)
    if not record:
        raise HTTPException(status_code=404, detail="scan not found")
    return _redact_public_record(record, user)


@app.get("/history/{scan_id}/report")
def history_report(scan_id: str, request: Request):
    user = optional_user(request)
    user_id = None if user and user["role"] == "admin" else int(user["id"]) if user else None
    record = get_scan(scan_id, user_id=user_id)
    if not record:
        raise HTTPException(status_code=404, detail="scan not found")
    if record["status"] != "Completed":
        raise HTTPException(status_code=409, detail="a report is only available for completed scans")
    record_audit(request, "report_downloaded", "scan", scan_id)
    record = _redact_public_record(record, user)
    filename = f"{record['module']}-{record['scan_id']}-report.pdf"
    return Response(
        content=build_history_pdf(record),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/auth/register", response_model=AuthUser, status_code=201)
def register(payload: AuthRegisterRequest, request: Request):
    first_account = user_count() == 0
    if not first_account and not _truthy(os.environ.get("WIT_ALLOW_REGISTRATION")):
        raise HTTPException(status_code=403, detail="self-registration is disabled")
    role = "admin" if first_account else "viewer"
    user = create_user(payload.email, payload.password, role)
    record_audit(request, "account_created", "user", str(user["id"]), {"role": role}, int(user["id"]))
    return user


@app.post("/auth/login")
def login(payload: AuthCredentials, request: Request, response: Response):
    try:
        user = authenticate(payload.email, payload.password)
    except HTTPException:
        user = None
    if not user:
        record_audit(request, "login_failed", "auth", metadata={"email": payload.email[:100]})
        raise HTTPException(status_code=401, detail="invalid email or password")
    access, refresh, csrf = issue_session(user, request)
    _set_session_cookies(response, access, refresh, csrf)
    record_audit(request, "login_succeeded", "user", str(user["id"]), user_id=int(user["id"]))
    return {"user": user, "expires_in": 30 * 60}


@app.post("/auth/refresh")
def refresh(request: Request, response: Response, _: None = Depends(require_csrf)):
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=401, detail="refresh session not found")
    rotated = rotate_session(refresh_token, request)
    if not rotated:
        _clear_session_cookies(response)
        raise HTTPException(status_code=401, detail="refresh session expired")
    user, access, new_refresh, csrf = rotated
    _set_session_cookies(response, access, new_refresh, csrf)
    record_audit(request, "session_refreshed", "session", user_id=int(user["id"]))
    return {"user": user, "expires_in": 30 * 60}


@app.post("/auth/logout")
def logout(request: Request, response: Response, _: None = Depends(require_csrf)):
    user = optional_user(request)
    revoke_session(request.cookies.get("refresh_token"))
    _clear_session_cookies(response)
    if user:
        record_audit(request, "logout", "user", str(user["id"]), user_id=int(user["id"]))
    return {"ok": True}


@app.get("/auth/me", response_model=AuthUser)
def me(request: Request):
    return current_user(request)


@app.get("/admin/analytics")
def admin_analytics(_: dict[str, Any] = Depends(require_roles("admin"))):
    return analytics()


@app.get("/admin/history", response_model=ScanHistoryResponse)
def admin_history(
    search: str = "", module: str = "", status: str = "", date: str = "",
    sort: str = "latest", page: int = 1, page_size: int = 20,
    _: dict[str, Any] = Depends(require_roles("admin")),
):
    return list_scans(search=search, module=module, status=status, date=date, sort=sort, page=page, page_size=page_size)


@app.delete("/admin/history/{scan_id}", status_code=204)
def admin_delete_history(
    scan_id: str,
    request: Request,
    _: None = Depends(require_csrf),
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    record = get_scan(scan_id)
    if not record:
        raise HTTPException(status_code=404, detail="scan not found")
    if not delete_scan(scan_id):
        raise HTTPException(status_code=404, detail="scan not found")
    record_audit(
        request,
        "scan_deleted",
        "scan",
        scan_id,
        metadata={"module": record["module"], "status": record["status"]},
        user_id=int(user["id"]),
    )
    return Response(status_code=204)


@app.post("/admin/users", response_model=AuthUser, status_code=201)
def admin_create_user(
    payload: AdminUserCreate,
    request: Request,
    _: None = Depends(require_csrf),
    admin: dict[str, Any] = Depends(require_roles("admin")),
):
    user = create_user(payload.email, payload.password, payload.role)
    record_audit(
        request,
        "account_created",
        "user",
        str(user["id"]),
        metadata={"role": user["role"], "created_by_admin": True},
        user_id=int(admin["id"]),
    )
    return user


@app.get("/admin/audit-logs")
def admin_audit_logs(limit: int = 100, offset: int = 0, _: dict[str, Any] = Depends(require_roles("admin"))):
    return {"items": list_audit_logs(limit, offset), "limit": min(200, max(1, limit)), "offset": max(0, offset)}


@app.get("/admin/system-health")
def admin_system_health(_: dict[str, Any] = Depends(require_roles("admin"))):
    db_path = Path(os.environ.get("WIT_HISTORY_DB_PATH", Path(__file__).resolve().parent.parent / "data" / "scan_history.db"))
    return {
        "status": "ok",
        "backend": "online",
        "available_modules": list(detectors.keys()),
        "database": {"path_configured": True, "exists": db_path.exists()},
        "security": {
            "cors_configured": bool(_allowed_origins()),
            "secure_cookies": COOKIE_SECURE,
            "field_encryption_enabled": bool(os.environ.get("WIT_FIELD_ENCRYPTION_KEY")),
            "rate_limiting": "process-local",
            "https_ready": True,
        },
    }


@app.get("/admin/settings", response_model=AdminSettings)
def admin_settings(_: dict[str, Any] = Depends(require_roles("admin"))):
    require_auth = get_setting("require_auth_for_predictions", "true" if _truthy(os.environ.get("WIT_REQUIRE_AUTH")) else "false")
    return {
        "require_auth_for_predictions": require_auth == "true",
        "allowed_origins": _allowed_origins(),
        "cookie_secure": COOKIE_SECURE,
        "field_encryption_enabled": bool(os.environ.get("WIT_FIELD_ENCRYPTION_KEY")),
        "rate_limit_mode": "process-local; use a shared gateway or Redis for multi-worker deployment",
    }


@app.patch("/admin/settings", response_model=AdminSettings)
def update_admin_settings(
    payload: AdminSettingsUpdate,
    request: Request,
    _: None = Depends(require_csrf),
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    if payload.require_auth_for_predictions is not None:
        set_setting("require_auth_for_predictions", "true" if payload.require_auth_for_predictions else "false")
    record_audit(request, "settings_updated", "system_settings", metadata=payload.model_dump(), user_id=int(user["id"]))
    return admin_settings(user)


@app.post("/chat")
def chat(req: ChatRequest, request: Request):
    if not os.environ.get("GEMINI_API_KEY") or gemini_client is None:
        return {"reply": "Chatbot isn't configured yet - add GEMINI_API_KEY to .env and restart the backend.", "navigate": None}
    contents = [
        {"role": ("model" if m.role == "assistant" else "user"), "parts": [{"text": m.content}]}
        for m in req.messages[-20:]
    ]
    try:
        response = gemini_client.models.generate_content(
            model=CHAT_MODEL,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                max_output_tokens=120,
                temperature=0.2,
                thinking_config=types.ThinkingConfig(thinking_level="MINIMAL"),
                tools=[types.Tool(function_declarations=[NAVIGATE_FUNCTION])],
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            ),
        )
    except Exception:
        LOGGER.exception("chat provider request failed")
        record_audit(request, "chat_provider_failed", "assistant")
        return {"reply": "The assistant is temporarily unavailable. Please try again shortly.", "navigate": None}
    reply_text = response.text or ""
    navigate_page = None
    if response.function_calls:
        for call in response.function_calls:
            if call.name == "navigate_to_page":
                navigate_page = call.args.get("page")
    if not reply_text and navigate_page:
        reply_text = f"Taking you to the {navigate_page} page."
    return {"reply": reply_text, "navigate": navigate_page}


@app.post("/predict/{module}", response_model=PredictionResponse)
async def predict(
    module: str,
    request: Request,
    file: UploadFile = File(...),
    patient_name: str | None = Form(None),
    patient_age: str | None = Form(None),
    patient_gender: str | None = Form(None),
    patient_sample_id: str | None = Form(None),
    patient_date: str | None = Form(None),
):
    if module not in MODULES:
        raise HTTPException(status_code=404, detail=f"unknown module: {module}")
    user = optional_user(request)
    configured_require_auth = get_setting("require_auth_for_predictions", "true" if _truthy(os.environ.get("WIT_REQUIRE_AUTH")) else "false") == "true"
    if configured_require_auth and not user:
        raise HTTPException(status_code=401, detail="authentication required for analysis")
    detector = detectors.get(module)
    model_version = f"{MODULES[module].backbone}-{MODULES[module].img_size}"
    scan_id = create_scan(
        module, file.filename or "", model_version,
        user_id=int(user["id"]) if user else None,
        patient_name=patient_name, patient_age=patient_age, patient_gender=patient_gender,
        patient_sample_id=patient_sample_id, patient_date=patient_date,
    )
    try:
        if detector is None:
            raise HTTPException(status_code=503, detail=f"model for '{module}' is not trained/loaded yet")
        if not file.content_type or not file.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="file must be an image")

        image_bytes = await file.read()
        thumbnail = make_thumbnail_data_url(image_bytes)
        result = detector.predict(image_bytes)
        update_scan(
            scan_id,
            status="Completed",
            predicted_class=result["predicted_class"],
            confidence=result["confidence"],
            thumbnail_data_url=thumbnail,
            class_probabilities=result.get("class_probabilities"),
            gradcam_data_url="data:image/png;base64," + result["gradcam_image_base64"]
            if result.get("gradcam_image_base64") and len(result["gradcam_image_base64"]) <= 4_000_000 else None,
        )
        record_audit(request, "scan_completed", "scan", scan_id, {"module": module, "prediction": result["predicted_class"]})
        return {"module": module, "scan_id": scan_id, **result}
    except HTTPException as exc:
        update_scan(scan_id, status="Failed", error_message=str(exc.detail))
        record_audit(request, "scan_failed", "scan", scan_id, {"module": module, "error": str(exc.detail)[:300]})
        raise
    except Exception as exc:
        update_scan(scan_id, status="Failed", error_message=str(exc)[:500])
        record_audit(request, "scan_failed", "scan", scan_id, {"module": module, "error": str(exc)[:300]})
        raise
