from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from core.deps import RequireRole
from auth_service.models import RoleEnum
from migration_service.router import router
from core.db import engine, Base
import migration_service.models  # Ensure models are registered

app = FastAPI(title="Edge Assistant AE Migration Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
@app.on_event("startup")
async def on_startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

@app.get("/api/health")
async def health(user = Depends(RequireRole([RoleEnum.AE, RoleEnum.ADMIN]))):
    return {"status": "ok", "service": "AE Migration", "user": user.email}
