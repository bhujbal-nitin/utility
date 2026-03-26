"""
BRD Studio — Database Models
─────────────────────────────
PostgreSQL tables for projects, videos, captures, sections, and version history.
Uses the same Base/engine as the rest of the platform.
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, Text, ForeignKey, JSON,
    Index, text
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class BrdProject(Base):
    __tablename__ = "brd_projects"

    id = Column(String(36), primary_key=True, default=_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    client_name = Column(String(255), default="")
    process_name = Column(String(255), default="")
    ba_name = Column(String(255), default="")
    status = Column(String(50), default="draft")  # draft | in_review | exported
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    videos = relationship("BrdVideo", back_populates="project", cascade="all, delete-orphan", lazy="selectin")
    captures = relationship("BrdCapture", back_populates="project", cascade="all, delete-orphan", lazy="selectin")
    sections = relationship("BrdSection", back_populates="project", cascade="all, delete-orphan", lazy="selectin")
    documents = relationship("BrdDocument", back_populates="project", cascade="all, delete-orphan", lazy="selectin")


class BrdVideo(Base):
    __tablename__ = "brd_videos"

    id = Column(String(36), primary_key=True, default=_uuid)
    project_id = Column(String(36), ForeignKey("brd_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    path = Column(Text, nullable=False)
    duration = Column(Float, default=0.0)
    order = Column(Integer, default=1)
    transcript_text = Column(Text, default="")
    transcript_segments = Column(JSON, default=list)  # [{start, end, text, speaker}]
    capture_mode = Column(String(50), default="intelligent")  # intelligent | interval
    status = Column(String(50), default="processing")  # processing | ready | error
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    project = relationship("BrdProject", back_populates="videos")
    captures = relationship("BrdCapture", back_populates="video", cascade="all, delete-orphan", lazy="selectin")


class BrdCapture(Base):
    __tablename__ = "brd_captures"

    id = Column(String(36), primary_key=True, default=_uuid)
    project_id = Column(String(36), ForeignKey("brd_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    video_id = Column(String(36), ForeignKey("brd_videos.id", ondelete="SET NULL"), nullable=True)
    image_path = Column(Text, nullable=False)
    timestamp = Column(Float, default=0.0)
    order = Column(Integer, default=0)
    label = Column(String(255), default="Screen Capture")
    is_kept = Column(Boolean, default=True)
    is_custom = Column(Boolean, default=False)  # user-uploaded vs auto-captured

    # LLM-generated description fields (editable)
    ocr_text = Column(Text, default="")
    description = Column(Text, default="")
    details_json = Column(JSON, default=dict)  # {app_name, page_title, action, ui_elements, ...}

    # Image edits (annotations, crop)
    edits_json = Column(JSON, default=dict)  # {annotations: [], cropRegion: {}}
    preview_image_path = Column(Text, nullable=True)  # composed preview with edits baked in

    llm_status = Column(String(50), default="pending")  # pending | processing | done | error
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    project = relationship("BrdProject", back_populates="captures")
    video = relationship("BrdVideo", back_populates="captures")

    __table_args__ = (
        Index("ix_brd_captures_project_order", "project_id", "order"),
    )


class BrdSection(Base):
    __tablename__ = "brd_sections"

    id = Column(String(36), primary_key=True, default=_uuid)
    project_id = Column(String(36), ForeignKey("brd_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    section_key = Column(String(100), nullable=False)  # e.g. "process_summary", "flow_existing"
    title = Column(String(500), nullable=False)
    content = Column(Text, default="")
    order = Column(Integer, default=1)
    is_manual_override = Column(Boolean, default=False)  # prevents auto-regen from overwriting
    version = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    project = relationship("BrdProject", back_populates="sections")
    versions = relationship("BrdVersion", back_populates="section", cascade="all, delete-orphan", lazy="selectin")

    __table_args__ = (
        Index("ix_brd_sections_project_key", "project_id", "section_key", unique=True),
    )


class BrdVersion(Base):
    """Automatic snapshot created on every save — fixes BRDCopilot bug."""
    __tablename__ = "brd_versions"

    id = Column(String(36), primary_key=True, default=_uuid)
    section_id = Column(String(36), ForeignKey("brd_sections.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    content_snapshot = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    section = relationship("BrdSection", back_populates="versions")


class BrdDocument(Base):
    """Additional reference documents uploaded by user (SOPs, specs, etc.)."""
    __tablename__ = "brd_documents"

    id = Column(String(36), primary_key=True, default=_uuid)
    project_id = Column(String(36), ForeignKey("brd_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    path = Column(Text, nullable=False)
    extracted_text = Column(Text, default="")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    project = relationship("BrdProject", back_populates="documents")
