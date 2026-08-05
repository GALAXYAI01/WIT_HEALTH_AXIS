# WIT Research & Analysis

WIT Research & Analysis is an institutional research and education platform for AI-assisted microscopy image analysis. It combines disease-specific deep learning models with Grad-CAM visualizations so each result includes both a prediction and the image regions that influenced the model.

> **Research and education prototype:** This system is not a validated clinical diagnostic tool. It must not be used to make medical decisions. Clinical deployment would require independent validation, regulatory review, privacy controls, and testing on representative laboratory data.

## Capabilities

- Malaria screening with `Parasitized` and `Uninfected` classes.
- Leukemia ALL screening with `Benign`, `Early`, `Pre`, and `Pro` classes.
- Histopathology screening with `Benign` and `Malignant` classes.
- Grad-CAM overlays and class probability breakdowns for every successful prediction.
- Research-oriented frontend with image upload, preview, analysis tabs, patient protocol fields, and downloadable reports.
- Persistent scan history with search, filtering, details, thumbnails, and report downloads.
- Admin dashboard with analytics, system health, audit logs, settings, scan deletion, and user management.
- JWT access tokens, bcrypt password hashing, refresh sessions, role-based access control, CSRF checks, secure headers, CORS configuration, input validation, and optional encrypted patient fields.
- WIT Research Assistant with concise platform guidance, disease education, suggested actions, and page navigation.

## Architecture

```text
backend/
  main.py       FastAPI routes, authentication, prediction, history, chat, admin APIs
  inference.py  Model loading, inference, probabilities, and Grad-CAM generation
  history.py    SQLite persistence, thumbnails, encryption hooks, analytics
  security.py   bcrypt, JWT, sessions, CSRF, RBAC, rate limiting, audit logs
  reports.py    Dependency-light PDF report generation
  schemas.py    Pydantic request and response models
src/
  config.py     Disease modules, classes, data paths, and model configuration
  data/         Dataset loaders and preprocessing
  models/       Transfer-learning architectures and Grad-CAM support
  training/     Training loops and metrics
UI/
  stitch_wit_research_and_analysis/
                Static research interface, authentication, admin, history, and shared scripts
notebooks/      Reproducible training notebooks
scripts/        Training, dataset, weight verification, and pipeline utilities
model_weights/ Trained weights supplied separately and ignored by Git
data/           Datasets and the local scan database, ignored by Git
```

## Requirements

- Python 3.10 or newer.
- Node.js 18 or newer for the frontend verification scripts.
- A CPU or CUDA-compatible environment for inference. Training requires a suitable GPU for practical runtimes.
- Trained model weights in `model_weights/`. The repository intentionally does not include large `.pt` files or datasets.

## Local Setup

### 1. Create the Python environment

PowerShell:

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Install the JavaScript test dependencies:

```powershell
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env` and set values for the environment. Never commit `.env`, API keys, private keys, or certificates.

Important settings include:

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Enables the WIT Research Assistant. |
| `WIT_JWT_SECRET` | Stable high-entropy secret for access tokens. |
| `WIT_ALLOWED_ORIGINS` | Comma-separated frontend origins allowed by CORS. |
| `WIT_COOKIE_SECURE` | Set `true` when the application is served over HTTPS. |
| `WIT_REQUIRE_AUTH` | Optional prediction gate; Render keeps public research analysis open while admin routes remain protected. |
| `WIT_FIELD_ENCRYPTION_KEY` | Optional Fernet key for sensitive patient fields. |
| `WIT_HISTORY_DB_PATH` | Optional path for the SQLite history database. |
| `WIT_ADMIN_EMAIL` / `WIT_ADMIN_PASSWORD` | Optional first-admin bootstrap values. |

Generate local TLS material with `gen_cert.py` only for development. Production TLS should terminate at the deployment platform or a trusted reverse proxy.

### 3. Add model weights and datasets

Place the independently verified model files in `model_weights/`:

```text
model_weights/
  malaria_best.pt
  leukemia_best.pt
  histopathology_best.pt
```

Download datasets separately using Kaggle or another approved source. Dataset paths are configured in `src/config.py` and are intentionally excluded from version control.

### 4. Start the backend

```powershell
.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

### 5. Start the research interface

In a second terminal:

```powershell
.venv\Scripts\python.exe -m http.server 5500 --directory UI\stitch_wit_research_and_analysis
```

Open [http://127.0.0.1:5500/](http://127.0.0.1:5500/). The root entry opens the research dashboard. Admin access is available through the credentialed Admin access button.

## API Surface

Public research routes:

- `GET /health`
- `GET /modules`
- `POST /predict/{module}`
- `GET /history`
- `GET /history/{scan_id}`
- `GET /history/{scan_id}/report`
- `POST /chat`

Authentication and administration routes:

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /admin/analytics`
- `GET /admin/history`
- `DELETE /admin/history/{scan_id}`
- `POST /admin/users`
- `GET /admin/audit-logs`
- `GET/PATCH /admin/settings`
- `GET /admin/system-health`

State-changing authenticated requests require the CSRF token issued with the session. Administrative routes require the `admin` role.

## Verification

Run the focused checks from the project root:

```powershell
.venv\Scripts\python.exe scan_history_test.py
.venv\Scripts\python.exe v2_backend_test.py
node frontend_tabs_test.cjs
node pdf_report_test.cjs
node pdf_report_pages_test.cjs
node pdf_report_redesign_test.cjs
```

The test suite covers repository persistence, successful and failed scan records, authentication, RBAC, bcrypt login, session revocation, CSRF protection, admin user creation, admin history deletion, PDF generation, corrupted-image fallback behavior, result tabs, and all three detector pages.

## Render Deployment

`render.yaml` defines one Python web service that serves the FastAPI API and the existing UI from the same origin. This keeps the frontend API calls and authentication cookies same-origin in production.

The service needs these Render environment values before first use:

- `GEMINI_API_KEY`: Gemini key for the research assistant.
- `WIT_FIELD_ENCRYPTION_KEY`: a Fernet-compatible key for encrypted sensitive fields.
- `WIT_JWT_SECRET`: generated by the Blueprint, or supplied as a strong secret.

The three model weights are versioned in `model_weights/` because the inference service needs them to serve predictions. Models are loaded lazily, one module at a time, to keep the free Render instance within its memory limit. Render's free filesystem is ephemeral, so scan history in the Blueprint's `/tmp` database is suitable for a demo only. Use a paid persistent disk mounted at `/var/data` with `WIT_HISTORY_DB_PATH=/var/data/wit-scan-history.db`, or migrate the history layer to managed Postgres, before relying on history as an audit record.

For multi-worker production deployments, move rate limiting to a shared gateway or Redis-backed service. The built-in limiter is process-local and intended as a defensive development fallback.

## Training

Training notebooks and the shared training pipeline are included for reproducibility. Datasets remain local and are not committed, while the three verified inference weights are included under `model_weights/` so the Render service can load them at startup. Use the dataset-specific notebooks in `notebooks/` or `scripts/train.py`, then verify replacement weights with `scripts/verify_weights.py` before serving them.

## Responsible Use

This platform is designed for institutional research, education, and engineering validation. Predictions are model outputs, not diagnoses. Do not upload identifiable patient data to an unapproved environment, and do not use the system as a substitute for qualified medical review.

## License

No license has been declared yet. Add an appropriate license before accepting external contributions or redistributing the project.
