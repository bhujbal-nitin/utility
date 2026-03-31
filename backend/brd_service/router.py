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
import time
import json as json_mod
from urllib.parse import quote_plus
from pathlib import Path
from typing import Optional, List
from collections import defaultdict, deque
import httpx

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from sqlalchemy import update
from pydantic import BaseModel
from jose import jwt

from core.db import get_db
from core.deps import RequireRole
from core.config import settings
from auth_service.models import User, RoleEnum

from brd_service.models import (
    BrdProject, BrdVideo, BrdCapture, BrdSection, BrdVersion, BrdDocument
)
from brd_service.video_processor import (
    extract_frames_scene_detect,
    extract_frames_interval,
    postprocess_frames_iter,
    get_video_duration,
)
from brd_service.frame_describer import frame_describer
from brd_service.brd_pipeline import brd_pipeline
from brd_service.export_service import ExportService
from brd_service.extract_utils import extract_text_from_file
from brd_service.video_processor import postprocess_frames

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

_RATE_LIMIT_BUCKETS = defaultdict(deque)


def _rate_limit_or_429(user_id: str, action: str, limit: int, window_sec: int) -> None:
    """Simple in-memory per-user rate limit guard."""
    key = f"{action}:{user_id}"
    now = time.time()
    q = _RATE_LIMIT_BUCKETS[key]
    while q and (now - q[0]) > window_sec:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(status_code=429, detail=f"Rate limit exceeded for {action}. Try again shortly.")
    q.append(now)


def _assert_safe_file_upload(file: UploadFile, allowed_ext: set[str], max_size_mb: int = 500) -> None:
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="Missing upload file.")
    suffix = Path(file.filename).suffix.lower()
    if suffix not in allowed_ext:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {suffix}")
    # Content length isn't guaranteed here, so size validation is best-effort at ingress.
    # Keep hard cap via reverse proxy (Nginx) too.
    # This guard remains intentionally lightweight for streamed uploads.


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


class TranscriptOnlyUpload(BaseModel):
    transcript: str
    source_name: Optional[str] = None


class EditorCallbackPayload(BaseModel):
    status: Optional[int] = None
    key: Optional[str] = None
    url: Optional[str] = None
    users: Optional[List[str]] = None
    token: Optional[str] = None


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


@router.post("/projects/{project_id}/cancel")
async def cancel_project_processing(
    project_id: str,
    user: User = Depends(brd_role),
    db: AsyncSession = Depends(get_db),
):
    """
    Cancel in-progress capture + description jobs for a project.
    Background tasks periodically check `project.status == "cancelled"` and bail out early.
    """
    project = await _get_project_or_404(db, project_id, user.id)
    project.status = "cancelled"

    # Mark related assets as cancelled/error so the UI stops showing them as active.
    await db.execute(update(BrdVideo).where(BrdVideo.project_id == project_id).values(status="cancelled"))
    await db.execute(update(BrdCapture).where(BrdCapture.project_id == project_id).values(llm_status="cancelled"))
    await db.commit()
    return {"cancelled": True}


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
    _rate_limit_or_429(user.id, "upload_video", limit=20, window_sec=300)
    _assert_safe_file_upload(video, allowed_ext={".mp4", ".mov", ".mkv", ".avi", ".webm"})
    if transcript_file:
        _assert_safe_file_upload(transcript_file, allowed_ext={".txt", ".pdf", ".docx"})

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
    segments = _parse_transcript_segments(full_transcript, duration=duration) if full_transcript else []

    video_record = BrdVideo(
        id=video_id,
        project_id=project_id,
        filename=video.filename,
        path=video_path,
        duration=duration,
        order=max_order + 1,
        transcript_text=full_transcript or "",
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
    _rate_limit_or_429(user.id, "upload_transcript", limit=30, window_sec=300)
    await _get_project_or_404(db, project_id, user.id)

    result = await db.execute(
        select(BrdVideo).where(BrdVideo.id == video_id, BrdVideo.project_id == project_id)
    )
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    video.transcript_text = transcript
    video.transcript_segments = _parse_transcript_segments(transcript, duration=video.duration)
    await db.commit()
    return {"updated": True, "video_id": video_id}


@router.delete("/projects/{project_id}/videos/{video_id}")
async def delete_video_asset(
    project_id: str,
    video_id: str,
    user: User = Depends(brd_role),
    db: AsyncSession = Depends(get_db),
):
    """Delete a video asset and its linked captures/files."""
    _rate_limit_or_429(user.id, "delete_video_asset", limit=60, window_sec=300)
    await _get_project_or_404(db, project_id, user.id)

    result = await db.execute(
        select(BrdVideo).where(BrdVideo.id == video_id, BrdVideo.project_id == project_id)
    )
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    cap_result = await db.execute(
        select(BrdCapture).where(
            BrdCapture.project_id == project_id,
            BrdCapture.video_id == video_id,
        )
    )
    linked_captures = cap_result.scalars().all()
    deleted_capture_count = 0
    for cap in linked_captures:
        for p in [cap.image_path, cap.preview_image_path]:
            if p and os.path.exists(p):
                try:
                    os.remove(p)
                except OSError:
                    pass
        await db.delete(cap)
        deleted_capture_count += 1

    if video.path and os.path.exists(video.path):
        try:
            os.remove(video.path)
        except OSError:
            pass

    await db.delete(video)
    await db.commit()
    return {"deleted": True, "video_id": video_id, "deleted_captures": deleted_capture_count}


@router.post("/projects/{project_id}/transcript-only")
async def upload_transcript_only(
    project_id: str,
    body: TranscriptOnlyUpload,
    user: User = Depends(brd_role),
    db: AsyncSession = Depends(get_db),
):
    """
    Transcript-only ingestion mode for BRD generation without a video file.
    Creates a synthetic video evidence record with transcript payload.
    """
    _rate_limit_or_429(user.id, "upload_transcript_only", limit=30, window_sec=300)
    await _get_project_or_404(db, project_id, user.id)
    transcript = (body.transcript or "").strip()
    if not transcript:
        raise HTTPException(status_code=400, detail="Transcript text is required.")

    result = await db.execute(
        select(func.max(BrdVideo.order)).where(BrdVideo.project_id == project_id)
    )
    max_order = result.scalar() or 0

    video_id = str(uuid.uuid4())
    source_name = (body.source_name or "Transcript Only Input").strip() or "Transcript Only Input"
    segments = _parse_transcript_segments(transcript, duration=0.0)
    synthetic = BrdVideo(
        id=video_id,
        project_id=project_id,
        filename=f"{source_name}.txt",
        path="",
        duration=0.0,
        order=max_order + 1,
        transcript_text=transcript,
        transcript_segments=segments,
        status="ready",
    )
    db.add(synthetic)
    await db.commit()
    await db.refresh(synthetic)
    return {
        "video_id": synthetic.id,
        "filename": synthetic.filename,
        "status": synthetic.status,
        "mode": "transcript_only",
    }


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
        .order_by(BrdCapture.timestamp.asc(), BrdCapture.id.asc())
    )
    captures = result.scalars().all()
    return [_capture_to_dict(c) for c in captures]


@router.post("/projects/{project_id}/captures")
async def add_custom_capture(
    project_id: str,
    background_tasks: BackgroundTasks,
    image: UploadFile = File(...),
    label: str = Form("Custom Screenshot"),
    timestamp: Optional[float] = Form(None),
    video_id: Optional[str] = Form(None),
    user: User = Depends(brd_role),
    db: AsyncSession = Depends(get_db),
):
    """Upload a custom screenshot — crops/sanitizes and queues description (on-demand in Step 2)."""
    _rate_limit_or_429(user.id, "add_custom_capture", limit=120, window_sec=300)
    _assert_safe_file_upload(image, allowed_ext={".jpg", ".jpeg", ".png", ".webp"})
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

    # Apply the same Teams cleanup pipeline for manual uploads.
    ts_val = float(timestamp) if timestamp is not None else 0.0
    processed = await postprocess_frames(
        [{"filename": img_name, "path": img_path, "timestamp": ts_val}]
    )
    if not processed:
        raise HTTPException(
            status_code=400,
            detail="Uploaded frame appears to be a Teams gallery/shell frame and was filtered out.",
        )
    frame_meta = processed[0]

    # Insert in stable timestamp order when provided; otherwise append.
    existing_result = await db.execute(
        select(BrdCapture)
        .where(BrdCapture.project_id == project_id)
        .order_by(BrdCapture.order.asc(), BrdCapture.timestamp.asc(), BrdCapture.id.asc())
    )
    existing_caps = existing_result.scalars().all()
    ts_val = float(timestamp) if timestamp is not None else None
    if ts_val is None:
        insert_pos = len(existing_caps)
    else:
        insert_pos = 0
        for i, cap in enumerate(existing_caps):
            if float(cap.timestamp or 0.0) <= ts_val:
                insert_pos = i + 1
    for cap in existing_caps[insert_pos:]:
        cap.order = int(cap.order or 0) + 1

    capture = BrdCapture(
        id=capture_id,
        project_id=project_id,
        video_id=video_id,
        image_path=img_path,
        timestamp=ts_val or 0.0,
        order=insert_pos + 1,
        label=label,
        is_custom=True,
        llm_status="pending",
        edits_json={"auto_crop": frame_meta.get("auto_crop")} if frame_meta.get("auto_crop") else {},
    )
    db.add(capture)
    await db.commit()
    await db.refresh(capture)

    return _capture_to_dict(capture)


@router.post("/captures/{capture_id}/describe")
async def describe_single_capture(
    capture_id: str,
    background_tasks: BackgroundTasks,
    user: User = Depends(brd_role),
    db: AsyncSession = Depends(get_db),
):
    """Trigger LLM description for a single capture (Step 2 per-image button)."""
    capture = await _get_capture_for_user_or_404(db, capture_id, user.id)
    if not capture.image_path or not os.path.exists(capture.image_path):
        raise HTTPException(status_code=400, detail="Capture image is missing.")

    # If already running, just return current state.
    if capture.llm_status == "processing":
        return _capture_to_dict(capture)

    # Reset any prior partial text (so user sees fresh generation when it completes).
    capture.ocr_text = ""
    capture.description = ""
    capture.details_json = dict(capture.details_json or {})
    capture.llm_status = "processing"
    await db.commit()
    await db.refresh(capture)

    # Background LLM description
    background_tasks.add_task(_describe_single_capture, capture_id, capture.image_path, db)

    return _capture_to_dict(capture)


@router.put("/captures/{capture_id}/image")
async def update_capture_image(
    capture_id: str,
    image: UploadFile = File(...),
    user: User = Depends(brd_role),
    db: AsyncSession = Depends(get_db),
):
    """Overwrite a capture's image file (e.g., after crop/annotate)."""
    _rate_limit_or_429(user.id, "update_capture_image", limit=120, window_sec=300)
    _assert_safe_file_upload(image, allowed_ext={".jpg", ".jpeg", ".png", ".webp"})
    capture = await _get_capture_for_user_or_404(db, capture_id, user.id)

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
    _rate_limit_or_429(user.id, "update_capture", limit=300, window_sec=300)
    capture = await _get_capture_for_user_or_404(db, capture_id, user.id)

    update_data = body.model_dump(exclude_unset=True)
    # Timestamp ordering is canonical; ignore drag/drop order mutations.
    update_data.pop("order", None)
    for field, value in update_data.items():
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
    _rate_limit_or_429(user.id, "delete_capture", limit=80, window_sec=300)
    capture = await _get_capture_for_user_or_404(db, capture_id, user.id)

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
    _rate_limit_or_429(user.id, "save_section", limit=500, window_sec=300)
    section = await _get_section_for_user_or_404(db, section_id, user.id)

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
    section = await _get_section_for_user_or_404(db, section_id, user.id)
    result = await db.execute(
        select(BrdVersion)
        .where(BrdVersion.section_id == section.id)
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
    _rate_limit_or_429(user.id, "restore_section_version", limit=80, window_sec=300)
    section = await _get_section_for_user_or_404(db, section_id, user.id)

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
    _rate_limit_or_429(user.id, "refine_section", limit=60, window_sec=300)
    section = await _get_section_for_user_or_404(db, section_id, user.id)

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
    _rate_limit_or_429(user.id, "generate_brd", limit=10, window_sec=300)
    project = await _get_project_or_404(db, project_id, user.id)

    # Validate: need evidence (captures OR transcript/docs)
    cap_result = await db.execute(
        select(func.count(BrdCapture.id))
        .where(BrdCapture.project_id == project_id, BrdCapture.is_kept == True)
    )
    cap_count = cap_result.scalar() or 0
    transcript_result = await db.execute(
        select(func.count(BrdVideo.id)).where(
            BrdVideo.project_id == project_id,
            func.length(func.trim(BrdVideo.transcript_text)) > 0,
        )
    )
    transcript_count = transcript_result.scalar() or 0
    doc_result = await db.execute(
        select(func.count(BrdDocument.id)).where(
            BrdDocument.project_id == project_id,
            func.length(func.trim(BrdDocument.extracted_text)) > 0,
        )
    )
    doc_count = doc_result.scalar() or 0
    if cap_count == 0 and transcript_count == 0 and doc_count == 0:
        raise HTTPException(
            status_code=400,
            detail="No usable evidence found. Upload captures, transcript, or supporting documents first."
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
        "transcripts": transcript_count,
        "documents": doc_count,
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
    _rate_limit_or_429(user.id, "export_brd", limit=20, window_sec=300)
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
    _rate_limit_or_429(user.id, "upload_document", limit=40, window_sec=300)
    _assert_safe_file_upload(file, allowed_ext={".txt", ".pdf", ".docx"})
    await _get_project_or_404(db, project_id, user.id)

    docs_dir = os.path.join(BRD_DOCS_DIR, project_id)
    os.makedirs(docs_dir, exist_ok=True)
    doc_id = str(uuid.uuid4())
    file_path = os.path.join(docs_dir, f"{doc_id}_{file.filename}")

    with open(file_path, "wb") as f:
        f.write(await file.read())

    # Extract text from txt/pdf/docx
    extracted = await extract_text_from_file(file_path) or ""

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


@router.delete("/projects/{project_id}/documents/{document_id}")
async def delete_document_asset(
    project_id: str,
    document_id: str,
    user: User = Depends(brd_role),
    db: AsyncSession = Depends(get_db),
):
    """Delete a supporting document asset."""
    _rate_limit_or_429(user.id, "delete_document_asset", limit=80, window_sec=300)
    await _get_project_or_404(db, project_id, user.id)
    result = await db.execute(
        select(BrdDocument).where(BrdDocument.id == document_id, BrdDocument.project_id == project_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.path and os.path.exists(doc.path):
        try:
            os.remove(doc.path)
        except OSError:
            pass
    await db.delete(doc)
    await db.commit()
    return {"deleted": True, "document_id": document_id}


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
    _rate_limit_or_429(user.id, "upload_capture_preview", limit=120, window_sec=300)
    _assert_safe_file_upload(preview, allowed_ext={".jpg", ".jpeg", ".png", ".webp"})
    capture = await _get_capture_for_user_or_404(db, capture_id, user.id)

    # Save preview image
    frames_dir = os.path.join(BRD_FRAMES_DIR, capture.project_id)
    os.makedirs(frames_dir, exist_ok=True)
    preview_name = f"preview_{capture_id}.png"
    preview_path = os.path.join(frames_dir, preview_name)

    with open(preview_path, "wb") as f:
        f.write(await preview.read())

    capture.preview_image_path = preview_path
    if crop_region:
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
    _rate_limit_or_429(user.id, "regenerate_brd", limit=20, window_sec=300)
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

    video_processing_result = await db.execute(
        select(func.count(BrdVideo.id)).where(
            BrdVideo.project_id == project_id,
            BrdVideo.status == "processing",
        )
    )
    videos_processing = video_processing_result.scalar() or 0

    sec_result = await db.execute(
        select(func.count(BrdSection.id)).where(BrdSection.project_id == project_id)
    )
    total_sections = sec_result.scalar() or 0

    return {
        "project_id": project_id,
        "status": project.status,
        "captures": {"total": total_captures, "processing": processing_captures},
        "videos": {"processing": videos_processing},
        "sections": total_sections,
    }


@router.get("/projects/{project_id}/assets")
async def list_project_assets(
    project_id: str,
    user: User = Depends(brd_role),
    db: AsyncSession = Depends(get_db),
):
    """Unified asset view for Step 1/2/3 panels."""
    await _get_project_or_404(db, project_id, user.id)
    videos = (
        await db.execute(
            select(BrdVideo).where(BrdVideo.project_id == project_id).order_by(BrdVideo.order.asc(), BrdVideo.created_at.asc())
        )
    ).scalars().all()
    docs = (
        await db.execute(
            select(BrdDocument).where(BrdDocument.project_id == project_id).order_by(BrdDocument.created_at.asc())
        )
    ).scalars().all()
    captures = (
        await db.execute(
            select(BrdCapture)
            .where(BrdCapture.project_id == project_id)
            .order_by(BrdCapture.timestamp.asc(), BrdCapture.id.asc())
        )
    ).scalars().all()
    return {
        "videos": [
            {
                "id": v.id,
                "filename": v.filename,
                "status": v.status,
                "duration": v.duration,
                "has_transcript": bool((v.transcript_text or "").strip()),
                "video_url": f"/api/brd/videos/{project_id}/{Path(v.path).name}" if v.path else None,
                "created_at": v.created_at.isoformat() if v.created_at else None,
            }
            for v in videos
        ],
        "documents": [
            {
                "id": d.id,
                "filename": d.filename,
                "has_text": bool((d.extracted_text or "").strip()),
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in docs
        ],
        "captures": [_capture_to_dict(c) for c in captures],
    }


@router.get("/projects/{project_id}/regeneration-recommendation")
async def regeneration_recommendation(
    project_id: str,
    user: User = Depends(brd_role),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns whether a regenerate suggestion should be shown, and why.
    This is conservative and user-facing; it avoids false negatives.
    """
    project = await _get_project_or_404(db, project_id, user.id)
    videos = (
        await db.execute(select(BrdVideo).where(BrdVideo.project_id == project_id))
    ).scalars().all()
    docs = (
        await db.execute(select(BrdDocument).where(BrdDocument.project_id == project_id))
    ).scalars().all()
    captures = (
        await db.execute(select(BrdCapture).where(BrdCapture.project_id == project_id, BrdCapture.is_kept == True))
    ).scalars().all()
    sections_count = (
        await db.execute(select(func.count(BrdSection.id)).where(BrdSection.project_id == project_id))
    ).scalar() or 0

    reasons: List[str] = []
    if sections_count == 0:
        reasons.append("No BRD sections generated yet.")
    if any(v.status != "ready" for v in videos):
        reasons.append("Some uploaded videos are still processing.")
    if any(c.llm_status in ("pending", "processing") for c in captures):
        reasons.append("Some captures are still being analyzed.")
    if any(not (v.transcript_text or "").strip() for v in videos):
        reasons.append("One or more videos do not have transcript text yet.")
    if any(not (d.extracted_text or "").strip() for d in docs):
        reasons.append("One or more supporting documents have no extracted text yet.")
    if project.status in ("draft", "in_review") and captures:
        reasons.append("New or updated evidence may improve section quality.")

    return {
        "should_regenerate": bool(reasons),
        "reasons": reasons,
        "project_status": project.status,
        "counts": {
            "videos": len(videos),
            "documents": len(docs),
            "captures_kept": len(captures),
            "sections": sections_count,
        },
    }


@router.post("/projects/{project_id}/editor/session")
async def create_editor_session(
    project_id: str,
    user: User = Depends(brd_role),
    db: AsyncSession = Depends(get_db),
):
    """
    Create enterprise DOCX editor session config.
    This is a secure scaffold for OnlyOffice/Collabora style embedding.
    """
    _rate_limit_or_429(user.id, "editor_session", limit=60, window_sec=300)
    project = await _get_project_or_404(db, project_id, user.id)

    # Generate latest canonical docx from template mapping.
    result = await db.execute(select(BrdSection).where(BrdSection.project_id == project_id))
    sections = result.scalars().all()
    if not sections:
        raise HTTPException(status_code=400, detail="No BRD sections found. Generate BRD first.")
    caps = (
        await db.execute(select(BrdCapture).where(BrdCapture.project_id == project_id, BrdCapture.is_kept == True))
    ).scalars().all()
    export_svc = ExportService(BRD_FRAMES_DIR, BRD_EXPORTS_DIR)
    meta = {
        "client_name": project.client_name,
        "process_name": project.process_name,
        "ba_name": project.ba_name,
    }
    file_path = await export_svc.export_docx_from_template(
        project.name,
        [_section_to_dict(s) for s in sections],
        [_capture_to_dict(c) for c in caps],
        meta,
    )
    rel_path = os.path.relpath(file_path, BRD_EXPORTS_DIR).replace(os.sep, "/")
    # Use configured public base URL if available, otherwise assume same host.
    public_base = (settings.DOCX_EDITOR_PUBLIC_BASE_URL or "").rstrip("/")
    file_url = f"{public_base}/api/brd/exports/{rel_path}" if public_base else f"/api/brd/exports/{rel_path}"

    if not settings.DOCX_EDITOR_ENABLED or not settings.DOCX_EDITOR_URL:
        return {
            "enabled": False,
            "message": "Enterprise DOCX editor is not enabled in server config.",
            "file_url": file_url,
            "download_url": f"/api/brd/exports/{rel_path}",
        }

    doc_key = f"{project_id}:{int(time.time())}"
    callback_url = f"{public_base}/api/brd/projects/{project_id}/editor/callback" if public_base else f"/api/brd/projects/{project_id}/editor/callback"
    callback_token = ""
    payload = {
        "project_id": project_id,
        "user_id": user.id,
        "email": user.email,
        "doc_key": doc_key,
    }
    token = ""
    if settings.DOCX_EDITOR_JWT_SECRET:
        token = jwt.encode(payload, settings.DOCX_EDITOR_JWT_SECRET, algorithm="HS256")
        callback_token = jwt.encode(
            {
                "project_id": project_id,
                "doc_key": doc_key,
                "purpose": "editor_callback",
            },
            settings.DOCX_EDITOR_JWT_SECRET,
            algorithm="HS256",
        )
        callback_url = f"{callback_url}?token={quote_plus(callback_token)}"

    external_url = (
        f"{settings.DOCX_EDITOR_URL}"
        f"?fileUrl={quote_plus(file_url)}"
        f"&title={quote_plus(project.name or 'BRD')}"
        f"&callbackUrl={quote_plus(callback_url)}"
    )
    if token:
        external_url += f"&token={quote_plus(token)}"

    return {
        "enabled": True,
        "editor_url": external_url,
        "file_url": file_url,
        "callback_url": callback_url,
        "doc_key": doc_key,
        "token": token,
        "callback_token": callback_token,
    }


@router.post("/projects/{project_id}/editor/callback")
async def editor_callback(
    project_id: str,
    body: EditorCallbackPayload,
    token: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Placeholder callback endpoint for enterprise editor save events.
    Safe scaffold: logs callback details for audit.
    """
    prj = await db.execute(select(BrdProject).where(BrdProject.id == project_id))
    project = prj.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if settings.DOCX_EDITOR_JWT_SECRET:
        provided_token = token or body.token
        if not provided_token:
            raise HTTPException(status_code=401, detail="Missing callback token")
        try:
            decoded = jwt.decode(
                provided_token,
                settings.DOCX_EDITOR_JWT_SECRET,
                algorithms=["HS256"],
            )
            if (
                decoded.get("purpose") != "editor_callback"
                or decoded.get("project_id") != project_id
            ):
                raise HTTPException(status_code=401, detail="Invalid callback token")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid callback token")

    save_statuses = {2, 6}
    if body.status in save_statuses and body.url:
        try:
            docs_dir = os.path.join(BRD_DOCS_DIR, project_id, "editor")
            os.makedirs(docs_dir, exist_ok=True)
            timestamp = int(time.time())
            saved_name = f"edited_brd_{timestamp}.docx"
            saved_path = os.path.join(docs_dir, saved_name)

            async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
                resp = await client.get(body.url)
                resp.raise_for_status()
                with open(saved_path, "wb") as f:
                    f.write(resp.content)

            edited_doc = BrdDocument(
                id=str(uuid.uuid4()),
                project_id=project_id,
                filename=saved_name,
                path=saved_path,
                extracted_text="",
            )
            db.add(edited_doc)
            project.status = "draft"
            await db.commit()
            logger.info("Editor callback saved updated DOCX for project=%s path=%s", project_id, saved_path)
        except Exception as e:
            logger.error("Editor callback failed to persist DOCX for project=%s: %s", project_id, e, exc_info=True)
            return {"error": 1}
    logger.info(
        "Editor callback received project=%s status=%s key=%s url=%s",
        project_id,
        body.status,
        body.key,
        bool(body.url),
    )
    return {"error": 0}


@router.get("/projects/{project_id}/editor/latest")
async def get_latest_editor_doc(
    project_id: str,
    user: User = Depends(brd_role),
    db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, user.id)
    editor_dir = os.path.join(BRD_DOCS_DIR, project_id, "editor")
    if not os.path.isdir(editor_dir):
        return {"found": False}
    candidates = [
        os.path.join(editor_dir, name)
        for name in os.listdir(editor_dir)
        if name.lower().endswith(".docx")
    ]
    if not candidates:
        return {"found": False}
    latest = max(candidates, key=os.path.getmtime)
    return {
        "found": True,
        "filename": os.path.basename(latest),
        "download_url": f"/api/brd/documents/{project_id}/editor/{os.path.basename(latest)}",
    }


@router.get("/documents/{project_id}/editor/{filename}")
async def serve_editor_document(project_id: str, filename: str):
    if Path(filename).name != filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    if Path(project_id).name != project_id:
        raise HTTPException(status_code=400, detail="Invalid project id")
    path = os.path.join(BRD_DOCS_DIR, project_id, "editor", filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Document not found")
    return FileResponse(path, filename=filename)


# ─── Static File Serving (Frames & Exports) ──────────────────────────────────

@router.get("/frames/{project_id}/{filename}")
async def serve_frame(project_id: str, filename: str):
    """Serve captured frame images with subdirectory and legacy root fallback."""
    if Path(filename).name != filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    if Path(project_id).name != project_id:
        raise HTTPException(status_code=400, detail="Invalid project id")
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


@router.get("/videos/{project_id}/{filename}")
async def serve_video(project_id: str, filename: str):
    """Serve uploaded source videos for in-app preview/manual capture."""
    if Path(filename).name != filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    if Path(project_id).name != project_id:
        raise HTTPException(status_code=400, detail="Invalid project id")
    video_dir = os.path.join(BRD_VIDEOS_DIR, project_id)
    path = os.path.join(video_dir, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Video not found")
    return FileResponse(path)


@router.get("/exports/{project_name}/{filename}")
async def serve_export(project_name: str, filename: str):
    """Serve exported DOCX/PDF files."""
    if Path(filename).name != filename or Path(project_name).name != project_name:
        raise HTTPException(status_code=400, detail="Invalid export path")
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
                .order_by(BrdCapture.timestamp.asc(), BrdCapture.id.asc())
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
                {
                    "filename": v.filename,
                    "order": v.order,
                    "transcript_text": v.transcript_text,
                    "transcript_segments": v.transcript_segments or [],
                }
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
            if not generated:
                raise RuntimeError("BRD generation produced no sections from available evidence.")

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
                        order=idx + 1,
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
    """Background: Extract frames + crop/filter; AI descriptions are on-demand in Step 2."""
    from core.db import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        try:
            async def _is_cancelled() -> bool:
                prj_status = await session.execute(
                    select(BrdProject.status).where(BrdProject.id == project_id)
                )
                status = prj_status.scalar_one_or_none()
                # Treat missing project as cancelled so background tasks stop after the UI deletes the project.
                return status is None or status == "cancelled"

            if await _is_cancelled():
                return

            t0 = time.perf_counter()
            # 1) Extract frames (scene-detect → interval fallback)
            frames_dir = os.path.join(BRD_FRAMES_DIR, project_id)
            os.makedirs(frames_dir, exist_ok=True)

            with tempfile.TemporaryDirectory() as tmp_dir:
                if await _is_cancelled():
                    return

                raw_frames = await extract_frames_scene_detect(
                    video_path,
                    tmp_dir,
                    min_interval=float(settings.BRD_MIN_CAPTURE_INTERVAL_SEC or 1.5),
                    max_frames=int(settings.BRD_MAX_CAPTURE_FRAMES or 36),
                )

                # If too few frames, fallback to interval extraction.
                if len(raw_frames) < 5:
                    raw_frames = await extract_frames_interval(
                        video_path,
                        tmp_dir,
                        max_frames=int(settings.BRD_MAX_CAPTURE_FRAMES or 36),
                    )

                raw_frames = sorted(
                    raw_frames,
                    key=lambda f: (float(f.get("timestamp", 0.0)), f.get("filename", "")),
                )

                logger.info(
                    "Video %s extracted %s raw frames in %.2fs",
                    video_id,
                    len(raw_frames),
                    time.perf_counter() - t0,
                )

                # Build transcript segments for +/-5 context windowing.
                vid_result = await session.execute(select(BrdVideo).where(BrdVideo.id == video_id))
                video_rec = vid_result.scalar_one_or_none()
                transcript_segments = (video_rec.transcript_segments or []) if video_rec else []

                # 2) Crop + filter frames, persist capture records incrementally (live UI).
                inserted = 0
                for frame in postprocess_frames_iter(raw_frames):
                    if await _is_cancelled():
                        return

                    new_filename = f"{video_id}_{frame['filename']}"
                    new_path = os.path.join(frames_dir, new_filename)
                    os.rename(frame["path"], new_path)

                    existing_result = await session.execute(
                        select(BrdCapture)
                        .where(BrdCapture.project_id == project_id)
                        .order_by(BrdCapture.order.asc(), BrdCapture.timestamp.asc(), BrdCapture.id.asc())
                    )
                    existing_caps = existing_result.scalars().all()

                    insert_pos = 0
                    frame_ts = float(frame.get("timestamp", 0.0))
                    for i, cap in enumerate(existing_caps):
                        if float(cap.timestamp or 0.0) <= frame_ts:
                            insert_pos = i + 1

                    for cap in existing_caps[insert_pos:]:
                        cap.order = int(cap.order or 0) + 1

                    ctx_window = _transcript_window_for_timestamp(transcript_segments, frame_ts, window=5)
                    capture = BrdCapture(
                        project_id=project_id,
                        video_id=video_id,
                        image_path=new_path,
                        timestamp=frame_ts,
                        order=insert_pos + 1,
                        label=f"Frame {insert_pos + 1}",
                        llm_status="pending",
                        edits_json={"auto_crop": frame.get("auto_crop")} if frame.get("auto_crop") else {},
                        details_json={"transcript_context_window": ctx_window},
                    )
                    session.add(capture)
                    await session.flush()
                    inserted += 1
                    await session.commit()  # persist incrementally for live Step 1 UI

                # 3) Update video status
                result = await session.execute(select(BrdVideo).where(BrdVideo.id == video_id))
                video = result.scalar_one_or_none()
                if video:
                    video.status = "ready"
                await session.commit()

                logger.info(
                    "Video %s cropped/queued %s captures in %.2fs",
                    video_id,
                    inserted,
                    time.perf_counter() - t0,
                )

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
            async def _is_cancelled_for_project(_project_id: str) -> bool:
                prj_status = await session.execute(
                    select(BrdProject.status).where(BrdProject.id == _project_id)
                )
                status = prj_status.scalar_one_or_none()
                # Treat missing project as cancelled so background tasks stop after the UI deletes the project.
                return status is None or status == "cancelled"

            result = await session.execute(
                select(BrdCapture).where(BrdCapture.id == capture_id)
            )
            capture = result.scalar_one_or_none()
            if capture:
                if await _is_cancelled_for_project(capture.project_id):
                    return

                transcript_ctx: List[dict] = []
                if capture.video_id:
                    v_result = await session.execute(select(BrdVideo).where(BrdVideo.id == capture.video_id))
                    vid = v_result.scalar_one_or_none()
                    if vid and vid.transcript_segments:
                        transcript_ctx = _transcript_window_for_timestamp(
                            vid.transcript_segments or [],
                            float(capture.timestamp or 0.0),
                            window=5,
                        )
                desc = await frame_describer.describe_frame(image_path, transcript_context=transcript_ctx)
                if await _is_cancelled_for_project(capture.project_id):
                    return
                capture.ocr_text = desc.get("ocr_text", "")
                capture.description = desc.get("description", "")
                capture.details_json = {**(capture.details_json or {}), **desc, "transcript_context_window": transcript_ctx}
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


async def _get_capture_for_user_or_404(db: AsyncSession, capture_id: str, user_id: str) -> BrdCapture:
    result = await db.execute(
        select(BrdCapture)
        .join(BrdProject, BrdProject.id == BrdCapture.project_id)
        .where(BrdCapture.id == capture_id, BrdProject.user_id == user_id)
    )
    capture = result.scalar_one_or_none()
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")
    return capture


async def _get_section_for_user_or_404(db: AsyncSession, section_id: str, user_id: str) -> BrdSection:
    result = await db.execute(
        select(BrdSection)
        .join(BrdProject, BrdProject.id == BrdSection.project_id)
        .where(BrdSection.id == section_id, BrdProject.user_id == user_id)
    )
    section = result.scalar_one_or_none()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    return section


def _parse_transcript_segments(transcript: str, duration: float = 0.0) -> List[dict]:
    """
    Parse transcript into timestamped segments.
    Supports lines like:
      [00:12] Speaker: text
      00:12:34 text
    Falls back to a single segment when no timestamps are found.
    """
    segments: List[dict] = []
    if not transcript or not transcript.strip():
        return segments

    import re

    lines = [ln.strip() for ln in transcript.splitlines() if ln.strip()]
    ts_pattern = re.compile(r"^\[?(\d{1,2}):(\d{2})(?::(\d{2}))?\]?\s*(.*)$")
    for line in lines:
        m = ts_pattern.match(line)
        if not m:
            continue
        hh_or_mm, mm_or_ss, ss_opt, rest = m.groups()
        if ss_opt is None:
            minutes = int(hh_or_mm)
            seconds = int(mm_or_ss)
            start = minutes * 60 + seconds
        else:
            hours = int(hh_or_mm)
            minutes = int(mm_or_ss)
            seconds = int(ss_opt)
            start = hours * 3600 + minutes * 60 + seconds
        segments.append(
            {
                "start": float(start),
                "end": float(start + 5),
                "text": rest.strip(),
                "speaker": None,
            }
        )

    if not segments:
        return [{"start": 0.0, "end": float(duration or 0.0), "text": transcript, "speaker": None}]

    # Fill end times from next segment start.
    for i in range(len(segments) - 1):
        segments[i]["end"] = max(segments[i]["start"], segments[i + 1]["start"])
    if duration and duration > segments[-1]["start"]:
        segments[-1]["end"] = duration
    else:
        segments[-1]["end"] = segments[-1]["start"] + 5
    return segments


def _transcript_window_for_timestamp(
    segments: List[dict],
    timestamp: float,
    window: int = 5,
) -> List[dict]:
    if not segments:
        return []
    ts = float(timestamp or 0.0)
    nearest_idx = min(range(len(segments)), key=lambda i: abs(float(segments[i].get("start", 0.0)) - ts))
    start = max(0, nearest_idx - window)
    end = min(len(segments), nearest_idx + window + 1)
    return segments[start:end]


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


def _resolve_capture_storage_path(project_id: str, candidate_path: Optional[str]) -> Optional[str]:
    """Resolve possibly stale capture paths to an existing file on disk."""
    if not candidate_path:
        return None
    try:
        candidate = str(candidate_path)
        if os.path.exists(candidate):
            return os.path.abspath(candidate)

        base_name = os.path.basename(candidate)
        if not base_name:
            return None

        project_frames_dir = os.path.join(BRD_FRAMES_DIR, str(project_id))
        
        # Check Direct match in project dir
        direct = os.path.join(project_frames_dir, base_name)
        if os.path.exists(direct):
            return os.path.abspath(direct)

        # Legacy fallback in root frames dir
        legacy_root = os.path.join(BRD_FRAMES_DIR, base_name)
        if os.path.exists(legacy_root):
            return os.path.abspath(legacy_root)

        # Aggressive recursive search in project dir
        if os.path.isdir(project_frames_dir):
            for root, dirs, files in os.walk(project_frames_dir):
                if base_name in files:
                    return os.path.abspath(os.path.join(root, base_name))
                # Even more aggressive: find by capture UUID in filename
                for f in files:
                    if base_name in f or (len(base_name) > 8 and base_name[:36] in f):
                        return os.path.abspath(os.path.join(root, f))
    except Exception:
        return None
    return None


def _capture_to_dict(c: BrdCapture) -> dict:
    resolved_preview = _resolve_capture_storage_path(c.project_id, c.preview_image_path)
    resolved_image = _resolve_capture_storage_path(c.project_id, c.image_path)
    display_path = resolved_preview or resolved_image
    return {
        "id": c.id,
        "project_id": c.project_id,
        "video_id": c.video_id,
        "image_path": resolved_image or c.image_path,
        "preview_image_path": resolved_preview or c.preview_image_path,
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
