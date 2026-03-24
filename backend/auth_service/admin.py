from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List
from core.db import get_db
from core.deps import RequireRole
from auth_service.models import User, RoleEnum
from auth_service.schemas import UserResponse
from pydantic import BaseModel

router = APIRouter(prefix="/api/admin", tags=["admin"])

class RoleUpdate(BaseModel):
    role: RoleEnum

@router.get("/users", response_model=List[UserResponse], dependencies=[Depends(RequireRole([RoleEnum.ADMIN]))])
async def list_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User))
    return result.scalars().all()

@router.put("/users/{user_id}/role", response_model=UserResponse, dependencies=[Depends(RequireRole([RoleEnum.ADMIN]))])
async def update_user_role(user_id: str, role_update: RoleUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.role = role_update.role
    await db.commit()
    await db.refresh(user)
    return user

@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(RequireRole([RoleEnum.ADMIN]))])
async def delete_user(user_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.delete(user)
    await db.commit()
    return None
