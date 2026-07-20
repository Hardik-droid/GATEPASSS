from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from backend.config import settings
from backend.db import engine
from backend.qr_routes import router as qr_router

app = FastAPI(title="GatePass Scanner")

_allowed_origins = [
    settings.public_app_url,
    "http://localhost:5173",
    "http://localhost:5175",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(set(_allowed_origins)),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(qr_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready")
def ready() -> dict[str, object]:
    checks: dict[str, object] = {}
    google_ready = bool(settings.google_client_id) and not settings.google_client_id.startswith(
        "REPLACE_"
    )
    checks["google_client_id_configured"] = google_ready
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "error"
    ready = checks["database"] == "ok" and google_ready
    return {"ready": ready, "checks": checks}
