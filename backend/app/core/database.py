import logging
import os
import re
import uuid
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import String, TypeDecorator, create_engine, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import declarative_base, sessionmaker

logger = logging.getLogger(__name__)

# Dynamically find the backend root directory (where .env lives)
BASE_DIR = Path(__file__).resolve().parent.parent.parent
ENV_PATH = BASE_DIR / ".env"
load_dotenv(dotenv_path=ENV_PATH, override=True)

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError(f"DATABASE_URL is missing or empty. Looking for .env at: {ENV_PATH}")

DATABASE_URL = DATABASE_URL.strip().strip("'\"")

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)


def _normalize_supabase_pooler_url(url: str) -> str:
    """
    If a direct Supabase IPv6 URL (postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres)
    is provided, convert it to the IPv4-compatible Supabase Supavisor Session Pooler URL
    so PostgreSQL connects reliably over IPv4 networks without ever falling back to SQLite.
    """
    m = re.match(r"^(postgresql(?:\+\w+)?://)postgres:([^@]+)@db\.([a-z0-9]+)\.supabase\.co(?::\d+)?(/.*)$", url)
    if not m:
        return url
    scheme, password, project_ref, path = m.groups()
    pooler_region = os.getenv("SUPABASE_POOLER_HOST", "aws-1-eu-central-1.pooler.supabase.com")
    return f"{scheme}postgres.{project_ref}:{password}@{pooler_region}:5432{path}"


def create_postgres_engine(url: str):
    connect_args = {"connect_timeout": 10}
    engine_kwargs = {
        "pool_pre_ping": True,
        "pool_recycle": 300,
    }
    normalized_url = _normalize_supabase_pooler_url(url)
    eng = create_engine(normalized_url, connect_args=connect_args, **engine_kwargs)
    logger.info(f"Configured Supabase PostgreSQL engine: {normalized_url.split('@')[-1]}")
    return eng, normalized_url


engine, ACTIVE_DATABASE_URL = create_postgres_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
fallback_engine = engine
FallbackSessionLocal = SessionLocal
Base = declarative_base()


class GUID(TypeDecorator):
    """Platform-independent GUID/UUID type for PostgreSQL UUID columns."""
    impl = String(36)
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_UUID(as_uuid=True))
        return dialect.type_descriptor(String(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if dialect.name == "postgresql":
            if isinstance(value, uuid.UUID):
                return value
            return uuid.UUID(str(value))
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, uuid.UUID):
            return value
        try:
            return uuid.UUID(str(value))
        except (ValueError, AttributeError):
            return value


def get_db():
    """
    Yields a Supabase PostgreSQL database session.
    Uses pool_pre_ping=True so stale connections are automatically recycled.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
