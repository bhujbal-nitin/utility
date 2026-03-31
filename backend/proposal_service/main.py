import os
import uuid
import json
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel

from core.deps import RequireRole
from auth_service.models import RoleEnum
from proposal_service.proposal_generator import generate_proposal_docx
from proposal_service.excel_generator import generate_scope_excel
from proposal_service.excel_parser import parse_discovery_sheet
from proposal_service.vertex_ai import enrich_use_cases

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Edge Assistant Proposal Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all for local dev proxy
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Storage Configuration (Dedicated Proposal Folder) ──────────────────────────
DATA_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "proposal_studio_data"))
PROPOSALS_DIR = os.path.join(DATA_ROOT, "proposals")
UPLOADS_DIR = os.path.join(DATA_ROOT, "uploads")

os.makedirs(PROPOSALS_DIR, exist_ok=True)
os.makedirs(UPLOADS_DIR, exist_ok=True)

# ── Models ───────────────────────────────────────────────────────────────────
class UseCase(BaseModel):
    sr_no: Optional[int] = 1
    process_name: str
    sme: Optional[str] = ""
    apps: Optional[str] = ""
    user_profile: Optional[str] = ""
    working_hours: Optional[str] = "8"
    cycle_time: Optional[str] = "5"
    nature: Optional[str] = ""
    input_type: Optional[str] = ""
    daily_volume: Optional[int] = 0
    monthly_volume: Optional[int] = 0
    annual_volume: Optional[int] = 0
    docs_annually: Optional[int] = 0
    idp: Optional[str] = "No"
    ps_efforts: Optional[int] = 50
    ocr_nlp: Optional[str] = ""
    summary: Optional[str] = ""
    complexity: Optional[str] = "Medium"
    solution_mapping: Optional[str] = ""
    ai_plugins: Optional[int] = 1

class ProposalRequest(BaseModel):
    client_name: str
    proposal_date: Optional[str] = None
    contact_name: str
    contact_title: str
    contact_address: Optional[str] = ""
    contact_email: Optional[str] = ""
    contact_mobile: Optional[str] = ""
    use_cases: List[UseCase]
    discovery_id: Optional[str] = ""

# ── API Endpoints ─────────────────────────────────────────────────────────────
@app.get("/api/health")
async def health(user = Depends(RequireRole([RoleEnum.SALES, RoleEnum.ADMIN, RoleEnum.BA]))):
    return {"status": "ok", "service": "Proposal", "user": user.email}

@app.post("/api/proposal/upload")
async def upload_discovery(
    file: UploadFile = File(...),
    enrich: bool = True,
    user = Depends(RequireRole([RoleEnum.SALES, RoleEnum.ADMIN, RoleEnum.BA]))
):
    if not file.filename.lower().endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Invalid file type.")
    
    file_id = str(uuid.uuid4())
    filepath = os.path.join(UPLOADS_DIR, f"{file_id}_{file.filename}")
    with open(filepath, "wb") as buffer:
        buffer.write(await file.read())
    
    try:
        use_cases = parse_discovery_sheet(filepath)
        if enrich:
            use_cases = enrich_use_cases(use_cases)
        return {
            "use_cases": use_cases,
            "discovery_id": f"{file_id}_{file.filename}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/proposal/generate")
async def generate_proposal(
    data: str = Form(...),
    logo: Optional[UploadFile] = File(None),
    user = Depends(RequireRole([RoleEnum.SALES, RoleEnum.ADMIN, RoleEnum.BA]))
):
    try:
        body_dict = json.loads(data)
        request_obj = ProposalRequest(**body_dict)
        
        # Paths
        base_name = f"Proposal_{uuid.uuid4().hex[:8]}"
        docx_filename = f"{base_name}.docx"
        xlsx_filename = f"{base_name}.xlsx"
        
        docx_path = os.path.join(PROPOSALS_DIR, docx_filename)
        xlsx_path = os.path.join(PROPOSALS_DIR, xlsx_filename)
        
        # Save logo
        logo_path = None
        if logo:
            logo_ext = os.path.splitext(logo.filename)[1]
            logo_path = os.path.join(UPLOADS_DIR, f"logo_{uuid.uuid4().hex}{logo_ext}")
            with open(logo_path, "wb") as buffer:
                buffer.write(await logo.read())

        # Prepare totals
        total_daily_vol = sum(uc.daily_volume for uc in request_obj.use_cases)
        total_ps_efforts = sum(uc.ps_efforts for uc in request_obj.use_cases)
        total_ai_plugins = sum(uc.ai_plugins for uc in request_obj.use_cases)
        total_idp_pages = sum(uc.docs_annually for uc in request_obj.use_cases)
        
        # Standard configs (mirrored from UI)
        total_bots = 1 # We can make this dynamic if needed, but 1 is baseline for 1000 daily
        if total_daily_vol > 500: # Simple threshold logic for now
            total_bots = max(1, round(total_daily_vol / 500))
        
        # RAM Calculation logic
        def get_rounded_ram(raw_gb):
            for s in [8, 16, 32, 64, 128, 256, 512]:
                if raw_gb <= s: return s
            return 512
        
        base_ram = (total_bots * 4) + 5
        prod_ram = get_rounded_ram(max(base_ram / 0.64, 6 * 6)) # 6 cores * 6 GB ratio
        
        # Prepare payload for Node & Excel generators
        final_data = request_obj.model_dump()
        final_data["software"] = {
            "num_bots": total_bots,
            "idp_pages": f"{total_idp_pages:,}",
            "num_plugins": total_ai_plugins,
            "total_ps": total_ps_efforts
        }
        final_data["hardware"] = {
            "production_ram": prod_ram,
            "production_cores": 6
        }
        
        if logo_path:
            final_data["client_image"] = logo_path
        
        # Discovery file for Excel Sheet
        discovery_path = ""
        if request_obj.discovery_id:
            potential_path = os.path.join(UPLOADS_DIR, request_obj.discovery_id)
            if os.path.exists(potential_path):
                discovery_path = potential_path

        # GENERATE BOTH
        generate_proposal_docx(final_data, docx_path)
        generate_scope_excel(xlsx_path, discovery_path, final_data["use_cases"])
        
        return {
            "message": "Files generated successfully",
            "docx": docx_filename,
            "xlsx": xlsx_filename,
            "download_url_docx": f"/api/proposal/download/{docx_filename}",
            "download_url_xlsx": f"/api/proposal/download/{xlsx_filename}"
        }
    except Exception as e:
        import logging
        logging.error(f"Generation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/proposal/download/{filename}")
async def download_proposal(
    filename: str,
    user = Depends(RequireRole([RoleEnum.SALES, RoleEnum.ADMIN, RoleEnum.BA]))
):
    import logging
    path = os.path.join(PROPOSALS_DIR, filename)
    logging.info(f"Downloading proposal: {filename} from {path}")
    if not os.path.exists(path):
        logging.error(f"File not found on disk: {path}")
        raise HTTPException(status_code=404, detail="File not found on disk.")
    return FileResponse(path, filename=filename)
