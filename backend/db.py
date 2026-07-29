from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool

from backend.config import settings

# NullPool: the connection string targets Neon's `-pooler` (PgBouncer) endpoint,
# which already pools server-side. A client-side pool on top of it would pin
# idle Postgres connections per serverless instance and exhaust the limit as
# instances scale out.
engine = create_engine(settings.scanner_database_url, poolclass=NullPool)
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