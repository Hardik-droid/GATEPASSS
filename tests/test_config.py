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