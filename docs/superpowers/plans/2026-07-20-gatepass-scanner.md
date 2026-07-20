# GatePass Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the GatePass Scanner feature per `docs/superpowers/specs/2026-07-20-gatepass-scanner-design.md`: a standalone FastAPI service with its own `scanner` Postgres schema on the same Neon database, a permanent opaque per-user QR credential, locked-down paired scanner devices, and four scan purposes (ticket validation, identity, attendance, access control).

**Architecture:** New Python package `backend/` (FastAPI + SQLAlchemy 2.0 + Alembic + psycopg v3), all already installed in `.venv` — zero new pip installs. Frontend gets `src/features/scanner/` plus two new routes wired into the existing `react-router-dom` `<Routes>` in `src/App.tsx`. One new npm dependency: `@zxing/browser`.

**Tech Stack:** FastAPI 0.139, SQLAlchemy 2.0.51, Alembic 1.18.5, psycopg 3.3.4, pydantic 2.13, PyJWT 2.13 (`PyJWKClient` for Google ID token verification — no `google-auth` dependency needed), qrcode 8.2 + pillow (PNG rendering), pytest 9.1. React 19 + react-router-dom 7 + `@zxing/browser` (new) + lucide-react (already installed, reuse for icons).

## Global Constraints

- Three separate Postgres roles/connection strings: `SCANNER_DATABASE_URL` (runtime, DML-only on `scanner.*`, zero `public.*` grants), `SCANNER_MIGRATIONS_DATABASE_URL` (Alembic DDL, `scanner` schema only), `LEGACY_IMPORT_DATABASE_URL` (read `public.*`, write `scanner.*`). Role/grant creation is a one-time manual SQL script, never run by the app.
- No foreign keys from `scanner.*` to `public.*`. Legacy IDs are plain text reference columns.
- Users are identified by verified Google `(issuer, sub)`, never email alone. ID token verification checks signature (via Google's JWKS through `PyJWKClient`), issuer, audience, expiration, and `email_verified`.
- Scanner-device auth (pairing code → session token) is fully separate from user auth (Google ID token). Never accept one where the other is expected.
- `GATEPASS_ADMIN_EMAILS` is consulted only after a Google ID token is fully verified.
- The scan endpoint is the sole authority for decisions; it never reads `public.*` at request time, and never trusts client-supplied purpose/event/gate — those come only from the authenticated scanner session.
- QR HMAC signs the canonical string `gp:v1:<public_id>` (not the bare `public_id`), verified with `hmac.compare_digest`. Scanner-session auth happens before any QR payload parsing.
- Multi-ticket scans lock and consume the earliest eligible ticket (`ORDER BY created_at ASC ... FOR UPDATE`), never an unordered `LIMIT 1`.
- Attendance uniqueness is enforced by `scanner.attendance_records` (`UNIQUE(user_id, event_id)`), not by `scan_logs`. Every attempt is still logged to `scan_logs`.
- Pairing codes and scanner session tokens are stored only as SHA-256 hashes; plaintext is returned exactly once.
- The legacy importer (`backend/import_legacy.py`) is a manual, idempotent CLI, never invoked automatically. It never fabricates a purchaser — unmatched attendees are skipped, not granted access.
- Existing app code is untouched except the two additive routes in `src/App.tsx` and one new script in `package.json`. The existing `/scanner` route (organizer-perspective ticket-scan simulation, `src/pages/Scanner.tsx`) is a different, unrelated feature — do not modify or remove it. The new scanner device app lives at `/gatepass-scanner` and `/gatepass-scanner/pair` to avoid colliding with it.

---

## Existing project facts (verified during planning — do not re-derive)

- `backend/` currently contains only `backend/__init__.py`-less empty dir (an earlier orphaned scaffold, `test_main.py` + `payment_service.py`, was deleted per user decision — it described an incompatible architecture and was never wired up).
- `.venv/Scripts/python.exe` (Python 3.13.7) already has: `fastapi 0.139.0`, `sqlalchemy 2.0.51`, `alembic 1.18.5`, `psycopg[binary] 3.3.4`, `pydantic 2.13.4`, `uvicorn 0.51.0`, `python-dotenv 1.2.2`, `PyJWT 2.13.0`, `qrcode 8.2`, `pillow 12.3.0`, `pytest 9.1.1`. Confirmed via `pip list` — no installs needed for the backend tasks below.
- Root `.env` has `DATABASE_URL` (Railway Postgres, used by the existing Node backend only) and `.env.example` documents `VITE_API_BASE_URL`, `VITE_GOOGLE_CLIENT_ID`. Both files exist; new vars are appended, existing ones untouched.
- `src/api.ts` shows the existing frontend fetch pattern: base URL from `import.meta.env.VITE_API_BASE_URL`, bearer token from `sessionStorage`. The new `src/features/scanner/api.ts` mirrors this pattern with its own base URL var and its own storage key.
- `src/App.tsx` already uses `react-router-dom` v7 (`<Routes>`/`<Route>`, `useNavigate`), with the `<Routes>` block at lines 1016–1107. The existing `/scanner` route (line 1094) renders `QRScannerSimulation` (`src/pages/Scanner.tsx`) — an unrelated in-app simulation for the organizer perspective, driven by local component state (`tickets`, `events`, `scanLogs`). It must not be touched.
- `db/postgres18_schema.sql` is the existing Node backend's schema (`public.events`, `public.tickets`, etc.) — read-only source for the legacy importer. Relevant columns: `events(id, title, description, event_type, venue, start_time, end_time, capacity, created_at)`; `tickets(id, event_id, order_id, category_name, price, attendee_name, attendee_phone, attendee_email, qr_token, status, issued_at, checked_in_at)`. `ticket_status` enum: `draft, available, reserved, paid, issued, checked_in, cancelled, refunded, expired`. Only `issued`/`checked_in` rows represent real, importable tickets; `cancelled`/`refunded`/`expired` import as cancelled entitlements (for an accurate historical record); `draft`/`available`/`reserved`/`paid` have no attendee yet and are skipped entirely.
- No existing frontend test framework — skipping automated frontend tests per plan scope; manual browser verification only (see Task 13).

---

## Task 1: Backend scaffold — config, entrypoint, requirements

**Files:**
- Create: `backend/__init__.py`
- Create: `backend/config.py`
- Create: `backend/main.py`
- Create: `backend/requirements.txt`
- Test: `tests/__init__.py`
- Test: `tests/test_config.py`

**Interfaces:**
- Produces: `backend.config.Settings` (dataclass), `backend.config.load_settings() -> Settings`, `backend.config.settings` (module-level singleton built from current env at import time). Later tasks import `from backend.config import settings`.
- Produces: `backend.main.app` (FastAPI instance) — later tasks call `app.include_router(...)` on it.

- [ ] **Step 1: Write the failing test**

`tests/__init__.py` (empty file, makes `tests` a package so `tests/conftest.py` in Task 3 can be imported by name):

```python
```

`tests/test_config.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv\Scripts\python.exe -m pytest tests/test_config.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'backend.config'` (or `'backend'`, since `backend/__init__.py` doesn't exist yet either — create it as an empty file first).

- [ ] **Step 3: Write minimal implementation**

`backend/__init__.py`:

```python
```

`backend/config.py`:

```python
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
    google_client_id: str
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
    return Settings(
        qr_signing_key=signing_key,
        public_app_url=os.environ.get("GATEPASS_PUBLIC_APP_URL", "http://localhost:5173"),
        scanner_session_hours=int(os.environ.get("GATEPASS_SCANNER_SESSION_HOURS", "12")),
        scanner_pairing_minutes=int(os.environ.get("GATEPASS_SCANNER_PAIRING_MINUTES", "10")),
        google_client_id=os.environ.get("GATEPASS_GOOGLE_CLIENT_ID", ""),
        admin_emails=admin_emails,
        scanner_database_url=_require("SCANNER_DATABASE_URL"),
        scanner_migrations_database_url=os.environ.get("SCANNER_MIGRATIONS_DATABASE_URL", ""),
        legacy_import_database_url=os.environ.get("LEGACY_IMPORT_DATABASE_URL", ""),
    )


settings = load_settings()
```

`backend/main.py`:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import settings

app = FastAPI(title="GatePass Scanner")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.public_app_url],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/scanner-health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

`backend/requirements.txt` (pinned to what's already installed in `.venv` — no installs needed, this file documents/reproduces the environment):

```
fastapi==0.139.0
uvicorn==0.51.0
sqlalchemy==2.0.51
alembic==1.18.5
psycopg[binary]==3.3.4
pydantic==2.13.4
python-dotenv==1.2.2
PyJWT==2.13.0
qrcode==8.2
pillow==12.3.0
pytest==9.1.1
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv\Scripts\python.exe -m pytest tests/test_config.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add backend/__init__.py backend/config.py backend/main.py backend/requirements.txt tests/__init__.py tests/test_config.py
git commit -m "feat(scanner): add backend scaffold with validated settings loader"
```

---

## Task 2: SQLAlchemy models for the `scanner` schema

**Files:**
- Create: `backend/db.py`
- Create: `backend/models.py`

**Interfaces:**
- Consumes: `backend.config.settings` (Task 1).
- Produces: `backend.db.Base` (declarative base, `metadata.schema = "scanner"`), `backend.db.engine`, `backend.db.SessionLocal`, `backend.db.get_db()` (FastAPI dependency yielding a `Session`). Produces: `backend.models.{User, Event, TicketEntitlement, TicketAssignment, TicketTransfer, AttendanceRecord, Resource, AccessGrant, QrCredential, Scanner, ScannerPairingCode, ScannerSession, ScanLog}` — every later task imports these exact class names.

This task has no isolated unit test of its own (there is no behavior yet, only schema declarations) — it is verified together with Task 3's migration via a real-database smoke test, per the "Task Right-Sizing" rule that setup steps fold into the task whose deliverable needs them. Do not skip ahead — write both tasks, then run Task 3's test.

- [ ] **Step 1: Write `backend/db.py`**

```python
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from backend.config import settings

engine = create_engine(settings.scanner_database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


Base.metadata.schema = "scanner"


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 2: Write `backend/models.py`**

```python
import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db import Base


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )


class User(Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("google_issuer", "google_subject"),)

    id: Mapped[uuid.UUID] = _uuid_pk()
    google_issuer: Mapped[str]
    google_subject: Mapped[str]
    email: Mapped[str]
    display_name: Mapped[str]
    photo_url: Mapped[str | None]
    status: Mapped[str] = mapped_column(server_default="active")
    created_at: Mapped[datetime] = mapped_column(server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(server_default=text("now()"))


class Event(Base):
    __tablename__ = "events"

    id: Mapped[uuid.UUID] = _uuid_pk()
    organization_name: Mapped[str]
    name: Mapped[str]
    starts_at: Mapped[datetime]
    ends_at: Mapped[datetime]
    venue: Mapped[str | None]
    status: Mapped[str] = mapped_column(server_default="active")
    legacy_event_id: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(server_default=text("now()"))


class Resource(Base):
    __tablename__ = "resources"

    id: Mapped[uuid.UUID] = _uuid_pk()
    organization_name: Mapped[str]
    name: Mapped[str]
    status: Mapped[str] = mapped_column(server_default="active")
    created_at: Mapped[datetime] = mapped_column(server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(server_default=text("now()"))


class TicketEntitlement(Base):
    __tablename__ = "ticket_entitlements"
    __table_args__ = (
        CheckConstraint("entry_count <= max_entries", name="ck_entry_within_max"),
        CheckConstraint(
            "(source_type = 'ADMIN_ISSUED' AND issued_by_admin_user_id IS NOT NULL "
            "AND purchased_by_user_id IS NULL) OR "
            "(source_type = 'LEGACY_IMPORT' AND purchased_by_user_id IS NOT NULL "
            "AND issued_by_admin_user_id IS NULL)",
            name="ck_ticket_source_provenance",
        ),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scanner.events.id"))
    purchased_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("scanner.users.id")
    )
    issued_by_admin_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("scanner.users.id")
    )
    source_type: Mapped[str]
    source_reference: Mapped[str | None]
    ticket_type: Mapped[str]
    status: Mapped[str] = mapped_column(server_default="active")
    valid_from: Mapped[datetime | None]
    valid_until: Mapped[datetime | None]
    max_entries: Mapped[int] = mapped_column(server_default=text("1"))
    entry_count: Mapped[int] = mapped_column(server_default=text("0"))
    legacy_ticket_id: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(server_default=text("now()"))


class TicketAssignment(Base):
    __tablename__ = "ticket_assignments"
    __table_args__ = (
        Index(
            "ix_one_active_assignment_per_ticket",
            "ticket_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    ticket_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scanner.ticket_entitlements.id"))
    assigned_to_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scanner.users.id"))
    status: Mapped[str] = mapped_column(server_default="active")
    assigned_at: Mapped[datetime] = mapped_column(server_default=text("now()"))
    ended_at: Mapped[datetime | None]
    transfer_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("scanner.ticket_transfers.id")
    )


class TicketTransfer(Base):
    __tablename__ = "ticket_transfers"
    __table_args__ = (
        Index(
            "ix_one_pending_transfer_per_ticket",
            "ticket_id",
            unique=True,
            postgresql_where=text("status = 'pending'"),
        ),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    ticket_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scanner.ticket_entitlements.id"))
    from_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scanner.users.id"))
    to_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("scanner.users.id"))
    to_email: Mapped[str]
    status: Mapped[str] = mapped_column(server_default="pending")
    expires_at: Mapped[datetime]
    accepted_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(server_default=text("now()"))


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"
    __table_args__ = (UniqueConstraint("user_id", "event_id"),)

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scanner.users.id"))
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scanner.events.id"))
    scanner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scanner.scanners.id"))
    marked_at: Mapped[datetime] = mapped_column(server_default=text("now()"))


class AccessGrant(Base):
    __tablename__ = "access_grants"
    __table_args__ = (
        Index(
            "ix_one_active_grant_per_resource_user",
            "resource_id",
            "user_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    resource_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scanner.resources.id"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scanner.users.id"))
    grant_type: Mapped[str]
    status: Mapped[str] = mapped_column(server_default="active")
    valid_from: Mapped[datetime | None]
    valid_until: Mapped[datetime | None]
    granted_by_admin_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("scanner.users.id")
    )
    created_at: Mapped[datetime] = mapped_column(server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(server_default=text("now()"))


class QrCredential(Base):
    __tablename__ = "qr_credentials"
    __table_args__ = (
        Index(
            "ix_one_active_qr_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scanner.users.id"))
    public_id: Mapped[str] = mapped_column(unique=True)
    status: Mapped[str] = mapped_column(server_default="active")
    created_at: Mapped[datetime] = mapped_column(server_default=text("now()"))
    revoked_at: Mapped[datetime | None]


class Scanner(Base):
    __tablename__ = "scanners"
    __table_args__ = (
        CheckConstraint(
            "(purpose = 'TICKET_VALIDATION' AND event_id IS NOT NULL AND resource_id IS NULL) OR "
            "(purpose = 'ATTENDANCE' AND event_id IS NOT NULL AND resource_id IS NULL) OR "
            "(purpose = 'ACCESS_CONTROL' AND resource_id IS NOT NULL AND event_id IS NULL) OR "
            "(purpose = 'IDENTITY_VERIFICATION' AND event_id IS NULL AND resource_id IS NULL)",
            name="ck_scanner_purpose_locator",
        ),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    name: Mapped[str]
    organization_name: Mapped[str]
    purpose: Mapped[str]
    event_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("scanner.events.id"))
    resource_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("scanner.resources.id"))
    gate_id: Mapped[str | None]
    status: Mapped[str] = mapped_column(server_default="active")
    created_at: Mapped[datetime] = mapped_column(server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(server_default=text("now()"))


class ScannerPairingCode(Base):
    __tablename__ = "scanner_pairing_codes"

    id: Mapped[uuid.UUID] = _uuid_pk()
    scanner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scanner.scanners.id"))
    code_hash: Mapped[str]
    expires_at: Mapped[datetime]
    used_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(server_default=text("now()"))


class ScannerSession(Base):
    __tablename__ = "scanner_sessions"

    id: Mapped[uuid.UUID] = _uuid_pk()
    scanner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scanner.scanners.id"))
    token_hash: Mapped[str]
    expires_at: Mapped[datetime]
    revoked_at: Mapped[datetime | None]
    last_seen_at: Mapped[datetime | None]
    device_name: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(server_default=text("now()"))


class ScanLog(Base):
    __tablename__ = "scan_logs"
    __table_args__ = (UniqueConstraint("scanner_id", "idempotency_key"),)

    id: Mapped[uuid.UUID] = _uuid_pk()
    scanner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scanner.scanners.id"))
    qr_credential_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("scanner.qr_credentials.id")
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("scanner.users.id"))
    ticket_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("scanner.ticket_entitlements.id")
    )
    resource_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("scanner.resources.id"))
    access_grant_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("scanner.access_grants.id")
    )
    purpose: Mapped[str]
    event_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("scanner.events.id"))
    gate_id: Mapped[str | None]
    decision: Mapped[str]
    reason: Mapped[str]
    idempotency_key: Mapped[str]
    scanned_at: Mapped[datetime] = mapped_column(server_default=text("now()"))
    metadata_json: Mapped[dict] = mapped_column("metadata", JSONB, server_default=text("'{}'"))
```

Note: SQLAlchemy's declarative `Base` reserves the attribute name `metadata` for its own class-level `MetaData` object, so the scan log's JSONB column is mapped as `metadata_json` in Python but stays named `metadata` in the actual `scan_logs` table (the `mapped_column("metadata", JSONB, ...)` first positional argument sets the real column name).

- [ ] **Step 3: Commit**

```bash
git add backend/db.py backend/models.py
git commit -m "feat(scanner): add SQLAlchemy models for the scanner schema"
```

## Task 3: Alembic migration, one-time role SQL, and test database wiring

**Files:**
- Create: `alembic.ini`
- Create: `alembic/env.py`
- Create: `alembic/script.py.mako`
- Create: `alembic/versions/0001_scanner_schema.py`
- Create: `sql/scanner_roles.sql`
- Create: `tests/conftest.py`
- Test: `tests/test_schema_smoke.py`

**Interfaces:**
- Consumes: `backend.db.Base`, `backend.models.*` (Task 2), `backend.config.settings` (Task 1).
- Produces: a running `scanner` schema in whatever database `SCANNER_DATABASE_URL` points to. Produces `tests/conftest.py` fixtures `db_session` (a `Session` from `backend.db.SessionLocal`, rolled back after each test), `make_user(suffix: str | None = None) -> User` (factory fixture — each call creates and flushes a distinct `scanner.users` row), and an autouse migration+cleanup fixture — every later test task relies on these three.

**Local test database:** these tests need a real local Postgres (partial unique indexes and multi-column `CHECK` constraints aren't testable on SQLite). Reuse whatever local Postgres the project already expects for dev (`.env.example` defaults to `PGHOST=127.0.0.1`). Before running tests, create one throwaway database once:

```bash
psql "postgresql://postgres:postgres@localhost:5432/postgres" -c "CREATE DATABASE gatepass_scanner_test"
```

If the local Postgres user/password differ, export `SCANNER_TEST_DATABASE_URL` accordingly before running pytest.

- [ ] **Step 1: Write the failing test**

`tests/test_schema_smoke.py`:

```python
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.exc import IntegrityError

from backend.models import Event, QrCredential, Scanner, TicketEntitlement, User


def _make_user(db_session, suffix: str) -> User:
    user = User(
        google_issuer="https://accounts.google.com",
        google_subject=f"sub-{suffix}",
        email=f"user-{suffix}@example.com",
        display_name=f"User {suffix}",
    )
    db_session.add(user)
    db_session.flush()
    return user


def test_only_one_active_qr_credential_per_user(db_session):
    user = _make_user(db_session, "qr")
    db_session.add(QrCredential(user_id=user.id, public_id="pub-1"))
    db_session.flush()
    db_session.add(QrCredential(user_id=user.id, public_id="pub-2"))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_ticket_entitlement_requires_matching_provenance(db_session):
    user = _make_user(db_session, "ticket")
    event = Event(
        organization_name="Org",
        name="Event",
        starts_at=datetime.now(timezone.utc),
        ends_at=datetime.now(timezone.utc) + timedelta(hours=2),
    )
    db_session.add(event)
    db_session.flush()
    bad = TicketEntitlement(
        event_id=event.id,
        purchased_by_user_id=user.id,
        issued_by_admin_user_id=user.id,  # invalid: both set
        source_type="ADMIN_ISSUED",
        ticket_type="GA",
        max_entries=1,
    )
    db_session.add(bad)
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_scanner_purpose_requires_matching_locator(db_session):
    with pytest.raises(IntegrityError):
        db_session.add(
            Scanner(
                name="Bad Scanner",
                organization_name="Org",
                purpose="ACCESS_CONTROL",
                event_id=uuid.uuid4(),  # invalid: ACCESS_CONTROL must use resource_id
            )
        )
        db_session.flush()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv\Scripts\python.exe -m pytest tests/test_schema_smoke.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'alembic.env'`-style collection error (no `conftest.py` yet, no migration applied, no `scanner` schema).

- [ ] **Step 3: Write minimal implementation**

`alembic.ini`:

```ini
[alembic]
script_location = alembic
prepend_sys_path = .
version_path_separator = os

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARN
handlers = console
qualname =

[logger_sqlalchemy]
level = WARN
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
```

`alembic/script.py.mako` (Alembic's stock template, needed for future `alembic revision` calls):

```mako
"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}

"""
from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

# revision identifiers, used by Alembic.
revision = ${repr(up_revision)}
down_revision = ${repr(down_revision)}
branch_labels = ${repr(branch_labels)}
depends_on = ${repr(depends_on)}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}
```

`alembic/env.py`:

```python
import os
import sys
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend import models  # noqa: F401  (registers tables on Base.metadata)
from backend.db import Base

config = context.config
db_url = os.environ.get("SCANNER_MIGRATIONS_DATABASE_URL") or os.environ.get(
    "SCANNER_DATABASE_URL"
)
if not db_url:
    raise RuntimeError(
        "SCANNER_MIGRATIONS_DATABASE_URL (or SCANNER_DATABASE_URL) must be set to run migrations"
    )
config.set_main_option("sqlalchemy.url", db_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=db_url,
        target_metadata=target_metadata,
        version_table_schema="scanner",
        include_schemas=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            version_table_schema="scanner",
            include_schemas=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

`alembic/versions/0001_scanner_schema.py` (first migration for this new package — `down_revision = None`):

```python
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001_scanner_schema"
down_revision = None
branch_labels = None
depends_on = None

_uuid_pk = lambda: sa.Column(  # noqa: E731
    "id",
    postgresql.UUID(as_uuid=True),
    primary_key=True,
    server_default=sa.text("gen_random_uuid()"),
)
_now = sa.text("now()")


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS scanner")

    op.create_table(
        "users",
        _uuid_pk(),
        sa.Column("google_issuer", sa.Text, nullable=False),
        sa.Column("google_subject", sa.Text, nullable=False),
        sa.Column("email", sa.Text, nullable=False),
        sa.Column("display_name", sa.Text, nullable=False),
        sa.Column("photo_url", sa.Text),
        sa.Column("status", sa.Text, nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        sa.UniqueConstraint("google_issuer", "google_subject"),
        schema="scanner",
    )

    op.create_table(
        "events",
        _uuid_pk(),
        sa.Column("organization_name", sa.Text, nullable=False),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("venue", sa.Text),
        sa.Column("status", sa.Text, nullable=False, server_default="active"),
        sa.Column("legacy_event_id", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        schema="scanner",
    )

    op.create_table(
        "resources",
        _uuid_pk(),
        sa.Column("organization_name", sa.Text, nullable=False),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("status", sa.Text, nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        schema="scanner",
    )

    op.create_table(
        "ticket_entitlements",
        _uuid_pk(),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.events.id"), nullable=False),
        sa.Column("purchased_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.users.id")),
        sa.Column("issued_by_admin_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.users.id")),
        sa.Column("source_type", sa.Text, nullable=False),
        sa.Column("source_reference", sa.Text),
        sa.Column("ticket_type", sa.Text, nullable=False),
        sa.Column("status", sa.Text, nullable=False, server_default="active"),
        sa.Column("valid_from", sa.DateTime(timezone=True)),
        sa.Column("valid_until", sa.DateTime(timezone=True)),
        sa.Column("max_entries", sa.Integer, nullable=False, server_default="1"),
        sa.Column("entry_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("legacy_ticket_id", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        sa.CheckConstraint("max_entries >= 1", name="ck_max_entries_positive"),
        sa.CheckConstraint("entry_count >= 0", name="ck_entry_count_nonneg"),
        sa.CheckConstraint("entry_count <= max_entries", name="ck_entry_within_max"),
        sa.CheckConstraint(
            "(source_type = 'ADMIN_ISSUED' AND issued_by_admin_user_id IS NOT NULL "
            "AND purchased_by_user_id IS NULL) OR "
            "(source_type = 'LEGACY_IMPORT' AND purchased_by_user_id IS NOT NULL "
            "AND issued_by_admin_user_id IS NULL)",
            name="ck_ticket_source_provenance",
        ),
        schema="scanner",
    )

    op.create_table(
        "ticket_transfers",
        _uuid_pk(),
        sa.Column("ticket_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.ticket_entitlements.id"), nullable=False),
        sa.Column("from_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.users.id"), nullable=False),
        sa.Column("to_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.users.id")),
        sa.Column("to_email", sa.Text, nullable=False),
        sa.Column("status", sa.Text, nullable=False, server_default="pending"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        schema="scanner",
    )
    op.create_index(
        "ix_one_pending_transfer_per_ticket",
        "ticket_transfers",
        ["ticket_id"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
        schema="scanner",
    )

    op.create_table(
        "ticket_assignments",
        _uuid_pk(),
        sa.Column("ticket_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.ticket_entitlements.id"), nullable=False),
        sa.Column("assigned_to_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.users.id"), nullable=False),
        sa.Column("status", sa.Text, nullable=False, server_default="active"),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        sa.Column("ended_at", sa.DateTime(timezone=True)),
        sa.Column("transfer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.ticket_transfers.id")),
        schema="scanner",
    )
    op.create_index(
        "ix_one_active_assignment_per_ticket",
        "ticket_assignments",
        ["ticket_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
        schema="scanner",
    )

    op.create_table(
        "qr_credentials",
        _uuid_pk(),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.users.id"), nullable=False),
        sa.Column("public_id", sa.Text, nullable=False, unique=True),
        sa.Column("status", sa.Text, nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        schema="scanner",
    )
    op.create_index(
        "ix_one_active_qr_per_user",
        "qr_credentials",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
        schema="scanner",
    )

    op.create_table(
        "scanners",
        _uuid_pk(),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("organization_name", sa.Text, nullable=False),
        sa.Column("purpose", sa.Text, nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.events.id")),
        sa.Column("resource_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.resources.id")),
        sa.Column("gate_id", sa.Text),
        sa.Column("status", sa.Text, nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        sa.CheckConstraint(
            "(purpose = 'TICKET_VALIDATION' AND event_id IS NOT NULL AND resource_id IS NULL) OR "
            "(purpose = 'ATTENDANCE' AND event_id IS NOT NULL AND resource_id IS NULL) OR "
            "(purpose = 'ACCESS_CONTROL' AND resource_id IS NOT NULL AND event_id IS NULL) OR "
            "(purpose = 'IDENTITY_VERIFICATION' AND event_id IS NULL AND resource_id IS NULL)",
            name="ck_scanner_purpose_locator",
        ),
        schema="scanner",
    )

    op.create_table(
        "scanner_pairing_codes",
        _uuid_pk(),
        sa.Column("scanner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.scanners.id"), nullable=False),
        sa.Column("code_hash", sa.Text, nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        schema="scanner",
    )

    op.create_table(
        "scanner_sessions",
        _uuid_pk(),
        sa.Column("scanner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.scanners.id"), nullable=False),
        sa.Column("token_hash", sa.Text, nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("last_seen_at", sa.DateTime(timezone=True)),
        sa.Column("device_name", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        schema="scanner",
    )

    op.create_table(
        "attendance_records",
        _uuid_pk(),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.users.id"), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.events.id"), nullable=False),
        sa.Column("scanner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.scanners.id"), nullable=False),
        sa.Column("marked_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        sa.UniqueConstraint("user_id", "event_id"),
        schema="scanner",
    )

    op.create_table(
        "access_grants",
        _uuid_pk(),
        sa.Column("resource_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.resources.id"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.users.id"), nullable=False),
        sa.Column("grant_type", sa.Text, nullable=False),
        sa.Column("status", sa.Text, nullable=False, server_default="active"),
        sa.Column("valid_from", sa.DateTime(timezone=True)),
        sa.Column("valid_until", sa.DateTime(timezone=True)),
        sa.Column("granted_by_admin_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        schema="scanner",
    )
    op.create_index(
        "ix_one_active_grant_per_resource_user",
        "access_grants",
        ["resource_id", "user_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
        schema="scanner",
    )

    op.create_table(
        "scan_logs",
        _uuid_pk(),
        sa.Column("scanner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.scanners.id"), nullable=False),
        sa.Column("qr_credential_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.qr_credentials.id")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.users.id")),
        sa.Column("ticket_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.ticket_entitlements.id")),
        sa.Column("resource_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.resources.id")),
        sa.Column("access_grant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.access_grants.id")),
        sa.Column("purpose", sa.Text, nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.events.id")),
        sa.Column("gate_id", sa.Text),
        sa.Column("decision", sa.Text, nullable=False),
        sa.Column("reason", sa.Text, nullable=False),
        sa.Column("idempotency_key", sa.Text, nullable=False),
        sa.Column("scanned_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        sa.Column("metadata", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'")),
        sa.UniqueConstraint("scanner_id", "idempotency_key"),
        schema="scanner",
    )


def downgrade() -> None:
    for table in (
        "scan_logs",
        "access_grants",
        "attendance_records",
        "scanner_sessions",
        "scanner_pairing_codes",
        "scanners",
        "qr_credentials",
        "ticket_assignments",
        "ticket_transfers",
        "ticket_entitlements",
        "resources",
        "events",
        "users",
    ):
        op.drop_table(table, schema="scanner")
    op.execute("DROP SCHEMA IF EXISTS scanner CASCADE")
```

`sql/scanner_roles.sql` (one-time manual setup — run once by whoever holds the Neon superuser/owner connection, via the Neon SQL editor or `psql`; **replace every `CHANGE_ME_*` password before running, then store the real passwords only in the deployment secrets manager, never in git**):

```sql
-- One-time setup. Not run by the app, Alembic, or CI. Re-run is safe
-- (CREATE ROLE ... IF NOT EXISTS-style guards below), except passwords
-- must be changed from the placeholders first.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'gatepass_scanner_app') THEN
    CREATE ROLE gatepass_scanner_app LOGIN PASSWORD 'CHANGE_ME_APP_PASSWORD';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'gatepass_scanner_migrator') THEN
    CREATE ROLE gatepass_scanner_migrator LOGIN PASSWORD 'CHANGE_ME_MIGRATOR_PASSWORD';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'gatepass_legacy_importer') THEN
    CREATE ROLE gatepass_legacy_importer LOGIN PASSWORD 'CHANGE_ME_IMPORTER_PASSWORD';
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS scanner;

-- Migrator: owns the schema, so Alembic can create/alter/drop tables in it.
ALTER SCHEMA scanner OWNER TO gatepass_scanner_migrator;
GRANT CREATE, USAGE ON SCHEMA scanner TO gatepass_scanner_migrator;

-- Runtime app: DML only, scanner schema only, nothing on public.
GRANT USAGE ON SCHEMA scanner TO gatepass_scanner_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA scanner TO gatepass_scanner_app;
ALTER DEFAULT PRIVILEGES FOR ROLE gatepass_scanner_migrator IN SCHEMA scanner
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gatepass_scanner_app;
REVOKE ALL ON SCHEMA public FROM gatepass_scanner_app;

-- Legacy importer: read public (events/tickets/orders/ticket_categories only), write scanner.
GRANT USAGE ON SCHEMA public TO gatepass_legacy_importer;
GRANT SELECT ON public.events, public.tickets, public.orders, public.ticket_categories
  TO gatepass_legacy_importer;
GRANT USAGE ON SCHEMA scanner TO gatepass_legacy_importer;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA scanner TO gatepass_legacy_importer;
ALTER DEFAULT PRIVILEGES FOR ROLE gatepass_scanner_migrator IN SCHEMA scanner
  GRANT SELECT, INSERT, UPDATE ON TABLES TO gatepass_legacy_importer;
```

`tests/conftest.py`:

```python
import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

TEST_DB_URL = os.environ.get(
    "SCANNER_TEST_DATABASE_URL",
    "postgresql+psycopg://postgres:postgres@localhost:5432/gatepass_scanner_test",
)
os.environ["SCANNER_DATABASE_URL"] = TEST_DB_URL
os.environ["SCANNER_MIGRATIONS_DATABASE_URL"] = TEST_DB_URL
os.environ.setdefault("LEGACY_IMPORT_DATABASE_URL", TEST_DB_URL)
os.environ.setdefault("GATEPASS_QR_SIGNING_KEY", "test-signing-key-that-is-at-least-32-chars")
os.environ.setdefault("GATEPASS_ADMIN_EMAILS", "admin@test.local")
os.environ.setdefault("GATEPASS_GOOGLE_CLIENT_ID", "test-google-client-id")

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _migrate_test_database():
    engine = create_engine(TEST_DB_URL)
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA IF EXISTS scanner CASCADE"))
    engine.dispose()

    cfg = Config(str(REPO_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(REPO_ROOT / "alembic"))
    command.upgrade(cfg, "head")
    yield


@pytest.fixture()
def db_session():
    from backend.db import SessionLocal

    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture()
def make_user(db_session):
    import itertools

    counter = itertools.count(1)

    def _make(suffix: str | None = None):
        from backend.models import User

        label = suffix or f"auto{next(counter)}"
        user = User(
            google_issuer="https://accounts.google.com",
            google_subject=f"sub-{label}",
            email=f"user-{label}@example.com",
            display_name=f"User {label}",
        )
        db_session.add(user)
        db_session.flush()
        return user

    return _make


@pytest.fixture(autouse=True)
def _clean_tables(_migrate_test_database):
    yield
    from backend.db import engine as scanner_engine
    from backend.db import Base
    from backend import models  # noqa: F401

    with scanner_engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
psql "postgresql://postgres:postgres@localhost:5432/postgres" -c "CREATE DATABASE gatepass_scanner_test" 2>NUL
.venv\Scripts\python.exe -m pytest tests/test_schema_smoke.py -v
```
Expected: 3 passed (adjust the Postgres connection details first if local Postgres uses a different user/password — export `SCANNER_TEST_DATABASE_URL` in that case).

- [ ] **Step 5: Commit**

```bash
git add alembic.ini alembic/env.py alembic/script.py.mako alembic/versions/0001_scanner_schema.py sql/scanner_roles.sql tests/conftest.py tests/test_schema_smoke.py
git commit -m "feat(scanner): add Alembic migration, role SQL, and test database wiring"
```

## Task 4: `security.py` — Google auth, QR crypto, pairing/session crypto

**Files:**
- Create: `backend/security.py`
- Test: `tests/test_security.py`

**Interfaces:**
- Consumes: `backend.config.settings` (Task 1), `backend.db.get_db` (Task 2), `backend.models.User/Scanner/ScannerSession` (Task 2).
- Produces: `GoogleIdentity` (dataclass), `InvalidGoogleToken` (exception), `verify_google_id_token(token: str) -> GoogleIdentity`, `get_current_user(...) -> User` (FastAPI dep), `require_admin(...) -> User` (FastAPI dep), `require_scanner_session(...) -> Scanner` (FastAPI dep), `QR_PREFIX = "gp:v1:"`, `generate_public_id() -> str`, `build_qr_payload(public_id: str) -> str`, `parse_qr_payload(payload: str) -> tuple[str, str] | None`, `verify_qr_signature(public_id: str, signature: str) -> bool`, `hash_secret(value: str) -> str`, `generate_pairing_code() -> tuple[str, str]`, `generate_scanner_session_token() -> tuple[str, str]`. Every later backend task imports from this module — these exact names are load-bearing.

**Auth semantics for `/api/scanner/*`:** `require_scanner_session` raises `HTTPException(401, detail={"reason": "SCANNER_SESSION_EXPIRED"})` or `HTTPException(403, detail={"reason": "SCANNER_INACTIVE"})` for session/device-identity failures — these are authentication failures, not scan decisions, so they never touch `scan_logs` (there is no verified `scanner_id` yet to attribute a log row to). Everything QR-content-related (`INVALID_QR_FORMAT`, `TICKET_CANCELLED`, etc., built in Task 7) is instead a normal `200 OK` with a `{"decision": "REJECTED", ...}` body, because the caller's identity was valid — it's a business decision, not an auth failure.

- [ ] **Step 1: Write the failing test**

`tests/test_security.py`:

```python
import types

import pytest

from backend import security


def test_verify_google_id_token_maps_claims(monkeypatch):
    monkeypatch.setattr(
        security._jwks_client,
        "get_signing_key_from_jwt",
        lambda token: types.SimpleNamespace(key="dummy-key"),
    )
    monkeypatch.setattr(
        security.jwt,
        "decode",
        lambda *a, **k: {
            "iss": "https://accounts.google.com",
            "sub": "1234567890",
            "email": "person@example.com",
            "email_verified": True,
            "name": "Person Example",
            "picture": "https://example.com/p.jpg",
        },
    )
    identity = security.verify_google_id_token("fake-token")
    assert identity.issuer == "https://accounts.google.com"
    assert identity.subject == "1234567890"
    assert identity.email == "person@example.com"


def test_verify_google_id_token_rejects_unverified_email(monkeypatch):
    monkeypatch.setattr(
        security._jwks_client,
        "get_signing_key_from_jwt",
        lambda token: types.SimpleNamespace(key="dummy-key"),
    )
    monkeypatch.setattr(
        security.jwt,
        "decode",
        lambda *a, **k: {
            "iss": "https://accounts.google.com",
            "sub": "1234567890",
            "email": "person@example.com",
            "email_verified": False,
        },
    )
    with pytest.raises(security.InvalidGoogleToken):
        security.verify_google_id_token("fake-token")


def test_verify_google_id_token_rejects_wrong_issuer(monkeypatch):
    monkeypatch.setattr(
        security._jwks_client,
        "get_signing_key_from_jwt",
        lambda token: types.SimpleNamespace(key="dummy-key"),
    )
    monkeypatch.setattr(
        security.jwt,
        "decode",
        lambda *a, **k: {
            "iss": "https://evil.example.com",
            "sub": "1234567890",
            "email": "person@example.com",
            "email_verified": True,
        },
    )
    with pytest.raises(security.InvalidGoogleToken):
        security.verify_google_id_token("fake-token")


def test_qr_payload_roundtrip_and_tamper_detection():
    public_id = security.generate_public_id()
    payload = security.build_qr_payload(public_id)
    assert payload.startswith(security.QR_PREFIX)

    parsed = security.parse_qr_payload(payload)
    assert parsed is not None
    parsed_public_id, signature = parsed
    assert parsed_public_id == public_id
    assert security.verify_qr_signature(parsed_public_id, signature) is True

    assert security.verify_qr_signature("someone-elses-id", signature) is False
    assert security.verify_qr_signature(parsed_public_id, signature[:-1] + "x") is False


def test_parse_qr_payload_rejects_malformed_strings():
    assert security.parse_qr_payload("not-a-gatepass-qr") is None
    assert security.parse_qr_payload("gp:v1:missing-signature") is None


def test_pairing_code_and_session_token_hash_roundtrip():
    code, code_hash = security.generate_pairing_code()
    assert security.hash_secret(code) == code_hash
    assert len(code) == 6 and code.isdigit()

    token, token_hash = security.generate_scanner_session_token()
    assert security.hash_secret(token) == token_hash
    assert security.hash_secret(token + "x") != token_hash


def test_get_current_user_creates_then_reuses_row(db_session, monkeypatch):
    monkeypatch.setattr(
        security,
        "verify_google_id_token",
        lambda token: security.GoogleIdentity(
            issuer="https://accounts.google.com",
            subject="new-subject-1",
            email="fresh@example.com",
            name="Fresh Person",
            picture=None,
        ),
    )
    first = security.get_current_user(authorization="Bearer x", db=db_session)
    second = security.get_current_user(authorization="Bearer x", db=db_session)
    assert first.id == second.id
    assert first.email == "fresh@example.com"


def test_get_current_user_rejects_disabled_account(db_session, make_user, monkeypatch):
    from fastapi import HTTPException

    user = make_user("disabled1")
    user.status = "disabled"
    db_session.commit()

    monkeypatch.setattr(
        security,
        "verify_google_id_token",
        lambda token: security.GoogleIdentity(
            issuer=user.google_issuer,
            subject=user.google_subject,
            email=user.email,
            name=user.display_name,
            picture=None,
        ),
    )
    with pytest.raises(HTTPException) as exc_info:
        security.get_current_user(authorization="Bearer x", db=db_session)
    assert exc_info.value.status_code == 403


def test_require_scanner_session_rejects_expired_and_revoked(db_session):
    from datetime import datetime, timedelta, timezone

    from fastapi import HTTPException

    from backend.models import Scanner, ScannerSession

    resource = _make_resource(db_session)
    scanner = Scanner(
        name="Test Scanner",
        organization_name="Org",
        purpose="ACCESS_CONTROL",
        resource_id=resource.id,
    )
    db_session.add(scanner)
    db_session.flush()

    expired_token, expired_hash = security.generate_scanner_session_token()
    db_session.add(
        ScannerSession(
            scanner_id=scanner.id,
            token_hash=expired_hash,
            expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        )
    )
    revoked_token, revoked_hash = security.generate_scanner_session_token()
    db_session.add(
        ScannerSession(
            scanner_id=scanner.id,
            token_hash=revoked_hash,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            revoked_at=datetime.now(timezone.utc),
        )
    )
    db_session.commit()

    with pytest.raises(HTTPException) as expired_exc:
        security.require_scanner_session(authorization=f"Bearer {expired_token}", db=db_session)
    assert expired_exc.value.detail == {"reason": "SCANNER_SESSION_EXPIRED"}

    with pytest.raises(HTTPException) as revoked_exc:
        security.require_scanner_session(authorization=f"Bearer {revoked_token}", db=db_session)
    assert revoked_exc.value.detail == {"reason": "SCANNER_SESSION_EXPIRED"}


def _make_resource(db_session):
    from backend.models import Resource

    resource = Resource(organization_name="Org", name="Test Resource")
    db_session.add(resource)
    db_session.flush()
    return resource
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv\Scripts\python.exe -m pytest tests/test_security.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'backend.security'`

- [ ] **Step 3: Write minimal implementation**

`backend/security.py`:

```python
import base64
import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone

import jwt
from fastapi import Depends, Header, HTTPException
from jwt import PyJWKClient
from sqlalchemy.orm import Session

from backend.config import settings
from backend.db import get_db
from backend.models import Scanner, ScannerSession, User

GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}
QR_PREFIX = "gp:v1:"

_jwks_client = PyJWKClient(GOOGLE_JWKS_URL)


class InvalidGoogleToken(Exception):
    pass


@dataclass(frozen=True)
class GoogleIdentity:
    issuer: str
    subject: str
    email: str
    name: str
    picture: str | None


def verify_google_id_token(token: str) -> GoogleIdentity:
    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.google_client_id,
            options={"require": ["exp", "iss", "sub", "email"]},
        )
    except jwt.PyJWTError as exc:
        raise InvalidGoogleToken(str(exc)) from exc

    issuer = claims.get("iss", "")
    if issuer not in GOOGLE_ISSUERS:
        raise InvalidGoogleToken(f"unexpected issuer: {issuer}")
    if not claims.get("email_verified"):
        raise InvalidGoogleToken("email not verified")

    return GoogleIdentity(
        issuer=issuer,
        subject=claims["sub"],
        email=claims["email"],
        name=claims.get("name", claims["email"]),
        picture=claims.get("picture"),
    )


def get_current_user(
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
) -> User:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        identity = verify_google_id_token(token)
    except InvalidGoogleToken as exc:
        raise HTTPException(401, f"Invalid Google token: {exc}") from exc

    user = (
        db.query(User)
        .filter_by(google_issuer=identity.issuer, google_subject=identity.subject)
        .one_or_none()
    )
    if user is None:
        user = User(
            google_issuer=identity.issuer,
            google_subject=identity.subject,
            email=identity.email,
            display_name=identity.name,
            photo_url=identity.picture,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    elif user.email != identity.email:
        user.email = identity.email
        db.commit()

    if user.status != "active":
        raise HTTPException(403, "Account disabled")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.email.lower() not in settings.admin_emails:
        raise HTTPException(403, "Admin access required")
    return user


def require_scanner_session(
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
) -> Scanner:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, detail={"reason": "SCANNER_SESSION_EXPIRED"})
    token = authorization.removeprefix("Bearer ").strip()
    token_hash = hash_secret(token)
    session = db.query(ScannerSession).filter_by(token_hash=token_hash).one_or_none()
    now = datetime.now(timezone.utc)
    if session is None or session.revoked_at is not None or session.expires_at < now:
        raise HTTPException(401, detail={"reason": "SCANNER_SESSION_EXPIRED"})
    scanner = db.get(Scanner, session.scanner_id)
    if scanner is None or scanner.status != "active":
        raise HTTPException(403, detail={"reason": "SCANNER_INACTIVE"})
    session.last_seen_at = now
    db.commit()
    return scanner


def _sign(public_id: str) -> str:
    canonical = f"{QR_PREFIX}{public_id}".encode()
    digest = hmac.new(settings.qr_signing_key.encode(), canonical, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def generate_public_id() -> str:
    return secrets.token_urlsafe(16)  # 128 bits of entropy


def build_qr_payload(public_id: str) -> str:
    return f"{QR_PREFIX}{public_id}.{_sign(public_id)}"


def parse_qr_payload(payload: str) -> tuple[str, str] | None:
    if not payload.startswith(QR_PREFIX):
        return None
    remainder = payload[len(QR_PREFIX):]
    public_id, sep, signature = remainder.partition(".")
    if not sep or not public_id or not signature:
        return None
    return public_id, signature


def verify_qr_signature(public_id: str, signature: str) -> bool:
    return hmac.compare_digest(_sign(public_id), signature)


def hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def generate_pairing_code() -> tuple[str, str]:
    code = f"{secrets.randbelow(1_000_000):06d}"
    return code, hash_secret(code)


def generate_scanner_session_token() -> tuple[str, str]:
    token = secrets.token_urlsafe(32)
    return token, hash_secret(token)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv\Scripts\python.exe -m pytest tests/test_security.py -v`
Expected: 10 passed

- [ ] **Step 5: Commit**

```bash
git add backend/security.py tests/test_security.py
git commit -m "feat(scanner): add Google auth, QR HMAC, and pairing/session crypto"
```

## Task 5: `qr_service.py` + `qr_routes.py` — QR credential lifecycle

**Files:**
- Create: `backend/qr_service.py`
- Create: `backend/qr_routes.py`
- Test: `tests/test_qr_service.py`

**Interfaces:**
- Consumes: `backend.models.QrCredential/User` (Task 2), `backend.security.{generate_public_id, build_qr_payload, parse_qr_payload, verify_qr_signature, get_current_user}` (Task 4).
- Produces: `backend.qr_service.{InvalidQrFormat, InvalidQrSignature, QrRevoked}` (exceptions), `ensure_user_qr(db, user) -> QrCredential`, `get_user_qr_payload(db, user) -> str`, `render_user_qr_png(payload: str) -> bytes`, `revoke_and_reissue_user_qr(db, user) -> QrCredential`, `verify_qr_payload(db, payload: str) -> QrCredential` (raises one of the three exceptions above on failure). Produces `backend.qr_routes.router` (an `APIRouter`) — Task 10 mounts it on `app`. Task 7's scan endpoint imports `verify_qr_payload` and the three exception classes directly.

- [ ] **Step 1: Write the failing test**

`tests/test_qr_service.py`:

```python
import pytest

from backend.qr_service import (
    InvalidQrFormat,
    InvalidQrSignature,
    QrRevoked,
    ensure_user_qr,
    get_user_qr_payload,
    render_user_qr_png,
    revoke_and_reissue_user_qr,
    verify_qr_payload,
)


def test_ensure_user_qr_is_idempotent(db_session, make_user):
    user = make_user("qr1")
    first = ensure_user_qr(db_session, user)
    second = ensure_user_qr(db_session, user)
    assert first.id == second.id


def test_verify_qr_payload_roundtrip(db_session, make_user):
    user = make_user("qr2")
    payload = get_user_qr_payload(db_session, user)
    credential = verify_qr_payload(db_session, payload)
    assert credential.user_id == user.id


def test_verify_qr_payload_rejects_malformed(db_session, make_user):
    with pytest.raises(InvalidQrFormat):
        verify_qr_payload(db_session, "not-a-gatepass-qr")


def test_verify_qr_payload_rejects_tampered_signature(db_session, make_user):
    user = make_user("qr3")
    payload = get_user_qr_payload(db_session, user)
    tampered = payload[:-1] + ("x" if payload[-1] != "x" else "y")
    with pytest.raises(InvalidQrSignature):
        verify_qr_payload(db_session, tampered)


def test_reissue_revokes_old_and_activates_new(db_session, make_user):
    user = make_user("qr4")
    old_payload = get_user_qr_payload(db_session, user)
    revoke_and_reissue_user_qr(db_session, user)
    new_payload = get_user_qr_payload(db_session, user)

    assert new_payload != old_payload
    with pytest.raises(QrRevoked):
        verify_qr_payload(db_session, old_payload)
    assert verify_qr_payload(db_session, new_payload).user_id == user.id


def test_render_user_qr_png_produces_png_bytes(db_session, make_user):
    user = make_user("qr5")
    payload = get_user_qr_payload(db_session, user)
    png_bytes = render_user_qr_png(payload)
    assert png_bytes.startswith(b"\x89PNG\r\n\x1a\n")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv\Scripts\python.exe -m pytest tests/test_qr_service.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'backend.qr_service'`

- [ ] **Step 3: Write minimal implementation**

`backend/qr_service.py`:

```python
import io
from datetime import datetime, timezone

import qrcode
from qrcode.constants import ERROR_CORRECT_H
from sqlalchemy.orm import Session

from backend.models import QrCredential, User
from backend.security import (
    build_qr_payload,
    generate_public_id,
    parse_qr_payload,
    verify_qr_signature,
)


class InvalidQrFormat(Exception):
    pass


class InvalidQrSignature(Exception):
    pass


class QrRevoked(Exception):
    pass


def ensure_user_qr(db: Session, user: User) -> QrCredential:
    credential = (
        db.query(QrCredential).filter_by(user_id=user.id, status="active").one_or_none()
    )
    if credential is not None:
        return credential
    credential = QrCredential(user_id=user.id, public_id=generate_public_id())
    db.add(credential)
    db.commit()
    db.refresh(credential)
    return credential


def get_user_qr_payload(db: Session, user: User) -> str:
    credential = ensure_user_qr(db, user)
    return build_qr_payload(credential.public_id)


def render_user_qr_png(payload: str) -> bytes:
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H)
    qr.add_data(payload)
    qr.make(fit=True)
    image = qr.make_image()
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def revoke_and_reissue_user_qr(db: Session, user: User) -> QrCredential:
    old = (
        db.query(QrCredential).filter_by(user_id=user.id, status="active").one_or_none()
    )
    if old is not None:
        old.status = "revoked"
        old.revoked_at = datetime.now(timezone.utc)
        db.flush()  # old must leave the partial-unique-index predicate before the new insert
    new_credential = QrCredential(user_id=user.id, public_id=generate_public_id())
    db.add(new_credential)
    db.commit()
    db.refresh(new_credential)
    return new_credential


def verify_qr_payload(db: Session, payload: str) -> QrCredential:
    parsed = parse_qr_payload(payload)
    if parsed is None:
        raise InvalidQrFormat()
    public_id, signature = parsed
    if not verify_qr_signature(public_id, signature):
        raise InvalidQrSignature()
    credential = db.query(QrCredential).filter_by(public_id=public_id).one_or_none()
    if credential is None or credential.status != "active":
        raise QrRevoked()
    return credential
```

`backend/qr_routes.py`:

```python
from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.models import User
from backend.qr_service import (
    ensure_user_qr,
    get_user_qr_payload,
    render_user_qr_png,
    revoke_and_reissue_user_qr,
)
from backend.security import get_current_user

router = APIRouter(prefix="/api/qr", tags=["qr"])


class QrMeResponse(BaseModel):
    qr_payload: str
    status: str


@router.get("/me", response_model=QrMeResponse)
def get_my_qr(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> QrMeResponse:
    credential = ensure_user_qr(db, user)
    return QrMeResponse(qr_payload=get_user_qr_payload(db, user), status=credential.status)


@router.get("/me.png")
def get_my_qr_png(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Response:
    payload = get_user_qr_payload(db, user)
    return Response(content=render_user_qr_png(payload), media_type="image/png")


@router.post("/reissue", response_model=QrMeResponse)
def reissue_my_qr(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> QrMeResponse:
    credential = revoke_and_reissue_user_qr(db, user)
    return QrMeResponse(qr_payload=get_user_qr_payload(db, user), status=credential.status)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv\Scripts\python.exe -m pytest tests/test_qr_service.py -v`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add backend/qr_service.py backend/qr_routes.py tests/test_qr_service.py
git commit -m "feat(scanner): add QR credential lifecycle service and routes"
```

## Task 6: `admin_routes.py` — resources, events, scanner provisioning, ticket issuance

**Files:**
- Create: `backend/admin_routes.py`
- Test: `tests/test_admin_routes.py`

**Interfaces:**
- Consumes: `backend.models.{Event, Resource, Scanner, ScannerPairingCode, ScannerSession, TicketAssignment, TicketEntitlement, User}` (Task 2), `backend.security.{generate_pairing_code, require_admin}` (Task 4), `backend.config.settings` (Task 1).
- Produces: `backend.admin_routes.router` (an `APIRouter`, prefix `/api/admin`) — Task 10 mounts it.

Each router task builds its own minimal `FastAPI()` test app with only its router mounted (rather than importing `backend.main.app`, which isn't fully wired until Task 10) — this keeps every task independently testable regardless of task order. Task 10 adds one final smoke test against the fully-wired `backend.main.app`.

- [ ] **Step 1: Write the failing test**

`tests/test_admin_routes.py`:

```python
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from backend.admin_routes import router as admin_router
from backend.db import get_db
from backend.security import require_admin


def _app_with_admin(db_session, admin_user) -> TestClient:
    app = FastAPI()
    app.include_router(admin_router)
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[require_admin] = lambda: admin_user
    return TestClient(app)


def test_admin_can_create_resource_and_scanner(db_session, make_user):
    admin = make_user("admin1")
    client = _app_with_admin(db_session, admin)

    resource_resp = client.post(
        "/api/admin/resources", json={"organization_name": "Org", "name": "Main Gate Building"}
    )
    assert resource_resp.status_code == 201
    resource_id = resource_resp.json()["id"]

    scanner_resp = client.post(
        "/api/admin/scanners",
        json={
            "name": "Access Scanner",
            "organization_name": "Org",
            "purpose": "ACCESS_CONTROL",
            "resource_id": resource_id,
        },
    )
    assert scanner_resp.status_code == 201
    body = scanner_resp.json()
    assert len(body["pairing_code"]) > 0
    assert "scanner_id" in body


def test_scanner_creation_rejects_purpose_locator_mismatch(db_session, make_user):
    admin = make_user("admin2")
    client = _app_with_admin(db_session, admin)
    resp = client.post(
        "/api/admin/scanners",
        json={
            "name": "Bad Scanner",
            "organization_name": "Org",
            "purpose": "ACCESS_CONTROL",
            "event_id": "00000000-0000-0000-0000-000000000099",
        },
    )
    assert resp.status_code == 400


def test_issue_ticket_requires_existing_recipient(db_session, make_user):
    admin = make_user("admin3")
    client = _app_with_admin(db_session, admin)
    event_resp = client.post(
        "/api/admin/events",
        json={
            "organization_name": "Org",
            "name": "Conference",
            "starts_at": datetime.now(timezone.utc).isoformat(),
            "ends_at": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
        },
    )
    event_id = event_resp.json()["id"]
    resp = client.post(
        "/api/admin/tickets",
        json={
            "event_id": event_id,
            "recipient_email": "never-logged-in@example.com",
            "ticket_type": "GA",
        },
    )
    assert resp.status_code == 400


def test_issue_ticket_succeeds_for_existing_recipient(db_session, make_user):
    admin = make_user("admin4")
    recipient = make_user("recipient1")
    client = _app_with_admin(db_session, admin)
    event_resp = client.post(
        "/api/admin/events",
        json={
            "organization_name": "Org",
            "name": "Conference",
            "starts_at": datetime.now(timezone.utc).isoformat(),
            "ends_at": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
        },
    )
    event_id = event_resp.json()["id"]
    resp = client.post(
        "/api/admin/tickets",
        json={
            "event_id": event_id,
            "recipient_email": recipient.email,
            "ticket_type": "GA",
        },
    )
    assert resp.status_code == 201


def test_non_admin_is_rejected():
    app = FastAPI()
    app.include_router(admin_router)

    def _deny():
        raise HTTPException(403, "Admin access required")

    app.dependency_overrides[require_admin] = _deny
    client = TestClient(app)
    resp = client.post("/api/admin/resources", json={"organization_name": "Org", "name": "X"})
    assert resp.status_code == 403
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv\Scripts\python.exe -m pytest tests/test_admin_routes.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'backend.admin_routes'`

- [ ] **Step 3: Write minimal implementation**

`backend/admin_routes.py`:

```python
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.config import settings
from backend.db import get_db
from backend.models import (
    Event,
    Resource,
    Scanner,
    ScannerPairingCode,
    ScannerSession,
    TicketAssignment,
    TicketEntitlement,
    User,
)
from backend.security import generate_pairing_code, require_admin

router = APIRouter(prefix="/api/admin", tags=["admin"])

_PURPOSE_LOCATOR = {
    "TICKET_VALIDATION": "event",
    "ATTENDANCE": "event",
    "ACCESS_CONTROL": "resource",
    "IDENTITY_VERIFICATION": None,
}


def _validate_purpose_locator(purpose: str, event_id: str | None, resource_id: str | None) -> None:
    if purpose not in _PURPOSE_LOCATOR:
        raise HTTPException(400, f"Unknown purpose: {purpose}")
    required = _PURPOSE_LOCATOR[purpose]
    if required == "event" and (event_id is None or resource_id is not None):
        raise HTTPException(400, f"{purpose} requires event_id and no resource_id")
    if required == "resource" and (resource_id is None or event_id is not None):
        raise HTTPException(400, f"{purpose} requires resource_id and no event_id")
    if required is None and (event_id is not None or resource_id is not None):
        raise HTTPException(400, f"{purpose} must not set event_id or resource_id")


class CreateResourceRequest(BaseModel):
    organization_name: str
    name: str


class ResourceResponse(BaseModel):
    id: str
    name: str


@router.post("/resources", response_model=ResourceResponse, status_code=201)
def create_resource(
    body: CreateResourceRequest,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ResourceResponse:
    resource = Resource(organization_name=body.organization_name, name=body.name)
    db.add(resource)
    db.commit()
    db.refresh(resource)
    return ResourceResponse(id=str(resource.id), name=resource.name)


class CreateEventRequest(BaseModel):
    organization_name: str
    name: str
    starts_at: datetime
    ends_at: datetime
    venue: str | None = None


class EventResponse(BaseModel):
    id: str
    name: str


@router.post("/events", response_model=EventResponse, status_code=201)
def create_event(
    body: CreateEventRequest,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> EventResponse:
    event = Event(
        organization_name=body.organization_name,
        name=body.name,
        starts_at=body.starts_at,
        ends_at=body.ends_at,
        venue=body.venue,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return EventResponse(id=str(event.id), name=event.name)


class CreateScannerRequest(BaseModel):
    name: str
    organization_name: str
    purpose: str
    event_id: str | None = None
    resource_id: str | None = None
    gate_id: str | None = None


class CreateScannerResponse(BaseModel):
    scanner_id: str
    pairing_code: str
    pairing_expires_at: datetime


@router.post("/scanners", response_model=CreateScannerResponse, status_code=201)
def create_scanner(
    body: CreateScannerRequest,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> CreateScannerResponse:
    _validate_purpose_locator(body.purpose, body.event_id, body.resource_id)
    scanner = Scanner(
        name=body.name,
        organization_name=body.organization_name,
        purpose=body.purpose,
        event_id=body.event_id,
        resource_id=body.resource_id,
        gate_id=body.gate_id,
    )
    db.add(scanner)
    db.flush()

    code, code_hash = generate_pairing_code()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.scanner_pairing_minutes)
    db.add(ScannerPairingCode(scanner_id=scanner.id, code_hash=code_hash, expires_at=expires_at))
    db.commit()

    return CreateScannerResponse(
        scanner_id=str(scanner.id), pairing_code=code, pairing_expires_at=expires_at
    )


@router.post("/scanners/{scanner_id}/revoke", status_code=204)
def revoke_scanner(
    scanner_id: str, _admin: User = Depends(require_admin), db: Session = Depends(get_db)
) -> None:
    scanner = db.get(Scanner, scanner_id)
    if scanner is None:
        raise HTTPException(404, "Scanner not found")
    scanner.status = "revoked"
    db.commit()


class NewPairingCodeResponse(BaseModel):
    pairing_code: str
    pairing_expires_at: datetime


@router.post("/scanners/{scanner_id}/new-pairing-code", response_model=NewPairingCodeResponse)
def new_pairing_code(
    scanner_id: str, _admin: User = Depends(require_admin), db: Session = Depends(get_db)
) -> NewPairingCodeResponse:
    scanner = db.get(Scanner, scanner_id)
    if scanner is None:
        raise HTTPException(404, "Scanner not found")
    code, code_hash = generate_pairing_code()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.scanner_pairing_minutes)
    db.add(ScannerPairingCode(scanner_id=scanner.id, code_hash=code_hash, expires_at=expires_at))
    db.commit()
    return NewPairingCodeResponse(pairing_code=code, pairing_expires_at=expires_at)


@router.post("/scanners/{scanner_id}/sessions/revoke", status_code=204)
def revoke_scanner_sessions(
    scanner_id: str, _admin: User = Depends(require_admin), db: Session = Depends(get_db)
) -> None:
    now = datetime.now(timezone.utc)
    db.query(ScannerSession).filter(
        ScannerSession.scanner_id == scanner_id, ScannerSession.revoked_at.is_(None)
    ).update({"revoked_at": now})
    db.commit()


class IssueTicketRequest(BaseModel):
    event_id: str
    recipient_email: str
    ticket_type: str
    max_entries: int = 1
    valid_from: datetime | None = None
    valid_until: datetime | None = None


class TicketResponse(BaseModel):
    ticket_id: str
    status: str


@router.post("/tickets", response_model=TicketResponse, status_code=201)
def issue_ticket(
    body: IssueTicketRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> TicketResponse:
    recipient = (
        db.query(User).filter(func.lower(User.email) == body.recipient_email.lower()).one_or_none()
    )
    if recipient is None:
        raise HTTPException(
            400,
            "Recipient must have logged into GatePass at least once before a ticket "
            "can be issued to them",
        )
    ticket = TicketEntitlement(
        event_id=body.event_id,
        issued_by_admin_user_id=admin.id,
        source_type="ADMIN_ISSUED",
        ticket_type=body.ticket_type,
        max_entries=body.max_entries,
        valid_from=body.valid_from,
        valid_until=body.valid_until,
    )
    db.add(ticket)
    db.flush()
    db.add(TicketAssignment(ticket_id=ticket.id, assigned_to_user_id=recipient.id))
    db.commit()
    return TicketResponse(ticket_id=str(ticket.id), status=ticket.status)


@router.post("/tickets/{ticket_id}/cancel", response_model=TicketResponse)
def cancel_ticket(
    ticket_id: str, _admin: User = Depends(require_admin), db: Session = Depends(get_db)
) -> TicketResponse:
    ticket = db.get(TicketEntitlement, ticket_id)
    if ticket is None:
        raise HTTPException(404, "Ticket not found")
    ticket.status = "cancelled"
    db.commit()
    return TicketResponse(ticket_id=str(ticket.id), status=ticket.status)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv\Scripts\python.exe -m pytest tests/test_admin_routes.py -v`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add backend/admin_routes.py tests/test_admin_routes.py
git commit -m "feat(scanner): add admin provisioning and ticket-issuance routes"
```

## Task 7: `scanner_routes.py` — pairing, `/me`, and the scan algorithm

**Files:**
- Create: `backend/scanner_routes.py`
- Test: `tests/test_scanner_pairing.py`
- Test: `tests/test_scan_ticket_validation.py`
- Test: `tests/test_scan_attendance.py`
- Test: `tests/test_scan_access_control.py`

**Interfaces:**
- Consumes: `backend.models.*` (Task 2), `backend.security.{generate_scanner_session_token, hash_secret, require_scanner_session}` (Task 4), `backend.qr_service.{verify_qr_payload, InvalidQrFormat, InvalidQrSignature, QrRevoked}` (Task 5), `backend.config.settings` (Task 1).
- Produces: `backend.scanner_routes.router` (an `APIRouter`, prefix `/api/scanner`) — Task 10 mounts it. No later task imports functions from this module directly; it's a leaf.

This is the largest task in the plan — it implements the full scan algorithm from spec §8. Do not skip the classification-precedence logic in `_classify_ticket_rejection`; it is the fix for the "unordered `LIMIT 1`" defect the round-2 corrections called out.

- [ ] **Step 1: Write the failing tests**

`tests/test_scanner_pairing.py`:

```python
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.db import get_db
from backend.models import Event, Scanner, ScannerPairingCode
from backend.scanner_routes import router as scanner_router
from backend.security import generate_pairing_code, hash_secret


def _client(db_session) -> TestClient:
    app = FastAPI()
    app.include_router(scanner_router)
    app.dependency_overrides[get_db] = lambda: db_session
    return TestClient(app)


def _make_event(db_session):
    event = Event(
        organization_name="Org",
        name="Con",
        starts_at=datetime.now(timezone.utc) - timedelta(hours=1),
        ends_at=datetime.now(timezone.utc) + timedelta(hours=5),
    )
    db_session.add(event)
    db_session.flush()
    return event


def _make_scanner_with_code(db_session, *, minutes_to_expiry=10):
    event = _make_event(db_session)
    scanner = Scanner(
        name="Gate 1",
        organization_name="Org",
        purpose="TICKET_VALIDATION",
        event_id=event.id,
    )
    db_session.add(scanner)
    db_session.flush()
    code, code_hash = generate_pairing_code()
    db_session.add(
        ScannerPairingCode(
            scanner_id=scanner.id,
            code_hash=code_hash,
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=minutes_to_expiry),
        )
    )
    db_session.commit()
    return scanner, code


def test_pair_succeeds_with_valid_code(db_session):
    scanner, code = _make_scanner_with_code(db_session)
    client = _client(db_session)
    resp = client.post(
        "/api/scanner/pair",
        json={"scanner_id": str(scanner.id), "pairing_code": code, "device_name": "Laptop"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["scanner"]["purpose"] == "TICKET_VALIDATION"
    assert len(body["scanner_session_token"]) > 0


def test_pair_rejects_expired_code(db_session):
    scanner, code = _make_scanner_with_code(db_session, minutes_to_expiry=-1)
    client = _client(db_session)
    resp = client.post(
        "/api/scanner/pair", json={"scanner_id": str(scanner.id), "pairing_code": code}
    )
    assert resp.status_code == 400


def test_pair_rejects_reused_code(db_session):
    scanner, code = _make_scanner_with_code(db_session)
    client = _client(db_session)
    first = client.post(
        "/api/scanner/pair", json={"scanner_id": str(scanner.id), "pairing_code": code}
    )
    assert first.status_code == 200
    second = client.post(
        "/api/scanner/pair", json={"scanner_id": str(scanner.id), "pairing_code": code}
    )
    assert second.status_code == 400


def test_pair_rejects_wrong_code(db_session):
    scanner, _code = _make_scanner_with_code(db_session)
    client = _client(db_session)
    resp = client.post(
        "/api/scanner/pair", json={"scanner_id": str(scanner.id), "pairing_code": "000000"}
    )
    assert resp.status_code == 400


def test_pair_rejects_revoked_scanner(db_session):
    scanner, code = _make_scanner_with_code(db_session)
    scanner.status = "revoked"
    db_session.commit()
    client = _client(db_session)
    resp = client.post(
        "/api/scanner/pair", json={"scanner_id": str(scanner.id), "pairing_code": code}
    )
    assert resp.status_code == 400


def test_scanner_me_returns_locked_configuration(db_session):
    scanner, code = _make_scanner_with_code(db_session)
    client = _client(db_session)
    token = client.post(
        "/api/scanner/pair", json={"scanner_id": str(scanner.id), "pairing_code": code}
    ).json()["scanner_session_token"]
    resp = client.get("/api/scanner/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["purpose"] == "TICKET_VALIDATION"


def test_scan_rejects_expired_session(db_session):
    client = _client(db_session)
    resp = client.post(
        "/api/scanner/scan",
        json={"qr_payload": "gp:v1:x.y", "idempotency_key": "k1"},
        headers={"Authorization": "Bearer not-a-real-token"},
    )
    assert resp.status_code == 401
    assert resp.json()["detail"]["reason"] == "SCANNER_SESSION_EXPIRED"


def test_scan_rejects_scanner_revoked_after_pairing(db_session):
    scanner, code = _make_scanner_with_code(db_session)
    client = _client(db_session)
    token = client.post(
        "/api/scanner/pair", json={"scanner_id": str(scanner.id), "pairing_code": code}
    ).json()["scanner_session_token"]

    scanner.status = "revoked"
    db_session.commit()

    resp = client.post(
        "/api/scanner/scan",
        json={"qr_payload": "gp:v1:x.y", "idempotency_key": "k2"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403
    assert resp.json()["detail"]["reason"] == "SCANNER_INACTIVE"
```

`tests/test_scan_ticket_validation.py`:

```python
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.db import get_db
from backend.models import Event, Scanner, ScannerSession, TicketAssignment, TicketEntitlement
from backend.qr_service import get_user_qr_payload
from backend.scanner_routes import router as scanner_router
from backend.security import generate_scanner_session_token, hash_secret


def _client(db_session) -> TestClient:
    app = FastAPI()
    app.include_router(scanner_router)
    app.dependency_overrides[get_db] = lambda: db_session
    return TestClient(app)


def _paired_headers(db_session, scanner) -> dict:
    token, token_hash = generate_scanner_session_token()
    db_session.add(
        ScannerSession(
            scanner_id=scanner.id,
            token_hash=token_hash,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        )
    )
    db_session.commit()
    return {"Authorization": f"Bearer {token}"}


def _make_event(db_session, **overrides):
    defaults = dict(
        organization_name="Org",
        name="Con",
        starts_at=datetime.now(timezone.utc) - timedelta(hours=1),
        ends_at=datetime.now(timezone.utc) + timedelta(hours=5),
    )
    defaults.update(overrides)
    event = Event(**defaults)
    db_session.add(event)
    db_session.flush()
    return event


def _make_ticket_scanner(db_session, event):
    scanner = Scanner(
        name="Gate 1", organization_name="Org", purpose="TICKET_VALIDATION", event_id=event.id
    )
    db_session.add(scanner)
    db_session.flush()
    return scanner


def _issue_ticket(db_session, event, user, admin, **overrides):
    defaults = dict(
        event_id=event.id,
        issued_by_admin_user_id=admin.id,
        source_type="ADMIN_ISSUED",
        ticket_type="GA",
        max_entries=1,
    )
    defaults.update(overrides)
    ticket = TicketEntitlement(**defaults)
    db_session.add(ticket)
    db_session.flush()
    db_session.add(TicketAssignment(ticket_id=ticket.id, assigned_to_user_id=user.id))
    db_session.commit()
    return ticket


def test_valid_ticket_is_approved_and_entry_incremented(db_session, make_user):
    admin = make_user("admin")
    attendee = make_user("attendee1")
    event = _make_event(db_session)
    scanner = _make_ticket_scanner(db_session, event)
    _issue_ticket(db_session, event, attendee, admin)
    payload = get_user_qr_payload(db_session, attendee)

    client = _client(db_session)
    resp = client.post(
        "/api/scanner/scan",
        json={"qr_payload": payload, "idempotency_key": "scan-1"},
        headers=_paired_headers(db_session, scanner),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["decision"] == "APPROVED"
    assert body["reason"] == "VALID_TICKET"
    assert body["ticket"]["entry_count"] == 1


def test_wrong_event_ticket_is_rejected(db_session, make_user):
    admin = make_user("admin")
    attendee = make_user("attendee2")
    ticket_event = _make_event(db_session)
    other_event = _make_event(db_session)
    scanner = _make_ticket_scanner(db_session, other_event)
    _issue_ticket(db_session, ticket_event, attendee, admin)
    payload = get_user_qr_payload(db_session, attendee)

    client = _client(db_session)
    resp = client.post(
        "/api/scanner/scan",
        json={"qr_payload": payload, "idempotency_key": "scan-2"},
        headers=_paired_headers(db_session, scanner),
    )
    assert resp.json()["decision"] == "REJECTED"
    assert resp.json()["reason"] == "NO_VALID_TICKET"


def test_cancelled_ticket_is_rejected(db_session, make_user):
    admin = make_user("admin")
    attendee = make_user("attendee3")
    event = _make_event(db_session)
    scanner = _make_ticket_scanner(db_session, event)
    _issue_ticket(db_session, event, attendee, admin, status="cancelled")
    payload = get_user_qr_payload(db_session, attendee)

    client = _client(db_session)
    resp = client.post(
        "/api/scanner/scan",
        json={"qr_payload": payload, "idempotency_key": "scan-3"},
        headers=_paired_headers(db_session, scanner),
    )
    assert resp.json()["reason"] == "TICKET_CANCELLED"


def test_expired_ticket_is_rejected(db_session, make_user):
    admin = make_user("admin")
    attendee = make_user("attendee4")
    event = _make_event(db_session)
    scanner = _make_ticket_scanner(db_session, event)
    _issue_ticket(
        db_session,
        event,
        attendee,
        admin,
        valid_until=datetime.now(timezone.utc) - timedelta(minutes=1),
    )
    payload = get_user_qr_payload(db_session, attendee)

    client = _client(db_session)
    resp = client.post(
        "/api/scanner/scan",
        json={"qr_payload": payload, "idempotency_key": "scan-4"},
        headers=_paired_headers(db_session, scanner),
    )
    assert resp.json()["reason"] == "TICKET_EXPIRED"


def test_duplicate_entry_is_rejected_once_limit_reached(db_session, make_user):
    admin = make_user("admin")
    attendee = make_user("attendee5")
    event = _make_event(db_session)
    scanner = _make_ticket_scanner(db_session, event)
    _issue_ticket(db_session, event, attendee, admin, max_entries=1)
    payload = get_user_qr_payload(db_session, attendee)

    client = _client(db_session)
    headers = _paired_headers(db_session, scanner)
    first = client.post(
        "/api/scanner/scan",
        json={"qr_payload": payload, "idempotency_key": "scan-5a"},
        headers=headers,
    )
    assert first.json()["decision"] == "APPROVED"
    second = client.post(
        "/api/scanner/scan",
        json={"qr_payload": payload, "idempotency_key": "scan-5b"},
        headers=headers,
    )
    assert second.json()["reason"] == "ENTRY_LIMIT_REACHED"


def test_idempotent_replay_returns_original_result(db_session, make_user):
    admin = make_user("admin")
    attendee = make_user("attendee6")
    event = _make_event(db_session)
    scanner = _make_ticket_scanner(db_session, event)
    _issue_ticket(db_session, event, attendee, admin, max_entries=5)
    payload = get_user_qr_payload(db_session, attendee)

    client = _client(db_session)
    headers = _paired_headers(db_session, scanner)
    first = client.post(
        "/api/scanner/scan",
        json={"qr_payload": payload, "idempotency_key": "same-key"},
        headers=headers,
    )
    second = client.post(
        "/api/scanner/scan",
        json={"qr_payload": payload, "idempotency_key": "same-key"},
        headers=headers,
    )
    assert first.json() == second.json()
    assert first.json()["ticket"]["entry_count"] == 1  # not incremented twice


def test_earliest_eligible_ticket_is_consumed_first(db_session, make_user):
    admin = make_user("admin")
    attendee = make_user("attendee7")
    event = _make_event(db_session)
    scanner = _make_ticket_scanner(db_session, event)
    older = _issue_ticket(db_session, event, attendee, admin, ticket_type="EARLY")
    newer = _issue_ticket(db_session, event, attendee, admin, ticket_type="LATE")
    payload = get_user_qr_payload(db_session, attendee)

    client = _client(db_session)
    resp = client.post(
        "/api/scanner/scan",
        json={"qr_payload": payload, "idempotency_key": "scan-order"},
        headers=_paired_headers(db_session, scanner),
    )
    assert resp.json()["ticket"]["ticket_type"] == "EARLY"


def test_non_gatepass_qr_is_rejected(db_session, make_user):
    event = _make_event(db_session)
    scanner = _make_ticket_scanner(db_session, event)
    client = _client(db_session)
    resp = client.post(
        "/api/scanner/scan",
        json={"qr_payload": "not-a-gatepass-code", "idempotency_key": "scan-bad"},
        headers=_paired_headers(db_session, scanner),
    )
    assert resp.json()["reason"] == "INVALID_QR_FORMAT"


def test_tampered_qr_signature_is_rejected(db_session, make_user):
    attendee = make_user("attendee8")
    event = _make_event(db_session)
    scanner = _make_ticket_scanner(db_session, event)
    payload = get_user_qr_payload(db_session, attendee)
    tampered = payload[:-1] + ("x" if payload[-1] != "x" else "y")

    client = _client(db_session)
    resp = client.post(
        "/api/scanner/scan",
        json={"qr_payload": tampered, "idempotency_key": "scan-tamper"},
        headers=_paired_headers(db_session, scanner),
    )
    assert resp.json()["reason"] == "INVALID_QR_SIGNATURE"


def test_revoked_qr_is_rejected(db_session, make_user):
    from backend.qr_service import revoke_and_reissue_user_qr

    attendee = make_user("attendee9")
    event = _make_event(db_session)
    scanner = _make_ticket_scanner(db_session, event)
    old_payload = get_user_qr_payload(db_session, attendee)
    revoke_and_reissue_user_qr(db_session, attendee)

    client = _client(db_session)
    resp = client.post(
        "/api/scanner/scan",
        json={"qr_payload": old_payload, "idempotency_key": "scan-revoked"},
        headers=_paired_headers(db_session, scanner),
    )
    assert resp.json()["reason"] == "QR_REVOKED"


def test_concurrent_double_scan_only_one_entry_succeeds(db_session, make_user):
    import threading

    from backend.db import SessionLocal

    admin = make_user("admin-concurrent")
    attendee = make_user("attendee-concurrent")
    event = _make_event(db_session)
    scanner = _make_ticket_scanner(db_session, event)
    _issue_ticket(db_session, event, attendee, admin, max_entries=1)
    payload = get_user_qr_payload(db_session, attendee)
    headers = _paired_headers(db_session, scanner)
    db_session.commit()

    def _fresh_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app = FastAPI()
    app.include_router(scanner_router)
    app.dependency_overrides[get_db] = _fresh_db
    client = TestClient(app)
    results: list[str] = []

    def _scan(key: str) -> None:
        resp = client.post(
            "/api/scanner/scan",
            json={"qr_payload": payload, "idempotency_key": key},
            headers=headers,
        )
        results.append(resp.json()["decision"])

    t1 = threading.Thread(target=_scan, args=("concurrent-a",))
    t2 = threading.Thread(target=_scan, args=("concurrent-b",))
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    assert results.count("APPROVED") == 1
    assert results.count("REJECTED") == 1
```

`tests/test_scan_attendance.py`:

```python
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.db import get_db
from backend.models import Event, Scanner, ScannerSession
from backend.qr_service import get_user_qr_payload
from backend.scanner_routes import router as scanner_router
from backend.security import generate_scanner_session_token


def _client(db_session) -> TestClient:
    app = FastAPI()
    app.include_router(scanner_router)
    app.dependency_overrides[get_db] = lambda: db_session
    return TestClient(app)


def test_attendance_marks_once_and_rejects_duplicate(db_session, make_user):
    attendee = make_user("attendee1")
    event = Event(
        organization_name="Org",
        name="Con",
        starts_at=datetime.now(timezone.utc) - timedelta(hours=1),
        ends_at=datetime.now(timezone.utc) + timedelta(hours=5),
    )
    db_session.add(event)
    db_session.flush()
    scanner = Scanner(
        name="Gate", organization_name="Org", purpose="ATTENDANCE", event_id=event.id
    )
    db_session.add(scanner)
    db_session.flush()
    token, token_hash = generate_scanner_session_token()
    db_session.add(
        ScannerSession(
            scanner_id=scanner.id,
            token_hash=token_hash,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        )
    )
    db_session.commit()
    headers = {"Authorization": f"Bearer {token}"}
    payload = get_user_qr_payload(db_session, attendee)

    client = _client(db_session)
    first = client.post(
        "/api/scanner/scan",
        json={"qr_payload": payload, "idempotency_key": "a1"},
        headers=headers,
    )
    assert first.json()["reason"] == "ATTENDANCE_MARKED"

    second = client.post(
        "/api/scanner/scan",
        json={"qr_payload": payload, "idempotency_key": "a2"},
        headers=headers,
    )
    assert second.json()["decision"] == "REJECTED"
    assert second.json()["reason"] == "ATTENDANCE_ALREADY_MARKED"


def test_concurrent_duplicate_attendance_scans_only_one_marks(db_session, make_user):
    import threading

    from backend.db import SessionLocal

    attendee = make_user("attendee-concurrent")
    event = Event(
        organization_name="Org",
        name="Con",
        starts_at=datetime.now(timezone.utc) - timedelta(hours=1),
        ends_at=datetime.now(timezone.utc) + timedelta(hours=5),
    )
    db_session.add(event)
    db_session.flush()
    scanner = Scanner(
        name="Gate", organization_name="Org", purpose="ATTENDANCE", event_id=event.id
    )
    db_session.add(scanner)
    db_session.flush()
    token, token_hash = generate_scanner_session_token()
    db_session.add(
        ScannerSession(
            scanner_id=scanner.id,
            token_hash=token_hash,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        )
    )
    db_session.commit()
    headers = {"Authorization": f"Bearer {token}"}
    payload = get_user_qr_payload(db_session, attendee)

    def _fresh_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app = FastAPI()
    app.include_router(scanner_router)
    app.dependency_overrides[get_db] = _fresh_db
    client = TestClient(app)
    results: list[str] = []

    def _scan(key: str) -> None:
        resp = client.post(
            "/api/scanner/scan",
            json={"qr_payload": payload, "idempotency_key": key},
            headers=headers,
        )
        results.append(resp.json()["reason"])

    t1 = threading.Thread(target=_scan, args=("attendance-concurrent-a",))
    t2 = threading.Thread(target=_scan, args=("attendance-concurrent-b",))
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    assert results.count("ATTENDANCE_MARKED") == 1
    assert results.count("ATTENDANCE_ALREADY_MARKED") == 1
```

`tests/test_scan_access_control.py`:

```python
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.db import get_db
from backend.models import AccessGrant, Resource, Scanner, ScannerSession
from backend.qr_service import get_user_qr_payload
from backend.scanner_routes import router as scanner_router
from backend.security import generate_scanner_session_token


def _client(db_session) -> TestClient:
    app = FastAPI()
    app.include_router(scanner_router)
    app.dependency_overrides[get_db] = lambda: db_session
    return TestClient(app)


def _access_scanner_headers(db_session, resource):
    scanner = Scanner(
        name="Building Gate",
        organization_name="Org",
        purpose="ACCESS_CONTROL",
        resource_id=resource.id,
    )
    db_session.add(scanner)
    db_session.flush()
    token, token_hash = generate_scanner_session_token()
    db_session.add(
        ScannerSession(
            scanner_id=scanner.id,
            token_hash=token_hash,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        )
    )
    db_session.commit()
    return {"Authorization": f"Bearer {token}"}


def test_access_control_grants_and_denies(db_session, make_user):
    granted_user = make_user("granted")
    ungranted_user = make_user("ungranted")
    resource = Resource(organization_name="Org", name="Building A")
    db_session.add(resource)
    db_session.flush()
    db_session.add(
        AccessGrant(resource_id=resource.id, user_id=granted_user.id, grant_type="STANDARD")
    )
    db_session.commit()

    headers = _access_scanner_headers(db_session, resource)
    client = _client(db_session)

    granted_payload = get_user_qr_payload(db_session, granted_user)
    resp = client.post(
        "/api/scanner/scan",
        json={"qr_payload": granted_payload, "idempotency_key": "g1"},
        headers=headers,
    )
    assert resp.json()["reason"] == "ACCESS_GRANTED"

    ungranted_payload = get_user_qr_payload(db_session, ungranted_user)
    resp2 = client.post(
        "/api/scanner/scan",
        json={"qr_payload": ungranted_payload, "idempotency_key": "g2"},
        headers=headers,
    )
    assert resp2.json()["reason"] == "NO_ACCESS_GRANT"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv\Scripts\python.exe -m pytest tests/test_scanner_pairing.py tests/test_scan_ticket_validation.py tests/test_scan_attendance.py tests/test_scan_access_control.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'backend.scanner_routes'`

- [ ] **Step 3: Write minimal implementation**

`backend/scanner_routes.py`:

```python
from collections.abc import Callable
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.config import settings
from backend.db import get_db
from backend.models import (
    AccessGrant,
    AttendanceRecord,
    Scanner,
    ScannerPairingCode,
    ScannerSession,
    ScanLog,
    TicketAssignment,
    TicketEntitlement,
    User,
)
from backend.qr_service import (
    InvalidQrFormat,
    InvalidQrSignature,
    QrRevoked,
    verify_qr_payload,
)
from backend.security import (
    generate_scanner_session_token,
    hash_secret,
    require_scanner_session,
)

router = APIRouter(prefix="/api/scanner", tags=["scanner"])


class PairRequest(BaseModel):
    scanner_id: str
    pairing_code: str
    device_name: str | None = None


class ScannerInfo(BaseModel):
    id: str
    name: str
    purpose: str
    event_id: str | None = None
    resource_id: str | None = None
    gate_id: str | None = None


class PairResponse(BaseModel):
    scanner_session_token: str
    expires_at: datetime
    scanner: ScannerInfo


def _scanner_info(scanner: Scanner) -> ScannerInfo:
    return ScannerInfo(
        id=str(scanner.id),
        name=scanner.name,
        purpose=scanner.purpose,
        event_id=str(scanner.event_id) if scanner.event_id else None,
        resource_id=str(scanner.resource_id) if scanner.resource_id else None,
        gate_id=scanner.gate_id,
    )


@router.post("/pair", response_model=PairResponse)
def pair_scanner(body: PairRequest, db: Session = Depends(get_db)) -> PairResponse:
    scanner = db.get(Scanner, body.scanner_id)
    if scanner is None or scanner.status != "active":
        raise HTTPException(400, "Invalid scanner")

    code_hash = hash_secret(body.pairing_code)
    now = datetime.now(timezone.utc)
    pairing = (
        db.query(ScannerPairingCode)
        .filter_by(scanner_id=scanner.id, code_hash=code_hash)
        .with_for_update()
        .one_or_none()
    )
    if pairing is None or pairing.used_at is not None or pairing.expires_at < now:
        raise HTTPException(400, "Invalid or expired pairing code")

    pairing.used_at = now
    token, token_hash = generate_scanner_session_token()
    expires_at = now + timedelta(hours=settings.scanner_session_hours)
    db.add(
        ScannerSession(
            scanner_id=scanner.id,
            token_hash=token_hash,
            expires_at=expires_at,
            device_name=body.device_name,
        )
    )
    db.commit()

    return PairResponse(scanner_session_token=token, expires_at=expires_at, scanner=_scanner_info(scanner))


@router.get("/me", response_model=ScannerInfo)
def get_scanner_me(scanner: Scanner = Depends(require_scanner_session)) -> ScannerInfo:
    return _scanner_info(scanner)


class ScanRequest(BaseModel):
    qr_payload: str
    idempotency_key: str


class UserInfo(BaseModel):
    name: str
    photo_url: str | None = None


class TicketInfo(BaseModel):
    ticket_type: str
    entry_count: int
    max_entries: int


class ScanScannerInfo(BaseModel):
    name: str
    purpose: str
    gate_id: str | None = None


class ScanResponse(BaseModel):
    decision: str
    reason: str
    scan_id: str | None = None
    scanner: ScanScannerInfo | None = None
    user: UserInfo | None = None
    ticket: TicketInfo | None = None


def _finish(
    db: Session,
    scanner: Scanner,
    *,
    decision: str,
    reason: str,
    idempotency_key: str,
    build_response: Callable[[str], ScanResponse],
    qr_credential_id=None,
    user_id=None,
    ticket_id=None,
    resource_id=None,
    access_grant_id=None,
) -> ScanResponse:
    log = ScanLog(
        scanner_id=scanner.id,
        qr_credential_id=qr_credential_id,
        user_id=user_id,
        ticket_id=ticket_id,
        resource_id=resource_id,
        access_grant_id=access_grant_id,
        purpose=scanner.purpose,
        event_id=scanner.event_id,
        gate_id=scanner.gate_id,
        decision=decision,
        reason=reason,
        idempotency_key=idempotency_key,
        metadata_json={},
    )
    db.add(log)
    db.flush()
    response = build_response(str(log.id))
    log.metadata_json = response.model_dump(mode="json")
    db.commit()
    return response


def _classify_ticket_rejection(candidates: list[TicketEntitlement], now: datetime) -> str:
    if not candidates:
        return "NO_VALID_TICKET"

    def _otherwise_eligible(t: TicketEntitlement) -> bool:
        return (
            t.status == "active"
            and not (t.valid_from and t.valid_from > now)
            and not (t.valid_until and t.valid_until < now)
        )

    if any(_otherwise_eligible(t) and t.entry_count >= t.max_entries for t in candidates):
        return "ENTRY_LIMIT_REACHED"
    if any(t.status == "active" and t.valid_from and t.valid_from > now for t in candidates):
        return "TICKET_NOT_YET_VALID"
    if any(t.status == "active" and t.valid_until and t.valid_until < now for t in candidates):
        return "TICKET_EXPIRED"
    return "TICKET_CANCELLED"


def _scan_ticket_validation(db, scanner, credential, user, idempotency_key) -> ScanResponse:
    candidates = (
        db.query(TicketEntitlement)
        .join(TicketAssignment, TicketAssignment.ticket_id == TicketEntitlement.id)
        .filter(
            TicketEntitlement.event_id == scanner.event_id,
            TicketAssignment.assigned_to_user_id == user.id,
            TicketAssignment.status == "active",
        )
        .order_by(TicketEntitlement.created_at.asc())
        .with_for_update(of=TicketEntitlement)
        .all()
    )
    now = datetime.now(timezone.utc)
    chosen = next(
        (
            t
            for t in candidates
            if t.status == "active"
            and not (t.valid_from and t.valid_from > now)
            and not (t.valid_until and t.valid_until < now)
            and t.entry_count < t.max_entries
        ),
        None,
    )

    if chosen is None:
        reason = _classify_ticket_rejection(candidates, now)
        return _finish(
            db,
            scanner,
            decision="REJECTED",
            reason=reason,
            idempotency_key=idempotency_key,
            qr_credential_id=credential.id,
            user_id=user.id,
            build_response=lambda scan_id: ScanResponse(
                decision="REJECTED",
                reason=reason,
                scan_id=scan_id,
                user=UserInfo(name=user.display_name, photo_url=user.photo_url),
            ),
        )

    chosen.entry_count += 1
    return _finish(
        db,
        scanner,
        decision="APPROVED",
        reason="VALID_TICKET",
        idempotency_key=idempotency_key,
        qr_credential_id=credential.id,
        user_id=user.id,
        ticket_id=chosen.id,
        build_response=lambda scan_id: ScanResponse(
            decision="APPROVED",
            reason="VALID_TICKET",
            scan_id=scan_id,
            scanner=ScanScannerInfo(name=scanner.name, purpose=scanner.purpose, gate_id=scanner.gate_id),
            user=UserInfo(name=user.display_name, photo_url=user.photo_url),
            ticket=TicketInfo(
                ticket_type=chosen.ticket_type,
                entry_count=chosen.entry_count,
                max_entries=chosen.max_entries,
            ),
        ),
    )


def _scan_identity_verification(db, scanner, credential, user, idempotency_key) -> ScanResponse:
    return _finish(
        db,
        scanner,
        decision="APPROVED",
        reason="IDENTITY_VERIFIED",
        idempotency_key=idempotency_key,
        qr_credential_id=credential.id,
        user_id=user.id,
        build_response=lambda scan_id: ScanResponse(
            decision="APPROVED",
            reason="IDENTITY_VERIFIED",
            scan_id=scan_id,
            scanner=ScanScannerInfo(name=scanner.name, purpose=scanner.purpose, gate_id=scanner.gate_id),
            user=UserInfo(name=user.display_name, photo_url=user.photo_url),
        ),
    )


def _scan_attendance(db, scanner, credential, user, idempotency_key) -> ScanResponse:
    db.add(AttendanceRecord(user_id=user.id, event_id=scanner.event_id, scanner_id=scanner.id))
    try:
        db.flush()
        marked = True
    except IntegrityError:
        db.rollback()
        marked = False

    if marked:
        return _finish(
            db,
            scanner,
            decision="APPROVED",
            reason="ATTENDANCE_MARKED",
            idempotency_key=idempotency_key,
            qr_credential_id=credential.id,
            user_id=user.id,
            build_response=lambda scan_id: ScanResponse(
                decision="APPROVED",
                reason="ATTENDANCE_MARKED",
                scan_id=scan_id,
                scanner=ScanScannerInfo(name=scanner.name, purpose=scanner.purpose, gate_id=scanner.gate_id),
                user=UserInfo(name=user.display_name, photo_url=user.photo_url),
            ),
        )
    return _finish(
        db,
        scanner,
        decision="REJECTED",
        reason="ATTENDANCE_ALREADY_MARKED",
        idempotency_key=idempotency_key,
        qr_credential_id=credential.id,
        user_id=user.id,
        build_response=lambda scan_id: ScanResponse(
            decision="REJECTED",
            reason="ATTENDANCE_ALREADY_MARKED",
            scan_id=scan_id,
            user=UserInfo(name=user.display_name, photo_url=user.photo_url),
        ),
    )


def _scan_access_control(db, scanner, credential, user, idempotency_key) -> ScanResponse:
    now = datetime.now(timezone.utc)
    grant = (
        db.query(AccessGrant)
        .filter(
            AccessGrant.resource_id == scanner.resource_id,
            AccessGrant.user_id == user.id,
            AccessGrant.status == "active",
        )
        .filter((AccessGrant.valid_from.is_(None)) | (AccessGrant.valid_from <= now))
        .filter((AccessGrant.valid_until.is_(None)) | (AccessGrant.valid_until >= now))
        .one_or_none()
    )
    if grant is None:
        return _finish(
            db,
            scanner,
            decision="REJECTED",
            reason="NO_ACCESS_GRANT",
            idempotency_key=idempotency_key,
            qr_credential_id=credential.id,
            user_id=user.id,
            build_response=lambda scan_id: ScanResponse(
                decision="REJECTED",
                reason="NO_ACCESS_GRANT",
                scan_id=scan_id,
                user=UserInfo(name=user.display_name, photo_url=user.photo_url),
            ),
        )
    return _finish(
        db,
        scanner,
        decision="APPROVED",
        reason="ACCESS_GRANTED",
        idempotency_key=idempotency_key,
        qr_credential_id=credential.id,
        user_id=user.id,
        resource_id=scanner.resource_id,
        access_grant_id=grant.id,
        build_response=lambda scan_id: ScanResponse(
            decision="APPROVED",
            reason="ACCESS_GRANTED",
            scan_id=scan_id,
            scanner=ScanScannerInfo(name=scanner.name, purpose=scanner.purpose, gate_id=scanner.gate_id),
            user=UserInfo(name=user.display_name, photo_url=user.photo_url),
        ),
    )


_PURPOSE_HANDLERS = {
    "TICKET_VALIDATION": _scan_ticket_validation,
    "IDENTITY_VERIFICATION": _scan_identity_verification,
    "ATTENDANCE": _scan_attendance,
    "ACCESS_CONTROL": _scan_access_control,
}


@router.post("/scan", response_model=ScanResponse)
def scan(
    body: ScanRequest,
    scanner: Scanner = Depends(require_scanner_session),
    db: Session = Depends(get_db),
) -> ScanResponse:
    existing = (
        db.query(ScanLog)
        .filter_by(scanner_id=scanner.id, idempotency_key=body.idempotency_key)
        .one_or_none()
    )
    if existing is not None:
        return ScanResponse(**existing.metadata_json)

    try:
        credential = verify_qr_payload(db, body.qr_payload)
    except InvalidQrFormat:
        return _finish(
            db, scanner, decision="REJECTED", reason="INVALID_QR_FORMAT",
            idempotency_key=body.idempotency_key,
            build_response=lambda scan_id: ScanResponse(
                decision="REJECTED", reason="INVALID_QR_FORMAT", scan_id=scan_id
            ),
        )
    except InvalidQrSignature:
        return _finish(
            db, scanner, decision="REJECTED", reason="INVALID_QR_SIGNATURE",
            idempotency_key=body.idempotency_key,
            build_response=lambda scan_id: ScanResponse(
                decision="REJECTED", reason="INVALID_QR_SIGNATURE", scan_id=scan_id
            ),
        )
    except QrRevoked:
        return _finish(
            db, scanner, decision="REJECTED", reason="QR_REVOKED",
            idempotency_key=body.idempotency_key,
            build_response=lambda scan_id: ScanResponse(
                decision="REJECTED", reason="QR_REVOKED", scan_id=scan_id
            ),
        )

    user = db.get(User, credential.user_id)
    if user is None:
        return _finish(
            db, scanner, decision="REJECTED", reason="USER_NOT_FOUND",
            idempotency_key=body.idempotency_key, qr_credential_id=credential.id,
            build_response=lambda scan_id: ScanResponse(
                decision="REJECTED", reason="USER_NOT_FOUND", scan_id=scan_id
            ),
        )
    if user.status != "active":
        return _finish(
            db, scanner, decision="REJECTED", reason="USER_INACTIVE",
            idempotency_key=body.idempotency_key, qr_credential_id=credential.id, user_id=user.id,
            build_response=lambda scan_id: ScanResponse(
                decision="REJECTED", reason="USER_INACTIVE", scan_id=scan_id,
                user=UserInfo(name=user.display_name, photo_url=user.photo_url),
            ),
        )

    handler = _PURPOSE_HANDLERS.get(scanner.purpose)
    if handler is None:
        return _finish(
            db, scanner, decision="REJECTED", reason="INTERNAL_ERROR",
            idempotency_key=body.idempotency_key,
            build_response=lambda scan_id: ScanResponse(
                decision="REJECTED", reason="INTERNAL_ERROR", scan_id=scan_id
            ),
        )
    return handler(db, scanner, credential, user, body.idempotency_key)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv\Scripts\python.exe -m pytest tests/test_scanner_pairing.py tests/test_scan_ticket_validation.py tests/test_scan_attendance.py tests/test_scan_access_control.py -v`
Expected: 22 passed

- [ ] **Step 5: Commit**

```bash
git add backend/scanner_routes.py tests/test_scanner_pairing.py tests/test_scan_ticket_validation.py tests/test_scan_attendance.py tests/test_scan_access_control.py
git commit -m "feat(scanner): add scanner pairing and the four-purpose scan endpoint"
```

## Task 8: `tickets_routes.py` — user-facing ticket listing and transfer

**Files:**
- Create: `backend/tickets_routes.py`
- Test: `tests/test_tickets_transfer.py`

**Interfaces:**
- Consumes: `backend.models.{TicketAssignment, TicketEntitlement, TicketTransfer, User}` (Task 2), `backend.security.get_current_user` (Task 4).
- Produces: `backend.tickets_routes.router` (an `APIRouter`, no shared prefix — routes declare full paths `/api/tickets/...` and `/api/transfers/...`) — Task 10 mounts it.

- [ ] **Step 1: Write the failing test**

`tests/test_tickets_transfer.py`:

```python
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.db import get_db
from backend.models import Event, Scanner, ScannerSession, TicketAssignment, TicketEntitlement
from backend.qr_service import get_user_qr_payload
from backend.scanner_routes import router as scanner_router
from backend.security import generate_scanner_session_token, get_current_user
from backend.tickets_routes import router as tickets_router


def _client(db_session, current_user) -> TestClient:
    app = FastAPI()
    app.include_router(tickets_router)
    app.include_router(scanner_router)
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_user] = lambda: current_user
    return TestClient(app)


def _make_event(db_session):
    event = Event(
        organization_name="Org",
        name="Con",
        starts_at=datetime.now(timezone.utc) - timedelta(hours=1),
        ends_at=datetime.now(timezone.utc) + timedelta(hours=5),
    )
    db_session.add(event)
    db_session.flush()
    return event


def _issue_ticket(db_session, event, holder, admin):
    ticket = TicketEntitlement(
        event_id=event.id,
        issued_by_admin_user_id=admin.id,
        source_type="ADMIN_ISSUED",
        ticket_type="GA",
        max_entries=1,
    )
    db_session.add(ticket)
    db_session.flush()
    db_session.add(TicketAssignment(ticket_id=ticket.id, assigned_to_user_id=holder.id))
    db_session.commit()
    return ticket


def _scan_headers(db_session, scanner):
    token, token_hash = generate_scanner_session_token()
    db_session.add(
        ScannerSession(
            scanner_id=scanner.id,
            token_hash=token_hash,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        )
    )
    db_session.commit()
    return {"Authorization": f"Bearer {token}"}


def test_transfer_moves_ticket_and_invalidates_old_holder(db_session, make_user):
    admin = make_user("admin")
    old_holder = make_user("old-holder")
    new_holder = make_user("new-holder")
    event = _make_event(db_session)
    scanner = Scanner(
        name="Gate", organization_name="Org", purpose="TICKET_VALIDATION", event_id=event.id
    )
    db_session.add(scanner)
    db_session.flush()
    ticket = _issue_ticket(db_session, event, old_holder, admin)

    client = _client(db_session, old_holder)
    initiate = client.post(
        f"/api/tickets/{ticket.id}/transfer", json={"recipient_email": new_holder.email}
    )
    assert initiate.status_code == 201
    transfer_id = initiate.json()["transfer_id"]

    client_as_new_holder = _client(db_session, new_holder)
    accept = client_as_new_holder.post(f"/api/transfers/{transfer_id}/accept", json={})
    assert accept.status_code == 200

    scan_headers = _scan_headers(db_session, scanner)
    old_payload = get_user_qr_payload(db_session, old_holder)
    new_payload = get_user_qr_payload(db_session, new_holder)

    old_scan = client.post(
        "/api/scanner/scan",
        json={"qr_payload": old_payload, "idempotency_key": "old-scan"},
        headers=scan_headers,
    )
    assert old_scan.json()["reason"] == "NO_VALID_TICKET"

    new_scan = client.post(
        "/api/scanner/scan",
        json={"qr_payload": new_payload, "idempotency_key": "new-scan"},
        headers=scan_headers,
    )
    assert new_scan.json()["decision"] == "APPROVED"


def test_transfer_blocked_after_entry_consumed(db_session, make_user):
    admin = make_user("admin")
    holder = make_user("holder1")
    recipient = make_user("recipient1")
    event = _make_event(db_session)
    scanner = Scanner(
        name="Gate", organization_name="Org", purpose="TICKET_VALIDATION", event_id=event.id
    )
    db_session.add(scanner)
    db_session.flush()
    ticket = _issue_ticket(db_session, event, holder, admin)

    scan_client = _client(db_session, holder)
    payload = get_user_qr_payload(db_session, holder)
    scan_client.post(
        "/api/scanner/scan",
        json={"qr_payload": payload, "idempotency_key": "consume"},
        headers=_scan_headers(db_session, scanner),
    )

    resp = scan_client.post(
        f"/api/tickets/{ticket.id}/transfer", json={"recipient_email": recipient.email}
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["reason"] == "TRANSFER_BLOCKED_ENTRY_CONSUMED"


def test_transfer_blocked_when_ticket_cancelled(db_session, make_user):
    admin = make_user("admin")
    holder = make_user("holder2")
    recipient = make_user("recipient2")
    event = _make_event(db_session)
    ticket = _issue_ticket(db_session, event, holder, admin)
    ticket.status = "cancelled"
    db_session.commit()

    client = _client(db_session, holder)
    resp = client.post(
        f"/api/tickets/{ticket.id}/transfer", json={"recipient_email": recipient.email}
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["reason"] == "TRANSFER_BLOCKED_TICKET_INACTIVE"


def test_transfer_blocked_when_pending_transfer_exists(db_session, make_user):
    admin = make_user("admin")
    holder = make_user("holder3")
    recipient_a = make_user("recipient3a")
    recipient_b = make_user("recipient3b")
    event = _make_event(db_session)
    ticket = _issue_ticket(db_session, event, holder, admin)

    client = _client(db_session, holder)
    first = client.post(
        f"/api/tickets/{ticket.id}/transfer", json={"recipient_email": recipient_a.email}
    )
    assert first.status_code == 201
    second = client.post(
        f"/api/tickets/{ticket.id}/transfer", json={"recipient_email": recipient_b.email}
    )
    assert second.status_code == 400
    assert second.json()["detail"]["reason"] == "TRANSFER_BLOCKED_PENDING_TRANSFER_EXISTS"


def test_non_holder_cannot_initiate_transfer(db_session, make_user):
    admin = make_user("admin")
    holder = make_user("holder4")
    stranger = make_user("stranger4")
    recipient = make_user("recipient4")
    event = _make_event(db_session)
    ticket = _issue_ticket(db_session, event, holder, admin)

    client = _client(db_session, stranger)
    resp = client.post(
        f"/api/tickets/{ticket.id}/transfer", json={"recipient_email": recipient.email}
    )
    assert resp.status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv\Scripts\python.exe -m pytest tests/test_tickets_transfer.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'backend.tickets_routes'`

- [ ] **Step 3: Write minimal implementation**

`backend/tickets_routes.py`:

```python
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.models import TicketAssignment, TicketEntitlement, TicketTransfer, User
from backend.security import get_current_user

router = APIRouter(tags=["tickets"])

TRANSFER_EXPIRY_HOURS = 72


class TicketSummary(BaseModel):
    ticket_id: str
    event_id: str
    ticket_type: str
    status: str
    entry_count: int
    max_entries: int


@router.get("/api/tickets/me", response_model=list[TicketSummary])
def list_my_tickets(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[TicketSummary]:
    rows = (
        db.query(TicketEntitlement)
        .join(TicketAssignment, TicketAssignment.ticket_id == TicketEntitlement.id)
        .filter(TicketAssignment.assigned_to_user_id == user.id, TicketAssignment.status == "active")
        .all()
    )
    return [
        TicketSummary(
            ticket_id=str(t.id),
            event_id=str(t.event_id),
            ticket_type=t.ticket_type,
            status=t.status,
            entry_count=t.entry_count,
            max_entries=t.max_entries,
        )
        for t in rows
    ]


class TransferRequest(BaseModel):
    recipient_email: str


class TransferResponse(BaseModel):
    transfer_id: str
    status: str


@router.post("/api/tickets/{ticket_id}/transfer", response_model=TransferResponse, status_code=201)
def initiate_transfer(
    ticket_id: str,
    body: TransferRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TransferResponse:
    assignment = (
        db.query(TicketAssignment)
        .filter_by(ticket_id=ticket_id, assigned_to_user_id=user.id, status="active")
        .one_or_none()
    )
    if assignment is None:
        raise HTTPException(404, "You do not hold this ticket")

    ticket = db.query(TicketEntitlement).filter_by(id=ticket_id).with_for_update().one()
    if ticket.entry_count > 0:
        raise HTTPException(400, detail={"reason": "TRANSFER_BLOCKED_ENTRY_CONSUMED"})
    if ticket.status != "active":
        raise HTTPException(400, detail={"reason": "TRANSFER_BLOCKED_TICKET_INACTIVE"})
    existing_pending = (
        db.query(TicketTransfer).filter_by(ticket_id=ticket_id, status="pending").one_or_none()
    )
    if existing_pending is not None:
        raise HTTPException(400, detail={"reason": "TRANSFER_BLOCKED_PENDING_TRANSFER_EXISTS"})

    recipient = (
        db.query(User)
        .filter(func.lower(User.email) == body.recipient_email.lower())
        .one_or_none()
    )
    transfer = TicketTransfer(
        ticket_id=ticket_id,
        from_user_id=user.id,
        to_user_id=recipient.id if recipient else None,
        to_email=body.recipient_email,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=TRANSFER_EXPIRY_HOURS),
    )
    db.add(transfer)
    db.commit()
    db.refresh(transfer)
    return TransferResponse(transfer_id=str(transfer.id), status=transfer.status)


@router.post("/api/transfers/{transfer_id}/accept", response_model=TransferResponse)
def accept_transfer(
    transfer_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TransferResponse:
    transfer = db.get(TicketTransfer, transfer_id)
    if transfer is None or transfer.status != "pending":
        raise HTTPException(404, "Transfer not found or already resolved")
    if transfer.expires_at < datetime.now(timezone.utc):
        transfer.status = "expired"
        db.commit()
        raise HTTPException(400, "Transfer has expired")
    if transfer.to_email.lower() != user.email.lower():
        raise HTTPException(403, "This transfer was not addressed to you")

    old_assignment = (
        db.query(TicketAssignment)
        .filter_by(ticket_id=transfer.ticket_id, status="active")
        .one_or_none()
    )
    if old_assignment is not None:
        old_assignment.status = "ended"
        old_assignment.ended_at = datetime.now(timezone.utc)
        db.flush()

    db.add(
        TicketAssignment(
            ticket_id=transfer.ticket_id, assigned_to_user_id=user.id, transfer_id=transfer.id
        )
    )
    transfer.status = "accepted"
    transfer.to_user_id = user.id
    transfer.accepted_at = datetime.now(timezone.utc)
    db.commit()
    return TransferResponse(transfer_id=str(transfer.id), status=transfer.status)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv\Scripts\python.exe -m pytest tests/test_tickets_transfer.py -v`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add backend/tickets_routes.py tests/test_tickets_transfer.py
git commit -m "feat(scanner): add ticket listing and transfer endpoints"
```

## Task 9: `import_legacy.py` — manual, idempotent legacy ticket importer

**Files:**
- Create: `backend/import_legacy.py`
- Test: `tests/test_import_legacy.py`

**Interfaces:**
- Consumes: `backend.config.settings.legacy_import_database_url` (Task 1), `backend.models.{Event, TicketAssignment, TicketEntitlement, User}` (Task 2). Reads raw `public.events` / `public.tickets` rows via `sqlalchemy.text()` (no ORM models for the legacy tables — per constraint 3, no FKs into `public.*`, and per the existing-facts note, `public.events` columns are `id, title, description, event_type, venue, start_time, end_time, capacity, created_at`; `public.tickets` columns include `id, event_id, category_name, price, attendee_email, status` — the importer only needs the subset listed here). `ticket_status` values `issued`/`checked_in` import as `scanner.ticket_entitlements.status = 'active'`; `cancelled`/`refunded`/`expired` import as `'cancelled'`; `draft`/`available`/`reserved`/`paid` have no real attendee yet and are skipped entirely.
- Produces: `run_import() -> ImportReport` (dataclass with `imported_events: int`, `imported_tickets: int`, `skipped_tickets: list[tuple[str, str]]`), `main()` (CLI entry point). Never imported by any other backend task — this is a leaf, manually invoked only.

- [ ] **Step 1: Write the failing test**

`tests/test_import_legacy.py`:

```python
from sqlalchemy import create_engine, text


def _setup_legacy_tables(engine) -> None:
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS public.tickets"))
        conn.execute(text("DROP TABLE IF EXISTS public.events"))
        conn.execute(
            text(
                "CREATE TABLE public.events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "
                "title text, venue text, start_time timestamptz, end_time timestamptz)"
            )
        )
        conn.execute(
            text(
                "CREATE TABLE public.tickets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "
                "event_id uuid, category_name text, price numeric, attendee_email text, status text)"
            )
        )


def test_import_matches_existing_user_and_skips_unmatched(db_session, make_user):
    from backend.config import settings
    from backend.import_legacy import run_import

    matched_user = make_user("legacy-matched")
    db_session.commit()

    engine = create_engine(settings.legacy_import_database_url)
    _setup_legacy_tables(engine)
    with engine.begin() as conn:
        event_id = conn.execute(
            text(
                "INSERT INTO public.events (title, venue, start_time, end_time) "
                "VALUES ('Legacy Con', 'Old Hall', now() - interval '1 day', now() + interval '1 day') "
                "RETURNING id"
            )
        ).scalar_one()
        conn.execute(
            text(
                "INSERT INTO public.tickets (event_id, category_name, price, attendee_email, status) "
                "VALUES (:event_id, 'GA', 500, :matched_email, 'issued'), "
                "(:event_id, 'GA', 500, 'never-registered@example.com', 'issued')"
            ),
            {"event_id": event_id, "matched_email": matched_user.email},
        )

    report = run_import()

    assert report.imported_events == 1
    assert report.imported_tickets == 1
    assert len(report.skipped_tickets) == 1
    assert "never-registered@example.com" in report.skipped_tickets[0][1]


def test_import_is_idempotent(db_session, make_user):
    from backend.config import settings
    from backend.import_legacy import run_import

    matched_user = make_user("legacy-idempotent")
    db_session.commit()

    engine = create_engine(settings.legacy_import_database_url)
    _setup_legacy_tables(engine)
    with engine.begin() as conn:
        event_id = conn.execute(
            text(
                "INSERT INTO public.events (title, venue, start_time, end_time) "
                "VALUES ('Legacy Con 2', 'Old Hall', now() - interval '1 day', now() + interval '1 day') "
                "RETURNING id"
            )
        ).scalar_one()
        conn.execute(
            text(
                "INSERT INTO public.tickets (event_id, category_name, price, attendee_email, status) "
                "VALUES (:event_id, 'GA', 500, :matched_email, 'issued')"
            ),
            {"event_id": event_id, "matched_email": matched_user.email},
        )

    first = run_import()
    second = run_import()

    assert first.imported_tickets == 1
    assert second.imported_tickets == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv\Scripts\python.exe -m pytest tests/test_import_legacy.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'backend.import_legacy'`

- [ ] **Step 3: Write minimal implementation**

`backend/import_legacy.py`:

```python
"""Manual, idempotent one-off legacy ticket importer.

Run once: .venv\\Scripts\\python.exe -m backend.import_legacy

Never invoked automatically — not on startup, not by Alembic, not in CI
(constraint 10). Matches legacy attendees to existing scanner.users rows by
email; unmatched attendees are skipped and get no entitlement (constraint
11) — never a fabricated purchaser (constraint 15).
"""
from dataclasses import dataclass, field

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from backend.config import settings
from backend.models import Event, TicketAssignment, TicketEntitlement, User

_IMPORTABLE_ACTIVE_STATUSES = {"issued", "checked_in"}
_IMPORTABLE_CANCELLED_STATUSES = {"cancelled", "refunded", "expired"}


@dataclass
class ImportReport:
    imported_events: int = 0
    imported_tickets: int = 0
    skipped_tickets: list[tuple[str, str]] = field(default_factory=list)


def _ensure_scanner_event(db: Session, legacy_event) -> Event:
    existing = db.query(Event).filter_by(legacy_event_id=str(legacy_event.id)).one_or_none()
    if existing is not None:
        return existing
    event = Event(
        organization_name="Legacy Import",
        name=legacy_event.title,
        starts_at=legacy_event.start_time,
        ends_at=legacy_event.end_time,
        venue=legacy_event.venue,
        legacy_event_id=str(legacy_event.id),
    )
    db.add(event)
    db.flush()
    return event


def run_import() -> ImportReport:
    engine = create_engine(settings.legacy_import_database_url)
    report = ImportReport()

    with Session(engine) as db:
        legacy_events = db.execute(
            text("SELECT id, title, venue, start_time, end_time FROM public.events")
        ).all()
        scanner_event_by_legacy_id = {}
        for legacy_event in legacy_events:
            scanner_event_by_legacy_id[str(legacy_event.id)] = _ensure_scanner_event(db, legacy_event)
            report.imported_events += 1
        db.commit()

        legacy_tickets = db.execute(
            text(
                "SELECT id, event_id, category_name, price, attendee_email, status "
                "FROM public.tickets"
            )
        ).all()

        for legacy_ticket in legacy_tickets:
            legacy_ticket_id = str(legacy_ticket.id)
            already_imported = (
                db.query(TicketEntitlement).filter_by(legacy_ticket_id=legacy_ticket_id).one_or_none()
            )
            if already_imported is not None:
                continue

            if (
                legacy_ticket.status not in _IMPORTABLE_ACTIVE_STATUSES
                and legacy_ticket.status not in _IMPORTABLE_CANCELLED_STATUSES
            ):
                report.skipped_tickets.append(
                    (legacy_ticket_id, f"pre-issuance status '{legacy_ticket.status}', no attendee yet")
                )
                continue

            matched_user = (
                db.query(User).filter(User.email.ilike(legacy_ticket.attendee_email)).one_or_none()
            )
            if matched_user is None:
                report.skipped_tickets.append(
                    (legacy_ticket_id, f"no GatePass account for {legacy_ticket.attendee_email}")
                )
                continue

            scanner_event = scanner_event_by_legacy_id.get(str(legacy_ticket.event_id))
            if scanner_event is None:
                report.skipped_tickets.append((legacy_ticket_id, "parent event not found/imported"))
                continue

            entitlement = TicketEntitlement(
                event_id=scanner_event.id,
                purchased_by_user_id=matched_user.id,
                source_type="LEGACY_IMPORT",
                source_reference=f"legacy_ticket:{legacy_ticket_id}",
                ticket_type=legacy_ticket.category_name,
                status="cancelled" if legacy_ticket.status in _IMPORTABLE_CANCELLED_STATUSES else "active",
                max_entries=1,
                legacy_ticket_id=legacy_ticket_id,
            )
            db.add(entitlement)
            db.flush()
            db.add(TicketAssignment(ticket_id=entitlement.id, assigned_to_user_id=matched_user.id))
            report.imported_tickets += 1

        db.commit()

    return report


def main() -> None:
    report = run_import()
    print(f"Imported events: {report.imported_events}")
    print(f"Imported tickets: {report.imported_tickets}")
    print(f"Skipped tickets: {len(report.skipped_tickets)}")
    for legacy_ticket_id, reason in report.skipped_tickets:
        print(f"  - {legacy_ticket_id}: {reason}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv\Scripts\python.exe -m pytest tests/test_import_legacy.py -v`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add backend/import_legacy.py tests/test_import_legacy.py
git commit -m "feat(scanner): add manual idempotent legacy ticket importer"
```

## Task 10: Wire routers into `main.py`; add `backend:dev` script

**Files:**
- Modify: `backend/main.py` (created in Task 1 with only a health check)
- Modify: `package.json` (add one script — original ask specifies its exact content; every existing script stays untouched)
- Test: `tests/test_main_app.py`

**Interfaces:**
- Consumes: every router produced by Tasks 5–8.
- Produces: the fully-wired `backend.main.app`. This is the app `uvicorn backend.main:app` serves.

- [ ] **Step 1: Write the failing test**

`tests/test_main_app.py`:

```python
from fastapi.testclient import TestClient

from backend.main import app


def test_health_check():
    client = TestClient(app)
    resp = client.get("/api/scanner-health")
    assert resp.status_code == 200


def test_all_routers_are_mounted():
    paths = {route.path for route in app.routes}
    assert "/api/qr/me" in paths
    assert "/api/admin/scanners" in paths
    assert "/api/scanner/scan" in paths
    assert "/api/tickets/{ticket_id}/transfer" in paths


def test_scan_endpoint_requires_scanner_session():
    client = TestClient(app)
    resp = client.post(
        "/api/scanner/scan", json={"qr_payload": "gp:v1:x.y", "idempotency_key": "k"}
    )
    assert resp.status_code == 401
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv\Scripts\python.exe -m pytest tests/test_main_app.py -v`
Expected: FAIL — `/api/qr/me` (and the other router paths) are missing from `app.routes` because `main.py` doesn't mount them yet.

- [ ] **Step 3: Write minimal implementation**

`backend/main.py` (full replacement):

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.admin_routes import router as admin_router
from backend.config import settings
from backend.qr_routes import router as qr_router
from backend.scanner_routes import router as scanner_router
from backend.tickets_routes import router as tickets_router

app = FastAPI(title="GatePass Scanner")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.public_app_url],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(qr_router)
app.include_router(admin_router)
app.include_router(scanner_router)
app.include_router(tickets_router)


@app.get("/api/scanner-health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

In `package.json`, add this one entry to the existing `"scripts"` object (every other script — `dev`, `server:dev`, `dev:full`, `build`, `build:server`, `build:full`, `start`, `preview`, `clean`, `lint`, `test:api` — stays exactly as-is):

```json
    "backend:dev": ".venv\\Scripts\\python.exe -m uvicorn backend.main:app --reload --reload-dir backend --reload-dir db --host 127.0.0.1 --port 8010",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv\Scripts\python.exe -m pytest tests/test_main_app.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add backend/main.py package.json tests/test_main_app.py
git commit -m "feat(scanner): wire all routers into the FastAPI app; add backend:dev script"
```

## Task 11: Frontend scanner feature — `src/features/scanner/`

**Files:**
- Create: `src/features/scanner/scannerSession.ts`
- Create: `src/features/scanner/api.ts`
- Create: `src/features/scanner/PairScannerPage.tsx`
- Create: `src/features/scanner/GatePassScannerPage.tsx`
- Create: `src/features/scanner/ScannerResult.tsx`

**Interfaces:**
- Produces: `saveScannerSessionToken`, `getScannerSessionToken`, `clearScannerSession` (from `scannerSession.ts`); `pairScanner`, `getScannerConfig`, `submitScan`, `ScannerSessionExpiredError`, and types `ScannerInfo`/`ScanResponse` (from `api.ts`); default-exported `PairScannerPage`, `GatePassScannerPage` components, and `ScannerResult` component. Task 12 imports `PairScannerPage` and `GatePassScannerPage` into `src/App.tsx`.

No new UI kit — this mirrors the existing project's plain-Tailwind styling (no `src/components/ui/*` fancy components are needed for a kiosk scanning screen) and the existing `src/api.ts` fetch pattern (own base URL env var, `sessionStorage`-backed token), to keep this feature's bundle weight and visual surface minimal. Per the round-2 spec note, the plaintext scanner session token is never logged and never put in a Vite-embedded constant — it only ever lives in `sessionStorage` behind `scannerSession.ts`.

This task has no automated tests (the project has no frontend test framework — see the "Existing project facts" section above); its verification step is TypeScript compiling cleanly, and Task 13 covers manual browser verification of the full flow.

- [ ] **Step 1: Add the new npm dependency**

Run: `npm install @zxing/browser`
Expected: `@zxing/browser` appears under `"dependencies"` in `package.json` and `package-lock.json` updates. No other dependency changes.

- [ ] **Step 2: Write `scannerSession.ts`**

```typescript
const STORAGE_KEY = "gatepass_scanner_session_token";

export function saveScannerSessionToken(token: string): void {
  sessionStorage.setItem(STORAGE_KEY, token);
}

export function getScannerSessionToken(): string | null {
  return sessionStorage.getItem(STORAGE_KEY);
}

export function clearScannerSession(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
```

- [ ] **Step 3: Write `api.ts`**

```typescript
import { clearScannerSession, getScannerSessionToken, saveScannerSessionToken } from "./scannerSession";

const SCANNER_API_BASE_URL = (import.meta.env.VITE_SCANNER_API_BASE_URL ?? "").replace(/\/$/, "");

export interface ScannerInfo {
  id: string;
  name: string;
  purpose: string;
  event_id: string | null;
  resource_id: string | null;
  gate_id: string | null;
}

interface PairResponse {
  scanner_session_token: string;
  expires_at: string;
  scanner: ScannerInfo;
}

export interface ScanResponse {
  decision: "APPROVED" | "REJECTED";
  reason: string;
  scan_id: string | null;
  scanner?: { name: string; purpose: string; gate_id: string | null };
  user?: { name: string; photo_url: string | null };
  ticket?: { ticket_type: string; entry_count: number; max_entries: number };
}

export class ScannerSessionExpiredError extends Error {}

export async function pairScanner(
  scannerId: string,
  pairingCode: string,
  deviceName: string,
): Promise<ScannerInfo> {
  const response = await fetch(`${SCANNER_API_BASE_URL}/api/scanner/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scanner_id: scannerId, pairing_code: pairingCode, device_name: deviceName }),
  });
  if (!response.ok) {
    throw new Error("Invalid scanner ID or pairing code");
  }
  const data = (await response.json()) as PairResponse;
  saveScannerSessionToken(data.scanner_session_token);
  return data.scanner;
}

export async function getScannerConfig(): Promise<ScannerInfo> {
  const token = getScannerSessionToken();
  if (!token) {
    throw new ScannerSessionExpiredError("No scanner session");
  }
  const response = await fetch(`${SCANNER_API_BASE_URL}/api/scanner/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401 || response.status === 403) {
    clearScannerSession();
    throw new ScannerSessionExpiredError("Scanner session expired or revoked");
  }
  if (!response.ok) {
    throw new Error(`Failed to load scanner config: ${response.status}`);
  }
  return (await response.json()) as ScannerInfo;
}

export async function submitScan(qrPayload: string, idempotencyKey: string): Promise<ScanResponse> {
  const token = getScannerSessionToken();
  if (!token) {
    throw new ScannerSessionExpiredError("No scanner session");
  }
  const response = await fetch(`${SCANNER_API_BASE_URL}/api/scanner/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ qr_payload: qrPayload, idempotency_key: idempotencyKey }),
  });
  if (response.status === 401 || response.status === 403) {
    clearScannerSession();
    throw new ScannerSessionExpiredError("Scanner session expired or revoked");
  }
  return (await response.json()) as ScanResponse;
}
```

- [ ] **Step 4: Write `ScannerResult.tsx`**

```tsx
import type { ScanResponse } from "./api";

export default function ScannerResult({
  result,
  onDismiss,
}: {
  result: ScanResponse;
  onDismiss: () => void;
}) {
  const approved = result.decision === "APPROVED";
  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 text-white ${
        approved ? "bg-emerald-600" : "bg-red-600"
      }`}
      onClick={onDismiss}
    >
      <p className="text-5xl font-bold">{result.decision}</p>
      {result.user && <p className="text-xl font-medium">{result.user.name}</p>}
      {result.ticket && (
        <p className="text-sm opacity-90">
          {result.ticket.ticket_type} · entry {result.ticket.entry_count}/{result.ticket.max_entries}
        </p>
      )}
      <p className="text-sm opacity-80">{result.reason.replaceAll("_", " ")}</p>
    </div>
  );
}
```

- [ ] **Step 5: Write `PairScannerPage.tsx`**

```tsx
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { pairScanner } from "./api";

export default function PairScannerPage() {
  const navigate = useNavigate();
  const [scannerId, setScannerId] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPairing, setIsPairing] = useState(false);

  async function handlePair(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsPairing(true);
    try {
      await pairScanner(scannerId.trim(), pairingCode.trim(), deviceName.trim() || "Unnamed device");
      navigate("/gatepass-scanner");
    } catch {
      setError("Could not pair — check the scanner ID and pairing code, then try again.");
    } finally {
      setIsPairing(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 px-4">
      <form onSubmit={handlePair} className="w-full max-w-sm bg-neutral-900 rounded-2xl p-6 space-y-4 text-white">
        <h1 className="text-lg font-semibold">Pair this device</h1>
        <div className="space-y-1">
          <label className="text-sm text-neutral-400">Scanner ID</label>
          <input
            value={scannerId}
            onChange={(e) => setScannerId(e.target.value)}
            className="w-full rounded-lg bg-neutral-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-neutral-400">Pairing code</label>
          <input
            value={pairingCode}
            onChange={(e) => setPairingCode(e.target.value)}
            className="w-full rounded-lg bg-neutral-800 px-3 py-2 text-sm tracking-widest outline-none focus:ring-2 focus:ring-emerald-500"
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-neutral-400">Device name (optional)</label>
          <input
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            className="w-full rounded-lg bg-neutral-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={isPairing}
          className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-medium disabled:opacity-50"
        >
          {isPairing ? "Pairing…" : "Pair device"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 6: Write `GatePassScannerPage.tsx`**

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { getScannerConfig, submitScan, ScannerSessionExpiredError, type ScannerInfo, type ScanResponse } from "./api";
import ScannerResult from "./ScannerResult";

export default function GatePassScannerPage() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const busyRef = useRef(false);
  const [config, setConfig] = useState<ScannerInfo | null>(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [result, setResult] = useState<ScanResponse | null>(null);

  useEffect(() => {
    getScannerConfig()
      .then(setConfig)
      .catch(() => navigate("/gatepass-scanner/pair"));
  }, [navigate]);

  const handleDecoded = useCallback(
    async (text: string) => {
      if (busyRef.current) return;
      if (!text.startsWith("gp:v1:")) {
        setResult({ decision: "REJECTED", reason: "INVALID_QR_FORMAT", scan_id: null });
        return;
      }
      busyRef.current = true;
      try {
        const idempotencyKey = crypto.randomUUID();
        const response = await submitScan(text, idempotencyKey);
        setResult(response);
        if (navigator.vibrate) {
          navigator.vibrate(response.decision === "APPROVED" ? 80 : [80, 60, 80]);
        }
      } catch (err) {
        if (err instanceof ScannerSessionExpiredError) {
          navigate("/gatepass-scanner/pair");
          return;
        }
        setResult({ decision: "REJECTED", reason: "INTERNAL_ERROR", scan_id: null });
      } finally {
        setTimeout(() => {
          busyRef.current = false;
          setResult(null);
        }, 2500);
      }
    },
    [navigate],
  );

  async function startCamera() {
    if (!videoRef.current) return;
    const reader = new BrowserQRCodeReader();
    const devices = await BrowserQRCodeReader.listVideoInputDevices();
    const rearCamera = devices.find((d) => /back|rear|environment/i.test(d.label)) ?? devices[0];
    controlsRef.current = await reader.decodeFromVideoDevice(rearCamera?.deviceId, videoRef.current, (scanResult) => {
      if (scanResult) handleDecoded(scanResult.getText());
    });
    setIsCameraOn(true);
  }

  function stopCamera() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setIsCameraOn(false);
  }

  useEffect(() => () => controlsRef.current?.stop(), []);

  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-white">
        Loading scanner configuration…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      <header className="p-4 border-b border-neutral-800 flex items-center justify-between">
        <div>
          <h1 className="font-semibold">{config.name}</h1>
          <p className="text-xs text-neutral-400">
            {config.purpose}
            {config.gate_id ? ` · ${config.gate_id}` : ""}
          </p>
        </div>
        <span className="text-xs text-emerald-400">Paired</span>
      </header>

      <main className="flex-1 relative flex items-center justify-center">
        <video ref={videoRef} className="w-full max-w-md rounded-xl" muted playsInline />
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="w-56 h-56 border-2 border-emerald-400/70 rounded-2xl" />
        </div>
      </main>

      <div className="p-4 flex justify-center gap-3">
        {isCameraOn ? (
          <button onClick={stopCamera} className="px-4 py-2 rounded-lg bg-neutral-800 text-sm">
            Stop camera
          </button>
        ) : (
          <button onClick={startCamera} className="px-4 py-2 rounded-lg bg-emerald-600 text-sm">
            Start camera
          </button>
        )}
        <button onClick={() => setResult(null)} className="px-4 py-2 rounded-lg bg-neutral-800 text-sm">
          Reset
        </button>
      </div>

      {result && <ScannerResult result={result} onDismiss={() => setResult(null)} />}
    </div>
  );
}
```

- [ ] **Step 7: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no new errors originating from `src/features/scanner/*` (pre-existing errors elsewhere, if any, are out of scope for this task).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/features/scanner
git commit -m "feat(scanner): add dedicated scanner pairing and scanning UI"
```

## Task 12: Wire the new routes into `src/App.tsx`; add env var placeholders

**Files:**
- Modify: `src/App.tsx:21-28` (imports), `src/App.tsx:1094-1107` (`<Routes>` block)
- Modify: `.env.example`
- Modify: `.env` (append only — every existing line stays untouched)

**Interfaces:**
- Consumes: `PairScannerPage`, `GatePassScannerPage` (Task 11).

The existing `/scanner` route (`src/App.tsx:1094-1104`, rendering `QRScannerSimulation` from `src/pages/Scanner.tsx`) is a different, pre-existing feature — an in-app organizer-perspective ticket-scan simulation driven by local component state. **Do not touch it.** The new dedicated scanner device app is added at `/gatepass-scanner` and `/gatepass-scanner/pair` specifically to avoid colliding with it.

- [ ] **Step 1: Add the two new imports**

In `src/App.tsx`, after the existing page imports (currently lines 21–28):

```tsx
import IdentityCard from "./pages/Profile";
import RequestAccessForm from "./pages/RequestAccess";
import ApprovalsInvites from "./pages/Approvals";
import WalletSync from "./pages/Wallet";
import QRScannerSimulation from "./pages/Scanner";
import OrganizerWorkspace from "./pages/Organizer";
import AttendeeEventsList from "./pages/Events";
import HomeUpdates from "./pages/Home";
```

becomes:

```tsx
import IdentityCard from "./pages/Profile";
import RequestAccessForm from "./pages/RequestAccess";
import ApprovalsInvites from "./pages/Approvals";
import WalletSync from "./pages/Wallet";
import QRScannerSimulation from "./pages/Scanner";
import OrganizerWorkspace from "./pages/Organizer";
import AttendeeEventsList from "./pages/Events";
import HomeUpdates from "./pages/Home";
import PairScannerPage from "./features/scanner/PairScannerPage";
import GatePassScannerPage from "./features/scanner/GatePassScannerPage";
```

- [ ] **Step 2: Add the two new routes**

In `src/App.tsx`, the existing `/scanner` route is immediately followed by the catch-all (currently around lines 1094–1107):

```tsx
          <Route 
            path="/scanner" 
            element={
              <QRScannerSimulation 
                tickets={tickets}
                events={events}
                scanLogs={scanLogs}
                onLogScan={handleLogScan}
              />
            } 
          />
          {/* Catch-all redirect to / */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
```

becomes:

```tsx
          <Route 
            path="/scanner" 
            element={
              <QRScannerSimulation 
                tickets={tickets}
                events={events}
                scanLogs={scanLogs}
                onLogScan={handleLogScan}
              />
            } 
          />
          <Route path="/gatepass-scanner" element={<GatePassScannerPage />} />
          <Route path="/gatepass-scanner/pair" element={<PairScannerPage />} />
          {/* Catch-all redirect to / */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
```

- [ ] **Step 3: Add the frontend env var to `.env.example`**

Append to `.env.example` (existing lines unchanged):

```
VITE_SCANNER_API_BASE_URL="http://127.0.0.1:8010"
```

- [ ] **Step 4: Append backend env var placeholders to `.env`**

Append to `.env` (existing lines unchanged — these values cannot be generated automatically; fill them in before running the backend, see Task 13):

```
VITE_SCANNER_API_BASE_URL=http://127.0.0.1:8010
GATEPASS_QR_SIGNING_KEY=REPLACE_WITH_32PLUS_CHAR_RANDOM_SECRET
GATEPASS_PUBLIC_APP_URL=http://localhost:5173
GATEPASS_SCANNER_SESSION_HOURS=12
GATEPASS_SCANNER_PAIRING_MINUTES=10
GATEPASS_GOOGLE_CLIENT_ID=REPLACE_WITH_GOOGLE_OAUTH_CLIENT_ID
GATEPASS_ADMIN_EMAILS=REPLACE_WITH_COMMA_SEPARATED_ADMIN_EMAILS
SCANNER_DATABASE_URL=REPLACE_WITH_NEON_CONNECTION_STRING_FOR_gatepass_scanner_app
SCANNER_MIGRATIONS_DATABASE_URL=REPLACE_WITH_NEON_CONNECTION_STRING_FOR_gatepass_scanner_migrator
LEGACY_IMPORT_DATABASE_URL=REPLACE_WITH_NEON_CONNECTION_STRING_FOR_gatepass_legacy_importer
```

Generate the signing key with:

```bash
.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(32))"
```

- [ ] **Step 5: Verify TypeScript compiles and the dev server starts**

Run: `npx tsc --noEmit`
Expected: no new errors from `src/App.tsx`.

Run: `npm run dev` (leave running briefly, then stop it) — confirm no Vite startup errors, then stop the server. Full end-to-end browser verification of the paired flow happens in Task 13, once real `.env` values are in place.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx .env.example .env
git commit -m "feat(scanner): wire scanner device routes into the app router"
```

## Task 13: Final validation

**Files:** none created or modified — this task only runs checks.

- [ ] **Step 1: Full backend test suite**

```bash
psql "postgresql://postgres:postgres@localhost:5432/postgres" -c "CREATE DATABASE gatepass_scanner_test" 2>NUL
.venv\Scripts\python.exe -m pytest tests -v
```

Expected: every test from Tasks 1–10 passes (roughly 45+ tests across `test_config`, `test_schema_smoke`, `test_security`, `test_qr_service`, `test_admin_routes`, `test_scanner_pairing`, `test_scan_ticket_validation`, `test_scan_attendance`, `test_scan_access_control`, `test_tickets_transfer`, `test_import_legacy`, `test_main_app`).

- [ ] **Step 2: Frontend checks**

```bash
npm install
npm run lint
npx tsc --noEmit
npm run build
```

Expected: all four succeed. `npm run lint` is `tsc --noEmit` per the existing `package.json` — expect it to pass for the same reason Task 12's step 5 passed.

- [ ] **Step 3: Manual Neon setup (cannot be automated — requires real credentials this plan's author does not have)**

1. In the Neon console (or via `psql` with the project's superuser/owner connection string), run `sql/scanner_roles.sql` after replacing the three `CHANGE_ME_*` passwords with real generated secrets.
2. Build the three real `postgresql://` connection strings (host/port/dbname from the Neon project, one per role) and put them in `.env` as `SCANNER_DATABASE_URL`, `SCANNER_MIGRATIONS_DATABASE_URL`, `LEGACY_IMPORT_DATABASE_URL`, replacing the `REPLACE_WITH_*` placeholders from Task 12.
3. Fill in `GATEPASS_QR_SIGNING_KEY` (generated in Task 12), `GATEPASS_GOOGLE_CLIENT_ID` (the existing Google OAuth client already used by `VITE_GOOGLE_CLIENT_ID`, if there is one — otherwise create one in Google Cloud Console), and `GATEPASS_ADMIN_EMAILS`.
4. Verify constraint 1 is actually enforced, not just documented: `psql "<the gatepass_scanner_app connection string>" -c "SELECT 1 FROM public.events LIMIT 1"` must fail with a permission-denied error.

- [ ] **Step 4: Apply the migration to the real Neon database**

```bash
.venv\Scripts\python.exe -m alembic check
.venv\Scripts\python.exe -m alembic upgrade head
```

Expected: `alembic check` reports no pending model changes (the migration in Task 3 matches `backend/models.py` exactly), and `upgrade head` creates the `scanner` schema and all thirteen tables in Neon.

- [ ] **Step 5: Start the backend and confirm it serves**

```bash
.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --reload-dir backend --reload-dir db --host 127.0.0.1 --port 8010
```

Open `http://localhost:8010/docs` and confirm all routes from Tasks 5–8 (`/api/qr/*`, `/api/admin/*`, `/api/scanner/*`, `/api/tickets/*`, `/api/transfers/*`) appear in the OpenAPI UI.

- [ ] **Step 6: Start the full application and manually verify the paired flow**

```bash
npm run dev:full
```

With the backend from Step 5 also running:
1. Use `curl` (or the `/docs` UI) with a valid Google ID token and an admin email in `GATEPASS_ADMIN_EMAILS` to `POST /api/admin/events`, then `POST /api/admin/scanners` with `purpose: "TICKET_VALIDATION"` and that `event_id` — note the returned `pairing_code`.
2. Open `http://localhost:5173/gatepass-scanner/pair` in a browser, enter the scanner ID and pairing code, and confirm it redirects to `/gatepass-scanner` showing the scanner's name/purpose.
3. Confirm the existing `/scanner` route (organizer-perspective simulation) still renders exactly as before — untouched by this feature.
4. Stop the camera, restart it, and confirm the visible scanning frame and rear-camera preference work on a phone or webcam.

- [ ] **Step 7: Report results**

Summarize, for the user: which of Steps 1–6 actually ran and passed versus which were blocked on missing real credentials (Neon roles, Google OAuth client). Do not report a step as passing unless it was actually executed.

---

## Summary of what this plan does not attempt

- Does not modify `server/store.ts`, `db/postgres18_schema.sql`, or any `public.*` table — the scanner feature reads `public.events`/`public.tickets` only once, manually, via `backend/import_legacy.py`, and never at request time.
- Does not touch the existing `/scanner` organizer-perspective simulation (`src/pages/Scanner.tsx`).
- Does not implement a payment webhook — ticket issuance is admin-only (`POST /api/admin/tickets`), per constraint 9.
- Does not support pre-issuing a ticket to someone who has never logged into GatePass — `issue_ticket` requires an existing `scanner.users` row (see the MVP limitation noted in the spec and in Task 6).
- Does not provision real Neon roles or connection strings — `sql/scanner_roles.sql` is written and ready, but running it against the real database requires credentials this plan's author does not have (Task 13, Step 3).













