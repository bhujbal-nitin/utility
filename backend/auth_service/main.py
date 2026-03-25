from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from core.db import get_db, Base, engine
from core.security import verify_password, get_password_hash, create_access_token
from auth_service.models import User, RoleEnum
from auth_service.schemas import UserCreate, UserResponse, Token
from fastapi_limiter import FastAPILimiter
from core.redis import get_redis
from auth_service.admin import router as admin_router
import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Edge Assistant Auth Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

app.include_router(admin_router)

@app.on_event("startup")
async def on_startup():
    logger.info("Initializing database tables...")
    async with engine.begin() as conn:
        # Create tables if they don't exist
        await conn.run_sync(Base.metadata.create_all)
        
    logger.info("Initializing FastAPI limiter with Redis...")
    redis = await get_redis()
    await FastAPILimiter.init(redis)

@app.post("/api/auth/register", response_model=UserResponse)
async def register(user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == user_data.email))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # By default, first user could be admin, but let's just make it BA. Admin needs DB seeding or script.
    new_user = User(
        email=user_data.email,
        hashed_password=get_password_hash(user_data.password),
        role=user_data.role
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user

@app.post("/api/auth/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalars().first()
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")

    access_token = create_access_token(subject=user.id)
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/auth/me", response_model=UserResponse)
async def read_users_me(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)):
    from core.security import pwd_context, settings, jwt
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
        
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user
