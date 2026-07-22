from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from backend.config import settings
from backend.db import engine
from backend.qr_routes import router as qr_router

app = FastAPI(title="GatePass Scanner")

_allowed_origins = sorted(
    {
        settings.public_app_url,
        "http://localhost:5173",
        "http://localhost:5175",
        "http://127.0.0.1:5173",
        "https://gatepasss.vercel.app",
    }
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    # Dev convenience: accept any localhost/127.0.0.1 port. Production is pinned
    # to the explicit origins above.
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
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
    checks["neon_auth_configured"] = bool(settings.neon_auth_url)
    # Audience is only mandatory in staging/production (load_settings enforces it).
    checks["audience_configured"] = (
        settings.app_env not in {"staging", "production"} or bool(settings.neon_auth_audience)
    )
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "error"
    is_ready = (
        checks["database"] == "ok"
        and checks["neon_auth_configured"]
        and checks["audience_configured"]
    )
    return {"ready": is_ready, "checks": checks}
