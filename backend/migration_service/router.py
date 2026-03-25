import hashlib
import time
from typing import List, Optional
from fastapi import APIRouter, File, UploadFile, Form, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from core.db import get_db
from core.deps import RequireRole
from auth_service.models import RoleEnum
from migration_service.schemas import MigrationResponse, MigrationErrorResponse
from migration_service.models import MigrationCache
from migration_service.services import build_prompt, call_llm, call_vision_llm

router = APIRouter(prefix="/api/migration", tags=["migration"])

MAX_FILE_SIZE = 15 * 1024 * 1024  # 15 MB
CHUNK_SIZE = 25000

def get_file_extension(filename: str) -> str:
    return filename.split('.')[-1].lower() if '.' in filename else ''

async def process_file_upload(
    files: List[UploadFile],
    allowed_extensions: List[str],
    prompt: Optional[str],
    tool: str,
    db: AsyncSession
) -> MigrationResponse:
    start_time = time.time()
    
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    # Limit to 15MB & Validate Extensions
    total_size = 0
    all_contents = b""
    file_names = []

    for file in files:
        ext = get_file_extension(file.filename)
        if ext not in allowed_extensions:
            raise HTTPException(status_code=400, detail=f"File {file.filename} has unsupported extension .{ext}")
        
        content = await file.read()
        total_size += len(content)
        if total_size > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="Total file size exceeds 15MB limit")
        
        all_contents += content
        file_names.append(file.filename)
    
    merged_filename = ", ".join(file_names)

    # 1. Generate SHA256 hash
    file_hash = hashlib.sha256(all_contents).hexdigest()
    
    # 2. Check Cache
    try:
        result = await db.execute(select(MigrationCache).where(MigrationCache.file_hash == file_hash))
        cached = result.scalars().first()
        if cached:
            return MigrationResponse(
                success=True,
                source="cache",
                fileName=merged_filename,
                chunks=1,
                data=cached.output,
                processingTime=f"{int((time.time() - start_time) * 1000)} ms"
            )
    except Exception as e:
        await db.rollback()
        print(f"DB Cache Error: {e}")

    # 3. AI Execution
    try:
        parsed_output = None
        num_chunks = 1
        
        # Check if single image upload (AA specific)
        ext = get_file_extension(files[0].filename)
        is_image = ext in ["png", "jpg", "jpeg"]
        
        if len(files) == 1 and is_image:
            import base64
            base64_img = base64.b64encode(all_contents).decode('utf-8')
            mime_type = f"image/{ext}" if ext != "jpg" else "image/jpeg"
            parsed_output = await call_vision_llm(base64_img, mime_type, prompt)
        else:
            # Decode to string
            try:
                text_content = all_contents.decode('utf-8')
            except UnicodeDecodeError:
                # Fallback to ignore errors if it's an archive or weird xml
                text_content = all_contents.decode('utf-8', errors='ignore')

            # Chunking logic
            chunks = [text_content[i:i + CHUNK_SIZE] for i in range(0, len(text_content), CHUNK_SIZE)]
            num_chunks = len(chunks)

            if num_chunks == 1:
                system_msg = "You are an expert RPA analyst. Extract variables, UI logic, and flatten flows into Dags. Output Markdown."
                full_prompt = build_prompt(tool, chunks[0], prompt, None, None)
                parsed_output = await call_llm(full_prompt, system_msg)
            else:
                chunk_results = []
                system_msg = "You are an expert RPA analyst. Process the following chunk of an RPA file."
                for i, chunk in enumerate(chunks):
                    chunk_prompt = build_prompt(tool, chunk, prompt, i, num_chunks)
                    resp = await call_llm(chunk_prompt, system_msg)
                    if resp:
                        chunk_results.append(resp)
                
                if not chunk_results:
                    raise HTTPException(status_code=500, detail="All LLM chunks failed to return content")
                parsed_output = "\\n\\n---\\n\\n".join(chunk_results)

        if not parsed_output:
            raise HTTPException(status_code=500, detail="Failed to retrieve AI response")

        # 4. Save to Cache with Graceful Ex
        try:
            cache_entry = MigrationCache(
                file_hash=file_hash,
                file_name=merged_filename,
                tool=tool,
                output=parsed_output
            )
            db.add(cache_entry)
            await db.commit()
        except Exception as db_err:
            await db.rollback()
            print(f"Failed to cache result: {db_err}")

        return MigrationResponse(
            success=True,
            source="vertexai",
            fileName=merged_filename,
            chunks=num_chunks,
            data=parsed_output,
            processingTime=f"{int((time.time() - start_time) * 1000)} ms"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Migration LLM Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"AI Processing failed gracefully: {str(e)}")

@router.post("/uipath/analyze", response_model=MigrationResponse)
async def uipath_analyze(
    files: List[UploadFile] = File(...),
    prompt: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    user = Depends(RequireRole([RoleEnum.AE, RoleEnum.ADMIN]))
):
    return await process_file_upload(files, ["xaml", "json", "nupkg", "zip", "txt", "csv"], prompt, "uipath", db)

@router.post("/bp/analyze", response_model=MigrationResponse)
async def bp_analyze(
    file: UploadFile = File(...),
    prompt: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    user = Depends(RequireRole([RoleEnum.AE, RoleEnum.ADMIN]))
):
    return await process_file_upload([file], ["xml", "bprelease", "object"], prompt, "bp", db)

@router.post("/aa/analyze", response_model=MigrationResponse)
async def aa_analyze(
    file: UploadFile = File(...),
    prompt: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    user = Depends(RequireRole([RoleEnum.AE, RoleEnum.ADMIN]))
):
    return await process_file_upload([file], ["atmx", "bot", "json", "zip", "png", "jpg", "jpeg"], prompt, "aa", db)
