from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from core.deps import RequireRole
from auth_service.models import RoleEnum
from proposal_service.router import router

# Triggering reload to fetch new .env values
app = FastAPI(title="Edge Assistant Proposal Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://mspeventwin2.westus.cloudapp.azure.com",
        "http://mspeventwin2.westus.cloudapp.azure.com:3000",
        "https://mspeventwin2.westus.cloudapp.azure.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

@app.get("/api/health")
async def health(user = Depends(RequireRole([RoleEnum.SALES, RoleEnum.ADMIN, RoleEnum.BA]))):
    return {"status": "ok", "service": "Proposal", "user": user.email}
