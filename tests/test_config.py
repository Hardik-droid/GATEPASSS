import pytest


def test_short_signing_key_rejected(monkeypatch):
    monkeypatch.setenv("GATEPASS_QR_SIGNING_KEY", "too-short")
    monkeypatch.setenv("SCANNER_DATABASE_URL", "postgresql+psycopg://x/y")
    from backend.config import load_settings

    with pytest.raises(RuntimeError, match="32 characters"):
        load_settings()


def test_missing_signing_key_rejected(monkeypatch):
    monkeypatch.delenv("GATEPASS_QR_SIGNING_KEY", raising=False)
    monkeypatch.setenv("SCANNER_DATABASE_URL", "postgresql+psycopg://x/y")
    from backend.config import load_settings

    with pytest.raises(RuntimeError, match="32 characters"):
        load_settings()


def test_valid_settings_load(monkeypatch):
    monkeypatch.setenv("GATEPASS_QR_SIGNING_KEY", "a" * 32)
    monkeypatch.setenv("SCANNER_DATABASE_URL", "postgresql+psycopg://x/y")
    monkeypatch.setenv("GATEPASS_ADMIN_EMAILS", "Admin@Example.com, second@example.com")
    from backend.config import load_settings

    settings = load_settings()
    assert settings.qr_signing_key == "a" * 32
    assert settings.scanner_session_hours == 12
    assert settings.admin_emails == {"admin@example.com", "second@example.com"}


def test_production_requires_neon_auth_audience(monkeypatch):
    monkeypatch.setenv("GATEPASS_QR_SIGNING_KEY", "a" * 32)
    monkeypatch.setenv("SCANNER_DATABASE_URL", "postgresql+psycopg://x/y")
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("NEON_AUTH_AUDIENCE", raising=False)
    from backend.config import load_settings

    with pytest.raises(RuntimeError, match="NEON_AUTH_AUDIENCE is mandatory"):
        load_settings()


def test_production_with_audience_loads(monkeypatch):
    monkeypatch.setenv("GATEPASS_QR_SIGNING_KEY", "a" * 32)
    monkeypatch.setenv("SCANNER_DATABASE_URL", "postgresql+psycopg://x/y")
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("NEON_AUTH_AUDIENCE", "gatepass-app")
    from backend.config import load_settings

    settings = load_settings()
    assert settings.app_env == "production"
    assert settings.neon_auth_audience == "gatepass-app"


def test_development_allows_missing_audience(monkeypatch):
    monkeypatch.setenv("GATEPASS_QR_SIGNING_KEY", "a" * 32)
    monkeypatch.setenv("SCANNER_DATABASE_URL", "postgresql+psycopg://x/y")
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.delenv("NEON_AUTH_AUDIENCE", raising=False)
    from backend.config import load_settings

    settings = load_settings()
    assert settings.app_env == "development"
    assert settings.neon_auth_audience == ""