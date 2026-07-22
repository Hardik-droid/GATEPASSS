import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


@dataclass(frozen=True)
class Settings:
    qr_signing_key: str
    public_app_url: str
    scanner_session_hours: int
    scanner_pairing_minutes: int
    app_env: str
    neon_auth_url: str
    neon_auth_audience: str
    admin_emails: frozenset[str]
    scanner_database_url: str
    scanner_migrations_database_url: str
    legacy_import_database_url: str


def _require(name: str) -> str:
    value = os.environ.get(name, "")
    if not value:
        raise RuntimeError(f"{name} must be set")
    return value


def load_settings() -> Settings:
    signing_key = os.environ.get("GATEPASS_QR_SIGNING_KEY", "")
    if len(signing_key) < 32:
        raise RuntimeError(
            "GATEPASS_QR_SIGNING_KEY must be set and at least 32 characters long"
        )
    admin_emails = frozenset(
        email.strip().lower()
        for email in os.environ.get("GATEPASS_ADMIN_EMAILS", "").split(",")
        if email.strip()
    )
    neon_auth_url = os.environ.get(
        "NEON_AUTH_URL",
        os.environ.get(
            "VITE_NEON_AUTH_URL",
            "https://ep-wild-mud-au7ksl38.neonauth.c-10.us-east-1.aws.neon.tech/neondb/auth",
        ),
    )
    app_env = os.environ.get("APP_ENV", os.environ.get("NODE_ENV", "development")).lower()
    neon_auth_audience = os.environ.get("NEON_AUTH_AUDIENCE", "")
    # Production/staging must verify JWT audience; fail closed at startup if missing.
    if app_env in {"staging", "production"} and not neon_auth_audience:
        raise RuntimeError(
            "NEON_AUTH_AUDIENCE is mandatory when APP_ENV is staging or production "
            "(production JWT verification must not skip the audience check)"
        )
    return Settings(
        qr_signing_key=signing_key,
        public_app_url=os.environ.get("GATEPASS_PUBLIC_APP_URL", "http://localhost:5173"),
        scanner_session_hours=int(os.environ.get("GATEPASS_SCANNER_SESSION_HOURS", "12")),
        scanner_pairing_minutes=int(os.environ.get("GATEPASS_SCANNER_PAIRING_MINUTES", "10")),
        app_env=app_env,
        neon_auth_url=neon_auth_url,
        neon_auth_audience=neon_auth_audience,
        admin_emails=admin_emails,
        scanner_database_url=_require("SCANNER_DATABASE_URL"),
        scanner_migrations_database_url=os.environ.get("SCANNER_MIGRATIONS_DATABASE_URL", ""),
        legacy_import_database_url=os.environ.get("LEGACY_IMPORT_DATABASE_URL", ""),
    )


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = load_settings()
    return _settings


def __getattr__(name: str):
    if name == "settings":
        return get_settings()
    raise AttributeError(name)