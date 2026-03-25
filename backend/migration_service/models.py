from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from core.db import Base

class MigrationCache(Base):
    __tablename__ = "migration_cache"

    id = Column(Integer, primary_key=True, index=True)
    file_hash = Column(String(255), unique=True, index=True, nullable=False)
    file_name = Column(String(255), nullable=False)
    tool = Column(String(50), nullable=False)  # e.g., 'uipath', 'bp', 'aa'
    output = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
