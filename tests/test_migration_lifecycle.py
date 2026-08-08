import importlib.util
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory


ROOT = Path(__file__).resolve().parents[1]
VERSIONS = ROOT / "alembic" / "versions"


def _load(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, VERSIONS / filename)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_blank_database_bootstraps_public_tables_before_sync_triggers(monkeypatch):
    migration = _load("migration_0002", "0002_cleanup_legacy_and_sync.py")
    statements: list[str] = []
    monkeypatch.setattr(migration.op, "execute", lambda sql: statements.append(str(sql)))
    monkeypatch.setattr(migration.op, "create_table", lambda *args, **kwargs: None)

    migration.upgrade()

    public_schema = statements[0]
    assert "CREATE TABLE IF NOT EXISTS events" in public_schema
    assert "CREATE TABLE IF NOT EXISTS tickets" in public_schema
    event_trigger = next(i for i, sql in enumerate(statements) if "trg_sync_event_to_scanner" in sql)
    ticket_trigger = next(i for i, sql in enumerate(statements) if "trg_sync_ticket_to_scanner" in sql)
    assert event_trigger > 0
    assert ticket_trigger > 0


def test_live_revision_chain_keeps_0003_and_advances_to_checkout_head():
    config = Config(str(ROOT / "alembic.ini"))
    scripts = ScriptDirectory.from_config(config)
    public_schema = _load("migration_0003", "0003_public_schema.py")
    checkout = _load("migration_0004", "0004_ticket_checkout.py")

    assert public_schema.revision == "0003_public_schema"
    assert public_schema.down_revision == "0002_cleanup_legacy_and_sync"
    assert checkout.revision == "0004_ticket_checkout"
    assert checkout.down_revision == public_schema.revision
    assert scripts.get_current_head() == checkout.revision


def test_checkout_migration_creates_durable_operations_and_reservations(monkeypatch):
    migration = _load("migration_0004_tables", "0004_ticket_checkout.py")
    tables: list[str] = []
    monkeypatch.setattr(migration.op, "create_table", lambda name, *args, **kwargs: tables.append(name))
    monkeypatch.setattr(migration.op, "create_index", lambda *args, **kwargs: None)
    monkeypatch.setattr(migration.op, "execute", lambda *args, **kwargs: None)

    migration.upgrade()

    assert tables == ["checkout_operations", "checkout_reservations"]


def test_historical_migrations_do_not_read_mutable_schema_files():
    migration_0002 = (VERSIONS / "0002_cleanup_legacy_and_sync.py").read_text(encoding="utf-8")
    migration_0003 = (VERSIONS / "0003_public_schema.py").read_text(encoding="utf-8")

    assert "postgres18_schema.sql" not in migration_0002
    assert "postgres18_schema.sql" not in migration_0003
    assert "CREATE TABLE IF NOT EXISTS tickets" in migration_0002
