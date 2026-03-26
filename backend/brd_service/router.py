"""
BRD Service — API Router
─────────────────────────
All endpoints for the BRD Studio.
Atomic save+version pattern ensures no data loss.
"""

import os
import uuid
import shutil
import logging
import asyncio
import tempfile
from pathlib import Path
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from pydantic import BaseModel

from core.db import get_db
from core.deps import RequireRole
from core.config import settings
from auth_service.models import User, RoleEnum

from brd_service.models import (
    BrdProject, BrdVideo, BrdCapture, BrdSection, BrdVersion, BrdDocument
)
from brd_service.video_processor import smart_capture, get_video_duration
from brd_service.frame_describer import frame_describer
from brd_service.brd_pipeline import brd_pipeline
from brd_service.export_service import ExportService
from brd_service.extract_utils import extract_text_from_file

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/brd", tags=["BRD Studio"])

# Storage directories
BRD_DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "brd_studio_data"))
BRD_VIDEOS_DIR = os.path.join(BRD_DATA_DIR, "videos")
BRD_FRAMES_DIR = os.path.join(BRD_DATA_DIR, "frames")
BRD_EXPORTS_DIR = os.path.join(BRD_DATA_DIR, "exports")
BRD_DOCS_DIR = os.path.join(BRD_DATA_DIR, "documents")

for d in [BRD_VIDEOS_DIR, BRD_FRAMES_DIR, BRD_EXPORTS_DIR, BRD_DOCS_DIR]:
    os.makedirs(d, exist_ok=True)

# Auth dependency
brd_role = RequireRole([RoleEnum.BA, RoleEnum.ADMIN])


# ─── Pydantic Schemas ────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str
    client_name: str = ""
    process_name: str = ""
    ba_name: str = ""

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    client_name: Optional[str] = None
    process_name: Optional[str] = None
    ba_name: Optional[str] = None
    status: Optional[str] = None

class SectionUpdate(BaseModel):
    content: str

class RefineRequest(BaseModel):
    instruction: str
    context: Optional[str] = None

class RegenerateRequest(BaseModel):
    instruction: str = ""
    sections: Optional[List[str]] = None  # specific section_keys to regenerate

class CaptureUpdate(BaseModel):
    label: Optional[str] = None
    ocr_text: Optional[str] = None
    description: Optional[str] = None
    details_json: Optional[dict] = None
    edits_json: Optional[dict] = None
    is_kept: Optional[bool] = None
    order: Optional[int] = None


# ─── Projects ────────────────────────────────────────────────────────────────

@router.post("/projects")
async def create_project(
    body: ProjectCreate,
    user: User = Depends(brd_role),
    db: AsyncSession = Depends(get_db),
):
    project = BrdProject(
        user_id=user.id,
        name=body.name,
        client_name=body.client_name,
        process_name=body.process_name,
        ba_name=body.ba_name,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return _project_to_dict(project)


@router.get("/projects")
async def list_projects(
    user: User = Depends(brd_role),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(BrdProject)
        .where(BrdProject.user_id == user.id)
        .order_by(desc(BrdProject.updated_at))
    )
    projects = result.scalars().all()
    return [_project_to_dict(p) for p in projects]


@router.get("/projects/{project_id}")
async def get_project(
    project_id: str,
    user: User = Depends(brd_role),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_project_or_404(db, project_id, user.id)
    return _project_full_dict(project)


@router.put("/projects/{project_id}")
async def update_project(
    project_id: str,
    body: ProjectUpdate,
    user: User = Depends(brd_role),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_project_or_404(db, project_id, user.id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    await db.commit()
    await db.refresh(project)
    return _project_to_dict(project)


@router.delete("/projects/{project_id}")
async def delete_project(
    project_id: str,
    user: User = Depends(brd_role),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_project_or_404(db, project_id, user.id)
    await db.delete(project)
    await db.commit()
    # Cleanup files
    for d in [
        os.path.join(BRD_FRAMES_DIR, project_id),
        os.path.join(BRD_VIDEOS_DIR, project_id),
        os.path.join(BRD_EXPORTS_DIR, project_id),
    ]:
        shutil.rmtree(d, ignore_errors=True)
    return {"deleted": True}


# ─── Videos ───────────────────────────────────────────────────────────────────

@router.post("/projects/{project_id}/videos")
async def upload_video(
    project_id: str,
    background_tasks: BackgroundTasks,
    video: UploadFile = File(...),
    transcript: Optional[str] = Form(None),
    transcript_file: Optional[UploadFile] = File(None),
    user: User = Depends(brd_role),
    db: AsyncSession = Depends(get_db),
):
    """Upload video, save, trigger intelligent capture + LLM descriptions in background."""
    project = await _get_project_or_404(db, project_id, user.id)

    # Save video file
    video_dir = os.path.join(BRD_VIDEOS_DIR, project_id)
    os.makedirs(video_dir, exist_ok=True)
    video_id = str(uuid.uuid4())
    safe_name = f"{video_id}_{video.filename}"
    video_path = os.path.join(video_dir, safe_name)

    with open(video_path, "wb") as f:
        content = await video.read()
        f.write(content)

    # Get max order
    result = await db.execute(
        select(func.max(BrdVideo.order)).where(BrdVideo.project_id == project_id)
    )
    max_order = result.scalar() or 0

    # Get duration
    duration = await get_video_duration(video_path)

    # Handle transcript
    full_transcript = transcript or ""
    if transcript_file:
        # Save transcript temporarily and extract
        docs_dir = os.path.join(BRD_DOCS_DIR, project_id)
        os.makedirs(docs_dir, exist_ok=True)
        t_path = os.path.join(docs_dir, f"transcript_{transcript_file.filename}")
        with open(t_path, "wb") as f:
            f.write(await transcript_file.read())
        
        extracted = await extract_text_from_file(t_path)
        if extracted:
            full_transcript = extracted

    # Parse transcript segments
    segments = []
    if full_transcript:
        segments = [{"start": 0, "end": 0, "text": full_transcript, "speaker": None}]

    video_record = BrdVideo(
        id=video_id,
        project_id=project_id,
        filename=video.filename,
        path=video_path,
        duration=duration,
        order=max_order + 1,
        transcript_text=transcript or "",
        transcript_segments=segments,
        status="processing",
    )
    db.add(video_record)
    await db.commit()
    await db.refresh(video_record)

    # Trigger background capture + description
    background_tasks.add_task(
        _process_video_captures, project_id, video_id, video_path, db
    )

    return {
        "video_id": video_id,
        "filename": video.filename,
        "duration": duration,
        "status": "processing",
        "message": "Video uploaded. Frame capture and AI description in progress.",
    }


@router.post("/projects/{project_id}/transcript")
async def upload_transcript(
    project_id: str,
    video_id: str = Form(...),
    transcript: str = Form(...),
    user: User = Depends(brd_role),
    db: AsyncSession = Depends(get_db),
):
    """Upload/paste transcript and link to a video."""
    await _get_project_or_404(db, project_id, user.id)

    result = await db.execute(
        select(BrdVideo).where(BrdVideo.id == video_id, BrdVideo.project_id == project_id)
    )
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    video.transcript_text = transcript
    # Simple segment: whole transcript as one block
    video.transcript_segments = [{"start": 0, "end": video.duration, "text": transcript, "speaker": None}]
    await db.commit()
    return {"updated": True, "video_id": video_id}


# ─── Captures ─────────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/captures")
async def list_captures(
    project_id: str,
    user: User = Depends(brd_role),
    db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, user.id)
    result = await db.execute(
        select(BrdCapture)
        .where(BrdCapture.project_id == project_id)
        .order_by(BrdCapture.order.asc(), BrdCapture.timestamp.asc())
    )
    captures = result.scalars().all()
    return [_capture_to_dict(c) for c in captures]


@router.post("/projects/{project_id}/captures")
async def add_custom_capture(
    project_id: str,
    background_tasks: BackgroundTasks,
    image: UploadFile = File(...),
    label: str = Form("Custom Screenshot"),
    user: User = Depends(brd_role),
    db: AsyncSession = Depends(get_db),
):
    """Upload a custom screenshot — triggers LLM description."""
    await _get_project_or_404(db, project_id, user.id)

    # Save image
    frames_dir = os.path.join(BRD_FRAMES_DIR, project_id)
    os.makedirs(frames_dir, exist_ok=True)
    capture_id = str(uuid.uuid4())
    ext = os.path.splitext(image.filename)[1] or ".jpg"
    img_name = f"custom_{capture_id}{ext}"
    img_path = os.path.join(frames_dir, img_name)

    with open(img_path, "wb") as f:
        f.write(await image.read())

    # Get max order
    result = await db.execute(
        select(func.max(BrdCapture.order)).where(BrdCapture.project_id == project_id)
    )
    max_order = result.scalar() or 0

    capture = BrdCapture(
        id=capture_id,
        project_id=project_id,
        image_path=img_path,
        order=max_order + 1,
        label=label,
        is_custom=True,
        llm_status="processing",
    )
    db.add(capture)
    await db.commit()
    await db.refresh(capture)

    # Background LLM description
    background_tasks.add_task(_describe_single_capture, capture_id, img_path, db)

    return _capture_to_dict(capture)


@router.put("/captures/{capture_id}/image")
async def update_capture_image(
    capture_id: str,
    image: UploadFile = File(...),
    user: User = Depends(brd_role),
    db: AsyncSession = Depends(get_db),
):
    """Overwrite a capture's image file (e.g., after crop/annotate)."""
    result = await db.execute(select(BrdCapture).where(BrdCapture.id == capture_id))
    capture = result.scalar_one_or_none()
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")

    # Save over existing path if it exists, or create new one
    if not capture.image_path:
        frames_dir = os.path.join(BRD_FRAMES_DIR, capture.project_id)
        os.makedirs(frames_dir, exist_ok=True)
        capture.image_path = os.path.join(frames_dir, f"{capture.id}_edited.jpg")

    with open(capture.image_path, "wb") as f:
        f.write(await image.read())

    await db.commit()
    return {"updated": True, "image_url": f"/api/brd/frames/{capture.project_id}/{os.path.basename(capture.image_path)}"}


@router.put("/captures/{capture_id}")
async def update_capture(
    capture_id: str,
    body: CaptureUpdate,
    user: User = Depends(brd_role),
    db: AsyncSession = Depends(get_db),
):
    """Update capture metadata, description, or edits."""
    result = await db.execute(select(BrdCapture).where(BrdCapture.id == capture_id))
    capture = result.scalar_one_or_none()
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(capture, field, value)
    await db.commit()
    await db.refresh(capture)
    return _capture_to_dict(capture)


@router.delete("/captures/{capture_id}")
async def delete_capture(
    capture_id: str,
    user: User = Depends(brd_role),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(BrdCapture).where(BrdCapture.id == capture_id))
    capture = result.scalar_one_or_none()
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")

    # Cleanup image file
    if capture.image_path and os.path.exists(capture.image_path):
        os.remove(capture.image_path)
    if capture.preview_image_path and os.path.exists(capture.preview_image_path):
        os.remove(capture.preview_image_path)

    await db.delete(capture)
    await db.commit()
    return {"deleted": True}


# ─── Sections (Atomic Save + Version) ────────────────────────────────────────

@router.get("/projects/{project_id}/sections")
async def list_sections(
    project_id: str,
    user: User = Depends(brd_role),
    db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, user.id)
    result = await db.execute(
        select(BrdSection)
        .where(BrdSection.project_id == project_id)
        .order_by(BrdSection.order.asc())
    )
    sections = result.scalars().all()
    return [_section_to_dict(s) for s in sections]


@router.put("/sections/{section_id}")
async def save_section(
    section_id: str,
    body: SectionUpdate,
    user: User = Depends(brd_role),
    db: AsyncSession = Depends(get_db),
):
    """
    ATOMIC SAVE + VERSION SNAPSHOT.
    Fixes BRDCopilot bug: every save creates a version in the same transaction.
    """
    result = await db.execute(select(BrdSection).where(BrdSection.id == section_id))
    section = result.scalar_one_or_none()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")

    # Create version snapshot BEFORE updating content
    version = BrdVersion(
        section_id=section.id,
        version_number=section.version,
        content_snapshot=section.content,  # snapshot the current content
    )
    db.add(version)

    # Now update section with new content
    section.content = body.content
    section.version += 1
    section.is_manual_override = True  # Mark as manually edited

    # Atomic commit: both version snapshot and content update
    await db.commit()
    await db.refresh(section)

    logger.info(f"Section {section.section_key} saved as v{section.version} with snapshot")
    return _section_to_dict(section)


@router.get("/sections/{section_id}/versions")
async def list_section_versions(
    section_id: str,
    user: User = Depends(brd_role),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(BrdVersion)
        .where(BrdVersion.section_id == section_id)
        .order_by(desc(BrdVersion.version_number))
        .limit(20)
    )
    versions = result.scalars().all()
    return [
        {
            "id": v.id,
            "version_number": v.version_number,
            "created_at": v.created_at.isoformat() if v.created_at else None,
            "content_preview": (v.content_snapshot or "")[:200],
        }
        for v in versions
    ]


@router.post("/sections/{section_id}/restore/{version_id}")
async def restore_section_version(
    section_id: str,
    version_id: str,
    user: User = Depends(brd_role),
    db: AsyncSession = Depends(get_db),
):
    """Restore a section to a previous version."""
    result = await db.execute(select(BrdSection).where(BrdSection.id == section_id))
    section = result.scalar_one_or_none()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")

    ver_result = await db.execute(
        select(BrdVersion).where(BrdVersion.id == version_id, BrdVersion.section_id == section_id)
    )
    version = ver_result.scalar_one_or_none()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    # Snapshot current before restore
    snapshot = BrdVersion(
        section_id=section.id,
        version_number=section.version,
        content_snapshot=section.content,
    )
    db.add(snapshot)

    section.content = version.content_snapshot
    section.version += 1
    await db.commit()
    await db.refresh(section)

    return _section_to_dict(section)


@router.post("/sections/{section_id}/refine")
async def refine_section(
    section_id: str,
    body: RefineRequest,
    user: User = Depends(brd_role),
    db: AsyncSession = Depends(get_db),
):
    """AI refine a specific section with user instruction."""
    result = await db.execute(select(BrdSection).where(BrdSection.id == section_id))
    section = result.scalar_one_or_none()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")

    # Snapshot current content before refinement
    version = BrdVersion(
        section_id=section.id,
        version_number=section.version,
        content_snapshot=section.content,
    )
    db.add(version)

    # Call AI refinement
    refined = await brd_pipeline.refine_section(
        content=section.content,
        instruction=body.instruction,
        context=body.context or "",
    )
    section.content = refined
    section.version += 1
    await db.commit()
    await db.refresh(section)

    return _section_to_dict(section)


# ─── Generation ───────────────────────────────────────────────────────────────

@router.post("/projects/{project_id}/generate")
async def generate_brd(
    project_id: str,
    background_tasks: BackgroundTasks,
    user: User = Depends(brd_role),
    db: AsyncSession = Depends(get_db),
):
    """Generate BRD using the knowledge-graph V2 pipeline."""
    project = await _get_project_or_404(db, project_id, user.id)

    # Validate: need captures
    cap_result = await db.execute(
        select(func.count(BrdCapture.id))
        .where(BrdCapture.project_id == project_id, BrdCapture.is_kept == True)
    )
    cap_count = cap_result.scalar() or 0
    if cap_count == 0:
        raise HTTPException(
            status_code=400,
            detail="No captures found. Upload a video or add screenshots first."
        )

    # Update project status
    project.status = "generating"
    await db.commit()

    # Launch background generation
    background_tasks.add_task(_generate_brd_background, project_id)

    return {
        "message": "BRD generation started",
        "project_id": project_id,
        "captures": cap_count,
        "status": "generating",
    }


@router.post("/projects/{project_id}/export")
async def export_brd(
    project_id: str,
    format: str = Form("docx"),
    user: User = Depends(brd_role),
    db: AsyncSession = Depends(get_db),
):
    """Export BRD as DOCX or PDF. READS LATEST PERSISTED CONTENT (bug fix)."""
    project = await _get_project_or_404(db, project_id, user.id)

    # Fetch all sections (latest persisted content from DB)
    result = await db.execute(
        select(BrdSection).where(BrdSection.project_id == project_id)
    )
    sections = result.scalars().all()
    if not sections:
        raise HTTPException(status_code=400, detail="No BRD sections found. Generate a BRD first.")

    # Fetch captures for IMAGE_REF resolution
    cap_result = await db.execute(
        select(BrdCapture).where(BrdCapture.project_id == project_id, BrdCapture.is_kept == True)
    )
    captures = cap_result.scalars().all()

    section_dicts = [_section_to_dict(s) for s in sections]
    capture_dicts = [_capture_to_dict(c) for c in captures]

    export_svc = ExportService(BRD_FRAMES_DIR, BRD_EXPORTS_DIR)
    meta = {
        "client_name": project.client_name,
        "process_name": project.process_name,
        "ba_name": project.ba_name,
    }

    if format == "docx":
        file_path = await export_svc.export_docx_from_template(project.name, section_dicts, capture_dicts, meta)
    elif format == "pdf":
        file_path = await export_svc.export_pdf(project.name, section_dicts, capture_dicts, meta)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {format}")

    # Update project status
    project.status = "exported"
    await db.commit()

    # Return download URL
    rel_path = os.path.relpath(file_path, BRD_EXPORTS_DIR)
    return {
        "message": f"Export as {format} complete",
        "project_id": project_id,
        "download_url": f"/api/brd/exports/{rel_path.replace(os.sep, '/')}",
        "filename": os.path.basename(file_path),
    }


# ─── Documents ────────────────────────────────────────────────────────────────

@router.post("/projects/{project_id}/documents")
async def upload_document(
    project_id: str,
    file: UploadFile = File(...),
    user: User = Depends(brd_role),
    db: AsyncSession = Depends(get_db),
):
    """Upload additional reference documents."""
    await _get_project_or_404(db, project_id, user.id)

    docs_dir = os.path.join(BRD_DOCS_DIR, project_id)
    os.makedirs(docs_dir, exist_ok=True)
    doc_id = str(uuid.uuid4())
    file_path = os.path.join(docs_dir, f"{doc_id}_{file.filename}")

    with open(file_path, "wb") as f:
        f.write(await file.read())

    # Extract text (basic for now)
    extracted = ""
    if file.filename.endswith(".txt"):
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            extracted = f.read()

    doc = BrdDocument(
        id=doc_id,
        project_id=project_id,
        filename=file.filename,
        path=file_path,
        extracted_text=extracted,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    return {"id": doc.id, "filename": doc.filename, "extracted_length": len(extracted)}


# ─── Capture Preview (Crop/Annotate) ─────────────────────────────────────────

@router.post("/captures/{capture_id}/preview")
async def upload_capture_preview(
    capture_id: str,
    preview: UploadFile = File(...),
    crop_region: Optional[str] = Form(None),
    user: User = Depends(brd_role),
    db: AsyncSession = Depends(get_db),
):
    """Upload a cropped/annotated preview image for a capture."""
    result = await db.execute(select(BrdCapture).where(BrdCapture.id == capture_id))
    capture = result.scalar_one_or_none()
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")

    # Save preview image
    frames_dir = os.path.join(BRD_FRAMES_DIR, capture.project_id)
    os.makedirs(frames_dir, exist_ok=True)
    preview_name = f"preview_{capture_id}.png"
    preview_path = os.path.join(frames_dir, preview_name)

    with open(preview_path, "wb") as f:
        f.write(await preview.read())

    capture.preview_image_path = preview_path
    if crop_region:
        import json as json_mod
        capture.edits_json = {**(capture.edits_json or {}), "crop_region": json_mod.loads(crop_region)}

    await db.commit()
    await db.refresh(capture)
    return {"preview_url": f"/api/brd/frames/{capture.project_id}/{preview_name}", "capture_id": capture_id}


# ─── Regenerate (Iterative Update) ───────────────────────────────────────────

@router.post("/projects/{project_id}/regenerate")
async def regenerate_brd(
    project_id: str,
    body: RegenerateRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(brd_role),
    db: AsyncSession = Depends(get_db),
):
    """
    Re-run the BRD generation pipeline with updated evidence.

    ITERATIVE UPDATE FLOW:
    1. User adds more videos/calls to an existing project
    2. User hits "Regenerate" → this endpoint
    3. Pipeline re-runs with ALL captures (old + new)
    4. Sections marked as is_manual_override=True are preserved
    5. Other sections are updated with new evidence + version snapshot

    If body.sections is provided, only those section_keys are regenerated.
    """
    project = await _get_project_or_404(db, project_id, user.id)

    # Clear manual_override flags so regeneration actually updates content
    if body.sections:
        # Targeted: clear only requested sections
        for section_key in body.sections:
            result = await db.execute(
                select(BrdSection).where(
                    BrdSection.project_id == project_id,
                    BrdSection.section_key == section_key,
                )
            )
            section = result.scalar_one_or_none()
            if section:
                section.is_manual_override = False
    else:
        # Regenerate All: clear ALL override flags
        all_sections = await db.execute(
            select(BrdSection).where(BrdSection.project_id == project_id)
        )
        for section in all_sections.scalars().all():
            section.is_manual_override = False

    await db.commit()

    project.status = "generating"
    await db.commit()

    background_tasks.add_task(
        _generate_brd_background,
        project_id,
        instruction=body.instruction,
        sections_to_generate=body.sections,
    )

    return {
        "message": "Regeneration started. Manually edited sections will be preserved unless specifically targeted.",
        "project_id": project_id,
        "status": "generating",
        "targeted_sections": body.sections,
    }


# ─── Status Polling ──────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/status")
async def get_project_status(
    project_id: str,
    user: User = Depends(brd_role),
    db: AsyncSession = Depends(get_db),
):
    """Poll project status (for async generation/export tracking)."""
    project = await _get_project_or_404(db, project_id, user.id)

    cap_result = await db.execute(
        select(func.count(BrdCapture.id)).where(BrdCapture.project_id == project_id)
    )
    total_captures = cap_result.scalar() or 0

    processing_result = await db.execute(
        select(func.count(BrdCapture.id)).where(
            BrdCapture.project_id == project_id, BrdCapture.llm_status == "processing"
        )
    )
    processing_captures = processing_result.scalar() or 0

    sec_result = await db.execute(
        select(func.count(BrdSection.id)).where(BrdSection.project_id == project_id)
    )
    total_sections = sec_result.scalar() or 0

    return {
        "project_id": project_id,
        "status": project.status,
        "captures": {"total": total_captures, "processing": processing_captures},
        "sections": total_sections,
    }


# ─── Static File Serving (Frames & Exports) ──────────────────────────────────

@router.get("/frames/{project_id}/{filename}")
async def serve_frame(project_id: str, filename: str):
    """Serve captured frame images with subdirectory and legacy root fallback."""
    base = os.path.join(BRD_FRAMES_DIR, project_id)
    candidates = [os.path.join(base, filename)]

    if os.path.isdir(base):
        for subdir in os.listdir(base):
            subpath = os.path.join(base, subdir, filename)
            candidates.append(subpath)

    # Legacy fallback: file saved at BRD_FRAMES_DIR root
    candidates.append(os.path.join(BRD_FRAMES_DIR, filename))

    for path in candidates:
        if os.path.exists(path):
            return FileResponse(path)

    raise HTTPException(status_code=404, detail="Frame not found")


@router.get("/exports/{project_name}/{filename}")
async def serve_export(project_name: str, filename: str):
    """Serve exported DOCX/PDF files."""
    path = os.path.join(BRD_EXPORTS_DIR, project_name, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Export file not found")
    return FileResponse(path, filename=filename)




async def _generate_brd_background(
    project_id: str,
    instruction: Optional[str] = None,
    sections_to_generate: Optional[List[str]] = None,
):
    """Background: Full or selective BRD generation pipeline."""
    from core.db import AsyncSessionLocal
    from brd_service.prompts import SECTION_DEFINITIONS

    async with AsyncSessionLocal() as session:
        try:
            # 1. Fetch all data
            cap_result = await session.execute(
                select(BrdCapture)
                .where(BrdCapture.project_id == project_id, BrdCapture.is_kept == True)
                .order_by(BrdCapture.order.asc())
            )
            captures = cap_result.scalars().all()

            vid_result = await session.execute(
                select(BrdVideo).where(BrdVideo.project_id == project_id)
                .order_by(BrdVideo.order.asc())
            )
            videos = vid_result.scalars().all()

            doc_result = await session.execute(
                select(BrdDocument).where(BrdDocument.project_id == project_id)
            )
            documents = doc_result.scalars().all()

            # Convert to dicts for pipeline
            capture_dicts = [_capture_to_dict(c) for c in captures]
            video_dicts = [
                {"filename": v.filename, "transcript_text": v.transcript_text}
                for v in videos
            ]
            doc_dicts = [
                {"filename": d.filename, "extracted_text": d.extracted_text}
                for d in documents
            ]

            # 2. Generate sections
            generated = await brd_pipeline.generate_full_brd(
                capture_dicts,
                video_dicts,
                doc_dicts,
                mode="default",
                instruction=instruction,
                sections_to_generate=sections_to_generate,
            )

            # 3. Upsert sections (skip manually overridden ones)
            for idx, gen_sec in enumerate(generated):
                if not gen_sec:  # Skip None from selective generation
                    continue
                key = gen_sec["section_key"]

                # Check if section already exists
                existing = await session.execute(
                    select(BrdSection).where(
                        BrdSection.project_id == project_id,
                        BrdSection.section_key == key,
                    )
                )
                section = existing.scalar_one_or_none()

                if section:
                    if section.is_manual_override:
                        logger.info(f"Skipping manually edited section: {key}")
                        continue

                    # Snapshot before regeneration
                    version = BrdVersion(
                        section_id=section.id,
                        version_number=section.version,
                        content_snapshot=section.content,
                    )
                    session.add(version)

                    section.content = gen_sec["content"]
                    section.version += 1
                else:
                    section = BrdSection(
                        project_id=project_id,
                        section_key=key,
                        title=gen_sec["title"],
                        content=gen_sec["content"],
                        order=idx,
                    )
                    session.add(section)

            # 4. Update project status
            prj_result = await session.execute(
                select(BrdProject).where(BrdProject.id == project_id)
            )
            project = prj_result.scalar_one_or_none()
            if project:
                project.status = "draft"

            await session.commit()
            logger.info(f"BRD generated for project {project_id}: {len(generated)} sections")

        except Exception as e:
            logger.error(f"BRD generation failed for {project_id}: {e}", exc_info=True)
            try:
                prj_result = await session.execute(
                    select(BrdProject).where(BrdProject.id == project_id)
                )
                project = prj_result.scalar_one_or_none()
                if project:
                    project.status = "error"
                await session.commit()
            except Exception:
                pass



async def _process_video_captures(
    project_id: str,
    video_id: str,
    video_path: str,
    db: AsyncSession,
):
    """Background: Extract frames + generate LLM descriptions."""
    from core.db import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        try:
            # 1. Smart capture (scene detect → fallback)
            # Save directly under project_id for flat serving structure
            frames_dir = os.path.join(BRD_FRAMES_DIR, project_id)
            os.makedirs(frames_dir, exist_ok=True)
            
            # Temporary directory for this video's extraction to avoid mixups before prefixing
            with tempfile.TemporaryDirectory() as tmp_dir:
                frames = await smart_capture(video_path, tmp_dir)

                # 2. Rename and create capture records
                capture_records = []
                for idx, frame in enumerate(frames):
                    # Prefix with video_id to ensure uniqueness in the project's flat folder
                    new_filename = f"{video_id}_{frame['filename']}"
                    new_path = os.path.join(frames_dir, new_filename)
                    os.rename(frame["path"], new_path)

                    capture = BrdCapture(
                        project_id=project_id,
                        video_id=video_id,
                        image_path=new_path,
                        timestamp=frame["timestamp"],
                        order=idx + 1,
                        label=f"Frame {idx + 1}",
                        llm_status="processing",
                    )
                    session.add(capture)
                    capture_records.append(capture)

            await session.commit()

            # 3. Async LLM description for each frame
            for capture in capture_records:
                try:
                    desc = await frame_describer.describe_frame(capture.image_path)
                    capture.ocr_text = desc.get("ocr_text", "")
                    capture.description = desc.get("description", "")
                    capture.details_json = desc
                    capture.llm_status = "done"
                except Exception as e:
                    logger.error(f"LLM description failed for capture {capture.id}: {e}")
                    capture.llm_status = "error"
                    capture.description = f"Error: {e}"

            # 4. Update video status
            result = await session.execute(
                select(BrdVideo).where(BrdVideo.id == video_id)
            )
            video = result.scalar_one_or_none()
            if video:
                video.status = "ready"

            await session.commit()
            logger.info(f"Video {video_id}: processed {len(capture_records)} captures")

        except Exception as e:
            logger.error(f"Video processing failed for {video_id}: {e}")
            try:
                result = await session.execute(
                    select(BrdVideo).where(BrdVideo.id == video_id)
                )
                video = result.scalar_one_or_none()
                if video:
                    video.status = "error"
                await session.commit()
            except Exception:
                pass


async def _describe_single_capture(capture_id: str, image_path: str, db: AsyncSession):
    """Background: Generate LLM description for a single custom capture."""
    from core.db import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        try:
            desc = await frame_describer.describe_frame(image_path)
            result = await session.execute(
                select(BrdCapture).where(BrdCapture.id == capture_id)
            )
            capture = result.scalar_one_or_none()
            if capture:
                capture.ocr_text = desc.get("ocr_text", "")
                capture.description = desc.get("description", "")
                capture.details_json = desc
                capture.llm_status = "done"
                await session.commit()
        except Exception as e:
            logger.error(f"Custom capture description failed: {e}")
            try:
                result = await session.execute(
                    select(BrdCapture).where(BrdCapture.id == capture_id)
                )
                capture = result.scalar_one_or_none()
                if capture:
                    capture.llm_status = "error"
                    await session.commit()
            except Exception:
                pass


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _get_project_or_404(db: AsyncSession, project_id: str, user_id: str) -> BrdProject:
    result = await db.execute(
        select(BrdProject).where(BrdProject.id == project_id, BrdProject.user_id == user_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _project_to_dict(p: BrdProject) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "client_name": p.client_name,
        "process_name": p.process_name,
        "ba_name": p.ba_name,
        "status": p.status,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


def _project_full_dict(p: BrdProject) -> dict:
    d = _project_to_dict(p)
    d["videos"] = [
        {
            "id": v.id, "filename": v.filename, "duration": v.duration,
            "order": v.order, "status": v.status,
            "has_transcript": bool(v.transcript_text),
        }
        for v in (p.videos or [])
    ]
    d["captures"] = [_capture_to_dict(c) for c in (p.captures or [])]
    d["sections"] = [_section_to_dict(s) for s in (p.sections or [])]
    d["documents"] = [
        {"id": doc.id, "filename": doc.filename}
        for doc in (p.documents or [])
    ]
    return d


def _capture_to_dict(c: BrdCapture) -> dict:
    preview_path = c.preview_image_path
    display_path = preview_path if (preview_path and os.path.exists(preview_path)) else c.image_path
    return {
        "id": c.id,
        "project_id": c.project_id,
        "video_id": c.video_id,
        "image_path": c.image_path,
        "preview_image_path": c.preview_image_path,
        "image_url": f"/api/brd/frames/{c.project_id}/{os.path.basename(display_path)}" if display_path else None,
        "timestamp": c.timestamp,
        "order": c.order,
        "label": c.label,
        "is_kept": c.is_kept,
        "is_custom": c.is_custom,
        "ocr_text": c.ocr_text,
        "description": c.description,
        "details_json": c.details_json,
        "edits_json": c.edits_json,
        "llm_status": c.llm_status,
    }


def _section_to_dict(s: BrdSection) -> dict:
    return {
        "id": s.id,
        "section_key": s.section_key,
        "title": s.title,
        "content": s.content,
        "order": s.order,
        "version": s.version,
        "is_manual_override": s.is_manual_override,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }
