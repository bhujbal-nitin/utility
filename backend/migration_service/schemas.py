from pydantic import BaseModel
from typing import Optional, Any

class MigrationResponse(BaseModel):
    success: bool
    source: str
    fileName: str
    chunks: int
    data: str | Any
    processingTime: str
    message: Optional[str] = None

class MigrationErrorResponse(BaseModel):
    success: bool
    message: str
