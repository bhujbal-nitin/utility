from pydantic import BaseModel, EmailStr
from auth_service.models import RoleEnum

from typing import Optional

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    role: Optional[RoleEnum] = RoleEnum.BA

class UserResponse(BaseModel):
    id: str
    email: str
    role: RoleEnum
    is_active: bool

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str
