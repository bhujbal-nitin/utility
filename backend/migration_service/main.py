from fastapi import FastAPI, Depends
from core.deps import RequireRole
from auth_service.models import RoleEnum

app = FastAPI(title="Edge Assistant AE Migration Service", version="0.1.0")

@app.get("/api/health")
async def health(user = Depends(RequireRole([RoleEnum.AE, RoleEnum.ADMIN]))):
    return {"status": "ok", "service": "AE Migration", "user": user.email}
