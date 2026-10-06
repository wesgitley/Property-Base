from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.users import router as users_router
from app.core.database import Base, engine

# Create all database tables defined in app/models.py
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="PropertyBase API",
    version="1.0.0",
    description="Property management platform with risk scoring and device tracking.",
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Router registration
app.include_router(auth_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")


@app.get("/health", tags=["Health Check"])
def health_check() -> dict[str, str]:
    return {"status": "healthy"}
