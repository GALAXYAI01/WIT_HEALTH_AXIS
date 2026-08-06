from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class PredictionResponse(BaseModel):
    module: str
    scan_id: Optional[str] = None
    predicted_class: str
    confidence: float
    class_probabilities: Dict[str, float]
    gradcam_image_base64: str
    gradcam_available: bool = True
    gradcam_message: Optional[str] = None


class ModuleInfo(BaseModel):
    name: str
    class_names: List[str]
    available: bool


class HealthResponse(BaseModel):
    status: str
    available_modules: List[str]
    assistant_configured: bool
    assistant_model: str
    release: str
    inference_mode: str


class ScanHistoryItem(BaseModel):
    scan_id: str
    module: str
    predicted_class: Optional[str] = None
    confidence: Optional[float] = None
    status: str
    created_at: str
    image_name: Optional[str] = None
    thumbnail_data_url: Optional[str] = None
    model_version: Optional[str] = None
    user_id: Optional[int] = None
    patient_name: Optional[str] = None
    patient_age: Optional[str] = None
    patient_gender: Optional[str] = None
    patient_sample_id: Optional[str] = None
    patient_date: Optional[str] = None
    class_probabilities: Dict[str, float] = {}


class ScanHistorySummary(BaseModel):
    total_scans: int
    diseases_analyzed: int
    todays_scans: int


class ScanHistoryResponse(BaseModel):
    items: List[ScanHistoryItem]
    total: int
    page: int
    page_size: int
    total_pages: int
    summary: ScanHistorySummary


class ScanHistoryDetail(ScanHistoryItem):
    error_message: Optional[str] = None
    gradcam_data_url: Optional[str] = None


class AuthCredentials(BaseModel):
    email: str
    password: str


class AuthRegisterRequest(AuthCredentials):
    role: str = "viewer"


class AdminUserCreate(AuthCredentials):
    role: str = "admin"


class AuthUser(BaseModel):
    id: int
    email: str
    role: str
    is_active: bool
    created_at: str
    last_login_at: Optional[str] = None


class ChatResponse(BaseModel):
    reply: str
    navigate: Optional[str] = None


class AdminSettings(BaseModel):
    require_auth_for_predictions: bool
    allowed_origins: List[str]
    cookie_secure: bool
    field_encryption_enabled: bool
    rate_limit_mode: str


class AdminSettingsUpdate(BaseModel):
    require_auth_for_predictions: Optional[bool] = None


class AnalyticsResponse(BaseModel):
    total_scans: int
    completed_scans: int
    failed_scans: int
    average_confidence: float
    by_module: List[Dict[str, Any]]
    daily_scans: List[Dict[str, Any]]
