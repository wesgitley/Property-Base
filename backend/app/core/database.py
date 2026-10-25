import logging
import os
import uuid
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import String, TypeDecorator, create_engine, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import declarative_base, sessionmaker

logger = logging.getLogger(__name__)

# Dynamically find the backend root directory (where .env lives)
BASE_DIR = Path(__file__).resolve().parent.parent.parent
ENV_PATH = BASE_DIR / ".env"
load_dotenv(dotenv_path=ENV_PATH, override=True)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./propertybase.db")
DATABASE_URL = DATABASE_URL.strip().strip("'\"")

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

FALLBACK_SQLITE_URL = "sqlite:///./propertybase.db"
fallback_engine = create_engine(
    FALLBACK_SQLITE_URL,
    connect_args={"check_same_thread": False},
)
FallbackSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=fallback_engine)


# Connect with automatic fallback if Postgres host is unreachable (e.g. offline dev / network issue)
def create_robust_engine(url: str):
    connect_args = {}
    engine_kwargs = {"pool_pre_ping": True}
    if url.startswith("sqlite"):
        connect_args["check_same_thread"] = False
    elif "postgresql" in url:
        connect_args["connect_timeout"] = 5
        engine_kwargs["pool_recycle"] = 300

    try:
        eng = create_engine(url, connect_args=connect_args, **engine_kwargs)
        # Test connection
        with eng.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info(f"Database connected using: {url.split('@')[-1] if '@' in url else url}")
        return eng, url
    except Exception as exc:
        logger.warning(
            f"Failed to connect to primary database ({url.split('@')[-1] if '@' in url else url}): {exc}. "
            f"Falling back to local SQLite database: {FALLBACK_SQLITE_URL}"
        )
        return fallback_engine, FALLBACK_SQLITE_URL


engine, ACTIVE_DATABASE_URL = create_robust_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


from sqlalchemy.dialects.postgresql import UUID as PG_UUID


class GUID(TypeDecorator):
    """Platform-independent GUID/UUID type supporting PostgreSQL and SQLite."""
    impl = String(36)
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_UUID(as_uuid=True))
        else:
            return dialect.type_descriptor(String(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if dialect.name == "postgresql":
            if isinstance(value, uuid.UUID):
                return value
            return uuid.UUID(str(value))
        else:
            if isinstance(value, uuid.UUID):
                return str(value)
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


_fallback_tables_initialized = False


def get_db():
    """
    Yields a database session.
    Uses pool_pre_ping=True on PostgreSQL so stale connections are automatically recycled.
    If the remote PostgreSQL host becomes unreachable mid-runtime (e.g., DNS [Errno 11001]
    or temporary network drop), seamlessly falls back to the local SQLite mirror so
    authentication and app requests never crash with a 500 error.
    """
    global _fallback_tables_initialized
    db = SessionLocal()
    try:
        # Verify connection health before handing session to endpoint
        db.execute(text("SELECT 1"))
    except OperationalError as exc:
        db.close()
        logger.warning(
            f"[DB FAILOVER] Primary PostgreSQL unreachable during request ({exc}). "
            f"Using local SQLite fallback session."
        )
        if not _fallback_tables_initialized:
            try:
                Base.metadata.create_all(bind=fallback_engine)
                _fallback_tables_initialized = True
            except Exception:
                pass
        db = FallbackSessionLocal()

    try:
        yield db
    finally:
        db.close()

