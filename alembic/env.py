import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from alembic import context
from sqlalchemy import engine_from_config, pool, text

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Load .env BEFORE reading SCANNER_MIGRATIONS_DATABASE_URL so the .env file
# wins over variables inherited from the parent process/shell environment.
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)

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
# A bare "postgresql://" (e.g. pasted straight from Neon's dashboard) makes
# SQLAlchemy default to psycopg2, which this project does not install — it
# uses psycopg (v3), per backend/requirements.txt. Force the driver rather
# than trust every place this env var gets set to already say +psycopg.
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+psycopg://", 1)
config.set_main_option("sqlalchemy.url", db_url)

target_metadata = Base.metadata


def include_name(name, type_, parent_names):
    # This Alembic env owns ONLY the scanner schema. Ignore public.* (the
    # legacy Node/orphan gp_* tables live there) so autogenerate/check never
    # proposes dropping them.
    if type_ == "schema":
        return name == "scanner"
    return True


def run_migrations_offline() -> None:
    context.configure(
        url=db_url,
        target_metadata=target_metadata,
        version_table_schema="scanner",
        include_schemas=True,
        include_name=include_name,
        compare_type=False,
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
        # The version table lives in the scanner schema, so the schema must
        # exist before Alembic tries to create/read it.
        connection.execute(text("CREATE SCHEMA IF NOT EXISTS scanner"))
        connection.commit()
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            version_table_schema="scanner",
            include_schemas=True,
            include_name=include_name,
            compare_type=False,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
