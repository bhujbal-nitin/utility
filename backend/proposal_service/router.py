import os
import uuid
import logging
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, File, UploadFile, HTTPException, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from core.deps import RequireRole
from auth_service.models import RoleEnum

from proposal_service.services.excel_parser import parse_discovery_sheet
from proposal_service.services.vertex_ai import enrich_use_cases
from proposal_service.services.excel_generator import generate_scope_excel
from core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/proposal", tags=["proposal"])

# Store data outside the backend pkg to prevent hot-reload restarts
DATA_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", settings.PROPOSAL_STUDIO_DATA_DIR))
UPLOAD_DIR = os.path.join(DATA_ROOT, "uploads")
OUTPUT_DIR = os.path.join(DATA_ROOT, "outputs")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

class GenerateRequest(BaseModel):
    discovery_file: str
    use_cases: List[Dict[str, Any]]
    work_days: int = 1
    total_bots: int = 18
    cycle_time: int = 5
    num_cpu: int = 3
    num_cores: int = 6
    sys_hours: float = 16.0
    hw_data: Optional[Dict[str, Any]] = None

class ClientInfo(BaseModel):
    client_name: str = ""
    proposal_date: str = ""
    contact_name: str = ""
    contact_title: str = ""
    contact_address: str = ""
    contact_email: str = ""
    contact_mobile: str = ""

class SoftwareInfo(BaseModel):
    num_bots: int = 18
    idp_pages: str = "0"
    num_plugins: int = 1

class ProposalRequest(BaseModel):
    use_cases: List[Dict[str, Any]]
    client_info: ClientInfo
    software: SoftwareInfo
    hardware: Dict[str, Any] = {}

@router.post("/upload", dependencies=[Depends(RequireRole([RoleEnum.SALES, RoleEnum.ADMIN, RoleEnum.BA]))])
async def upload_discovery_sheet(file: UploadFile = File(...)):
    if not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Please upload a valid Excel file (.xlsx or .xls)")

    file_id = str(uuid.uuid4())
    filepath = os.path.join(UPLOAD_DIR, f"{file_id}_discovery.xlsx")
    
    try:
        content = await file.read()
        with open(filepath, "wb") as f:
            f.write(content)
    except Exception as e:
        logger.exception("Failed to save file")
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    try:
        use_cases = parse_discovery_sheet(filepath)
    except Exception as e:
        logger.exception("Failed to parse discovery sheet")
        raise HTTPException(status_code=400, detail=f"Could not parse the discovery sheet: {str(e)}")
        
    if not use_cases:
        raise HTTPException(status_code=400, detail="No use cases found in the uploaded file.")
        
    try:
        use_cases = enrich_use_cases(use_cases)
    except Exception as e:
        logger.exception("Vertex AI enrichment failed")
        raise HTTPException(status_code=500, detail=f"Vertex AI call failed: {str(e)}")
        
    return {
        "discovery_file": filepath,
        "use_cases": use_cases
    }

@router.post("/generate", dependencies=[Depends(RequireRole([RoleEnum.SALES, RoleEnum.ADMIN, RoleEnum.BA]))])
async def generate_excel(request: GenerateRequest):
    out_name = f"Scope_Commercials_{uuid.uuid4().hex[:8]}.xlsx"
    out_path = os.path.join(OUTPUT_DIR, out_name)
    
    try:
        generate_scope_excel(
            output_path=out_path,
            discovery_filepath=request.discovery_file,
            use_cases=request.use_cases,
            work_days=request.work_days,
            total_bots=request.total_bots,
            cycle_time=request.cycle_time,
            num_cpu=request.num_cpu,
            num_cores=request.num_cores,
            sys_hours=request.sys_hours,
            hw_data=request.hw_data
        )
    except Exception as e:
        logger.exception("Excel generation failed")
        raise HTTPException(status_code=500, detail=f"Excel generation failed: {str(e)}")
        
    return {"filename": out_name, "download_url": f"/api/proposal/download/{out_name}"}

@router.post("/generate-word", dependencies=[Depends(RequireRole([RoleEnum.SALES, RoleEnum.ADMIN, RoleEnum.BA]))])
async def generate_word_proposal(request: ProposalRequest):
    from proposal_service.services.proposal_generator import generate_proposal_docx
    
    out_name = f"Proposal_{uuid.uuid4().hex[:8]}.docx"
    out_path = os.path.join(OUTPUT_DIR, out_name)
    
    try:
        generate_proposal_docx(
            output_path=out_path,
            use_cases=request.use_cases,
            client_info=request.client_info.model_dump(),
            software=request.software.model_dump(),
            hardware=request.hardware
        )
    except Exception as e:
        logger.exception("Word Proposal generation failed")
        raise HTTPException(status_code=500, detail=f"Word Proposal generation failed: {str(e)}")
        
    return {"filename": out_name, "download_url": f"/api/proposal/download/{out_name}"}

@router.get("/download/{filename}")
async def download_file(filename: str):
    file_path = os.path.join(OUTPUT_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    # Determine media type
    media_type = 'application/octet-stream'
    if filename.endswith(".xlsx"):
        media_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    elif filename.endswith(".docx"):
        media_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

    # Return as attachment
    return FileResponse(
        path=file_path, 
        filename=filename, 
        media_type=media_type
    )
