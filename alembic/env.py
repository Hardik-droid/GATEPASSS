import os
import sys
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool, text

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
