import uuid
from sqlalchemy import Column, String, Boolean, DateTime, Enum, text, JSON
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime, timezone
import enum
from core.db import Base

class RoleEnum(str, enum.Enum):
    ADMIN = "admin"
    BA = "ba"
    SALES = "sales"
    AUTOMATION = "automation"
    AE = "ae"

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    roles = Column(JSON, nullable=False, default=lambda: [RoleEnum.BA.value])
    is_approved = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
