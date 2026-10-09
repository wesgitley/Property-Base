import logging
import os
import uuid
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import String, TypeDecorator, create_engine, text
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

# Connect with automatic fallback if Postgres host is unreachable (e.g. offline dev / network issue)
def create_robust_engine(url: str):
    connect_args = {}
    if url.startswith("sqlite"):
        connect_args["check_same_thread"] = False
    elif "postgresql" in url:
        connect_args["connect_timeout"] = 5

    try:
        eng = create_engine(url, connect_args=connect_args)
        # Test connection
        with eng.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info(f"Database connected using: {url.split('@')[-1] if '@' in url else url}")
        return eng, url
    except Exception as exc:
        fallback_url = f"sqlite:///./propertybase.db"
        logger.warning(
            f"Failed to connect to primary database ({url.split('@')[-1] if '@' in url else url}): {exc}. "
            f"Falling back to local SQLite database: {fallback_url}"
        )
        fallback_eng = create_engine(fallback_url, connect_args={"check_same_thread": False})
        return fallback_eng, fallback_url

engine, ACTIVE_DATABASE_URL = create_robust_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class GUID(TypeDecorator):
    """Platform-independent GUID/UUID type supporting PostgreSQL and SQLite."""
    impl = String(36)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
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
        except ValueError:
            return value


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
