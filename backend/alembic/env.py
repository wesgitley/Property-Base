import os
import sys
from logging.config import fileConfig
from os.path import abspath, dirname, join

from alembic import context
from dotenv import load_dotenv
from sqlalchemy import engine_from_config, pool

# 1. Add backend directory to sys.path FIRST so app imports resolve correctly
BACKEND_DIR = dirname(dirname(abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)

# 2. Load .env file using absolute path
env_path = join(BACKEND_DIR, ".env")
load_dotenv(dotenv_path=env_path)

# 3. Import Base AND your models so Base.metadata is fully populated
from app.core.database import Base
import app.models  # Registers User, Device, Session, RiskLog, etc.

# 4. Alembic Config object
config = context.config

# Dynamically set the database URL from .env
db_url = os.getenv("DIRECT_URL") or os.getenv("DATABASE_URL")

if not db_url:
    raise ValueError(
        f"Could not load DIRECT_URL or DATABASE_URL from .env at {env_path}. "
        "Please check that backend/.env exists and contains your database connection string."
    )

config.set_main_option("sqlalchemy.url", db_url)

# Interpret the config file for Python logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Set target_metadata for autogenerate support
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
