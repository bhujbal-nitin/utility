# Edge Assistant — Database Schema Reference

**Database:** PostgreSQL 15  
**ORM:** SQLAlchemy (async, via `asyncpg`)  
**Connection URL pattern:**
```
postgresql+asyncpg://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_SERVER}:{POSTGRES_PORT}/{POSTGRES_DB}
```
**Last Updated:** March 2026

---

## Table of Contents

1. [Quick Setup](#1-quick-setup)
2. [Entity Relationship Diagram](#2-entity-relationship-diagram)
3. [Table: `users`](#3-table-users)
4. [Table: `brd_projects`](#4-table-brd_projects)
5. [Table: `brd_videos`](#5-table-brd_videos)
6. [Table: `brd_captures`](#6-table-brd_captures)
7. [Table: `brd_sections`](#7-table-brd_sections)
8. [Table: `brd_versions`](#8-table-brd_versions)
9. [Table: `brd_documents`](#9-table-brd_documents)
10. [Table: `migration_cache`](#10-table-migration_cache)
11. [Enums](#11-enums)
12. [Indexes](#12-indexes)
13. [Raw SQL — Create All Tables](#13-raw-sql--create-all-tables)
14. [ORM Auto-Creation (Recommended)](#14-orm-auto-creation-recommended)

---

## 1. Quick Setup

### Option A: ORM Auto-Create (Recommended)

The fastest way to create all tables is via the SQLAlchemy ORM. Run this inside any
backend container (e.g., `auth_service`):

```bash
docker exec -it auth_service python -c "
import asyncio
from core.db import engine, Base
from auth_service.models import *
from brd_service.models import *
from migration_service.models import *

async def create_all():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print('All tables created successfully')

asyncio.run(create_all())
"
```

### Option B: Raw SQL

See [Section 13](#13-raw-sql--create-all-tables) for the full SQL script.

---

## 2. Entity Relationship Diagram

```
┌──────────────────┐
│      users       │
│──────────────────│
│ PK id            │
│    email         │
│    hashed_pwd    │
│    roles (json)  │
│    is_approved   │
│    is_active     │
│    created_at    │
└────────┬─────────┘
         │ 1
         │
         │ N
┌────────┴─────────┐
│   brd_projects   │
│──────────────────│
│ PK id            │
│ FK user_id       │───────────────────────────────────────────────┐
│    name          │                                               │
│    client_name   │                                               │
│    process_name  │                                               │
│    ba_name       │                                               │
│    status        │                                               │
│    created_at    │                                               │
│    updated_at    │                                               │
└──┬────┬────┬───┬─┘                                               │
   │    │    │   │                                                  │
   │    │    │   │ 1:N                                              │
   │    │    │   └──────────────────────────────┐                   │
   │    │    │ 1:N                              │                   │
   │    │    └──────────────────┐               │                   │
   │    │ 1:N                  │               │                   │
   │    │                      │               │                   │
   ▼    ▼                      ▼               ▼                   │
┌──────────┐  ┌──────────────┐ ┌────────────┐ ┌──────────────┐    │
│brd_videos│  │ brd_captures │ │brd_sections│ │brd_documents │    │
│──────────│  │──────────────│ │────────────│ │──────────────│    │
│PK id     │  │PK id         │ │PK id       │ │PK id         │    │
│FK proj_id│  │FK proj_id    │ │FK proj_id  │ │FK proj_id    │    │
│  filename│  │FK video_id ──┤ │  sec_key   │ │  filename    │    │
│  path    │  │  image_path  │ │  title     │ │  path        │    │
│  duration│  │  timestamp   │ │  content   │ │  extract_txt │    │
│  order   │  │  order       │ │  order     │ │  created_at  │    │
│  transc. │  │  label       │ │  manual_ov │ └──────────────┘    │
│  segments│  │  is_kept     │ │  version   │                      │
│  cap_mode│  │  is_custom   │ │  created_at│                      │
│  status  │  │  ocr_text    │ │  updated_at│                      │
│  created │  │  description │ └─────┬──────┘                      │
└──────┬───┘  │  details_json│       │ 1:N                         │
       │      │  edits_json  │       │                              │
       │ 1:N  │  preview_path│  ┌────┴───────┐                     │
       └─────►│  llm_status  │  │brd_versions│                     │
              │  created_at  │  │────────────│                     │
              └──────────────┘  │PK id       │                     │
                                │FK sec_id   │                     │
                                │  version_no│                     │
                                │  content   │                     │
                                │  created_at│                     │
                                └────────────┘                     │
                                                                   │
┌───────────────────┐                                              │
│  migration_cache  │  (standalone — no FK to other tables)        │
│───────────────────│                                              │
│ PK id (serial)    │                                              │
│    file_hash      │                                              │
│    file_name      │                                              │
│    tool           │                                              │
│    output         │                                              │
│    created_at     │                                              │
└───────────────────┘                                              │
```

**Relationships:**
- `users` 1 → N `brd_projects` (via `user_id`)
- `brd_projects` 1 → N `brd_videos` (via `project_id`, cascade delete)
- `brd_projects` 1 → N `brd_captures` (via `project_id`, cascade delete)
- `brd_projects` 1 → N `brd_sections` (via `project_id`, cascade delete)
- `brd_projects` 1 → N `brd_documents` (via `project_id`, cascade delete)
- `brd_videos` 1 → N `brd_captures` (via `video_id`, SET NULL on delete)
- `brd_sections` 1 → N `brd_versions` (via `section_id`, cascade delete)
- `migration_cache` — standalone, no foreign keys

---

## 3. Table: `users`

**Service:** `auth_service`  
**Model class:** `User`

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `VARCHAR(36)` | **PK** | UUID v4 | Unique user identifier |
| `email` | `VARCHAR(255)` | **UNIQUE**, NOT NULL, **INDEX** | — | Login email |
| `hashed_password` | `VARCHAR(255)` | NOT NULL | — | bcrypt hash |
| `roles` | `JSON` | NOT NULL | `['ba']` | List of user roles (see [Enums](#11-enums)) |
| `is_approved` | `BOOLEAN` | — | `true` | Approval status for login access |
| `is_active` | `BOOLEAN` | — | `true` | Soft-delete flag |
| `created_at` | `TIMESTAMPTZ` | — | `now()` | Account creation timestamp |

---

## 4. Table: `brd_projects`

**Service:** `brd_service`  
**Model class:** `BrdProject`

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `VARCHAR(36)` | **PK** | UUID v4 | Project identifier |
| `user_id` | `VARCHAR(36)` | **FK → users.id**, NOT NULL, **INDEX** | — | Owner |
| `name` | `VARCHAR(255)` | NOT NULL | — | Project display name |
| `client_name` | `VARCHAR(255)` | — | `''` | Client organization name |
| `process_name` | `VARCHAR(255)` | — | `''` | Business process being documented |
| `ba_name` | `VARCHAR(255)` | — | `''` | Business analyst name |
| `status` | `VARCHAR(50)` | — | `'draft'` | `draft` \| `generating` \| `in_review` \| `exported` |
| `created_at` | `TIMESTAMPTZ` | — | `now()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | — | `now()` | Auto-updated on every change |

---

## 5. Table: `brd_videos`

**Service:** `brd_service`  
**Model class:** `BrdVideo`

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `VARCHAR(36)` | **PK** | UUID v4 | Video identifier |
| `project_id` | `VARCHAR(36)` | **FK → brd_projects.id** (CASCADE), NOT NULL, **INDEX** | — | Parent project |
| `filename` | `VARCHAR(255)` | NOT NULL | — | Original upload filename |
| `path` | `TEXT` | NOT NULL | — | Storage path on disk/volume |
| `duration` | `FLOAT` | — | `0.0` | Video duration in seconds |
| `order` | `INTEGER` | — | `1` | Sort order within project |
| `transcript_text` | `TEXT` | — | `''` | Full transcript (plain text) |
| `transcript_segments` | `JSON` | — | `[]` | Timestamped segments: `[{start, end, text, speaker}]` |
| `capture_mode` | `VARCHAR(50)` | — | `'intelligent'` | `intelligent` \| `interval` |
| `status` | `VARCHAR(50)` | — | `'processing'` | `processing` \| `ready` \| `error` |
| `created_at` | `TIMESTAMPTZ` | — | `now()` | Upload timestamp |

---

## 6. Table: `brd_captures`

**Service:** `brd_service`  
**Model class:** `BrdCapture`

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `VARCHAR(36)` | **PK** | UUID v4 | Capture identifier |
| `project_id` | `VARCHAR(36)` | **FK → brd_projects.id** (CASCADE), NOT NULL, **INDEX** | — | Parent project |
| `video_id` | `VARCHAR(36)` | **FK → brd_videos.id** (SET NULL), nullable | — | Source video (null for manual uploads) |
| `image_path` | `TEXT` | NOT NULL | — | Path to captured frame image |
| `timestamp` | `FLOAT` | — | `0.0` | Timestamp in source video (seconds) |
| `order` | `INTEGER` | — | `0` | Display/sort order |
| `label` | `VARCHAR(255)` | — | `'Screen Capture'` | User-editable label |
| `is_kept` | `BOOLEAN` | — | `true` | Whether capture is included in BRD |
| `is_custom` | `BOOLEAN` | — | `false` | `true` = user-uploaded, `false` = auto-extracted |
| `ocr_text` | `TEXT` | — | `''` | OCR-extracted text from the image |
| `description` | `TEXT` | — | `''` | AI-generated description of the screen |
| `details_json` | `JSON` | — | `{}` | Structured metadata: `{app_name, page_title, action, ui_elements, ...}` |
| `edits_json` | `JSON` | — | `{}` | Annotation/crop edits: `{annotations: [], cropRegion: {}}` |
| `preview_image_path` | `TEXT` | nullable | `null` | Path to edited preview image with annotations baked in |
| `llm_status` | `VARCHAR(50)` | — | `'pending'` | `pending` \| `processing` \| `done` \| `error` |
| `created_at` | `TIMESTAMPTZ` | — | `now()` | Capture creation timestamp |

**Composite index:** `ix_brd_captures_project_order` on (`project_id`, `order`)

---

## 7. Table: `brd_sections`

**Service:** `brd_service`  
**Model class:** `BrdSection`

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `VARCHAR(36)` | **PK** | UUID v4 | Section identifier |
| `project_id` | `VARCHAR(36)` | **FK → brd_projects.id** (CASCADE), NOT NULL, **INDEX** | — | Parent project |
| `section_key` | `VARCHAR(100)` | NOT NULL | — | Machine identifier (see key list below) |
| `title` | `VARCHAR(500)` | NOT NULL | — | Human-readable section title |
| `content` | `TEXT` | — | `''` | Markdown content (may contain `[IMAGE_REF:...]` markers) |
| `order` | `INTEGER` | — | `1` | Display order in the BRD document |
| `is_manual_override` | `BOOLEAN` | — | `false` | If `true`, auto-regeneration skips this section |
| `version` | `INTEGER` | — | `1` | Current version number |
| `created_at` | `TIMESTAMPTZ` | — | `now()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | — | `now()` | Auto-updated on every edit |

**Unique composite index:** `ix_brd_sections_project_key` on (`project_id`, `section_key`)

### Section Key Reference

| Order | `section_key` | Title | BRD Template Section |
|:-----:|---------------|-------|----------------------|
| 1 | `process_summary` | Process Summary | §1 |
| 2 | `applications_involved` | Details of Applications Involved | §4 |
| 3 | `feasibility_observations` | Automation Feasibility Observations | §5 |
| 4 | `io_details` | Input, Output Formats and Details | §6 |
| 5 | `flow_existing` | Existing Process Flow Diagram (As-Is) | §7 |
| 6 | `flow_proposed` | Proposed Automation Process Flow (To-Be) | §8 |
| 7 | `process_detail` | Business Process Detailed Description | §9 |
| 8 | `validations` | Validations | §10 |
| 9 | `exceptions` | Exceptions | §11 |
| 10 | `rules` | Business Rules | §12 |
| 11 | `func_req` | Functional Requirements | §13 |
| 12 | `nonfunc_req` | Non-Functional Requirements | §14 |
| 13 | `recommendations` | Process Re-engineering Recommendations | §15 |

---

## 8. Table: `brd_versions`

**Service:** `brd_service`  
**Model class:** `BrdVersion`

Automatic snapshot created on every section save for undo/history.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `VARCHAR(36)` | **PK** | UUID v4 | Version identifier |
| `section_id` | `VARCHAR(36)` | **FK → brd_sections.id** (CASCADE), NOT NULL, **INDEX** | — | Parent section |
| `version_number` | `INTEGER` | NOT NULL | — | Monotonically increasing version number |
| `content_snapshot` | `TEXT` | NOT NULL | — | Full section content at this version |
| `created_at` | `TIMESTAMPTZ` | — | `now()` | Snapshot timestamp |

---

## 9. Table: `brd_documents`

**Service:** `brd_service`  
**Model class:** `BrdDocument`

Reference documents uploaded by users (SOPs, specs, PDFs) to provide additional context for BRD generation.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `VARCHAR(36)` | **PK** | UUID v4 | Document identifier |
| `project_id` | `VARCHAR(36)` | **FK → brd_projects.id** (CASCADE), NOT NULL, **INDEX** | — | Parent project |
| `filename` | `VARCHAR(255)` | NOT NULL | — | Original filename |
| `path` | `TEXT` | NOT NULL | — | Storage path on disk/volume |
| `extracted_text` | `TEXT` | — | `''` | Text extracted from the document (PDF, DOCX) |
| `created_at` | `TIMESTAMPTZ` | — | `now()` | Upload timestamp |

---

## 10. Table: `migration_cache`

**Service:** `migration_service`  
**Model class:** `MigrationCache`

Caches AI analysis results for migration tool uploads to avoid re-processing identical files.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `INTEGER` | **PK**, auto-increment | serial | Row identifier |
| `file_hash` | `VARCHAR(255)` | **UNIQUE**, NOT NULL, **INDEX** | — | SHA-256 hash of uploaded file |
| `file_name` | `VARCHAR(255)` | NOT NULL | — | Original filename |
| `tool` | `VARCHAR(50)` | NOT NULL | — | `'uipath'` \| `'bp'` \| `'aa'` |
| `output` | `TEXT` | NOT NULL | — | Cached AI analysis output (JSON string) |
| `created_at` | `TIMESTAMPTZ` | — | `now()` | Cache entry creation |

---

## 11. Enums (Conceptual)

### User Roles (Stored in `users.roles` JSON Array)

Used by `users.roles` to store one or more of these string values.

| Value | Description |
|-------|-------------|
| `admin` | Full access to all features and admin panel |
| `ba` | Business Analyst — BRD Studio, Automation Studio |
| `sales` | Sales role — Proposal service access |
| `automation` | Automation engineer — Automation Studio |
| `ae` | AutomationEdge specific role |

---

## 12. Indexes

| Table | Index Name | Columns | Unique | Purpose |
|-------|-----------|---------|:------:|---------|
| `users` | (auto) | `email` | Yes | Fast login lookup |
| `brd_projects` | (auto) | `user_id` | No | List projects by user |
| `brd_videos` | (auto) | `project_id` | No | List videos by project |
| `brd_captures` | (auto) | `project_id` | No | List captures by project |
| `brd_captures` | `ix_brd_captures_project_order` | `project_id`, `order` | No | Ordered capture retrieval |
| `brd_sections` | (auto) | `project_id` | No | List sections by project |
| `brd_sections` | `ix_brd_sections_project_key` | `project_id`, `section_key` | **Yes** | Unique section per project |
| `brd_versions` | (auto) | `section_id` | No | Version history lookup |
| `brd_documents` | (auto) | `project_id` | No | List documents by project |
| `migration_cache` | (auto) | `id` | Yes | Primary key |
| `migration_cache` | (auto) | `file_hash` | Yes | Dedup lookups by file hash |

---

## 13. Raw SQL — Create All Tables

Use this SQL to create all tables manually (e.g., via `psql`). Run this **after** creating the database.

```sql
-- ─────────────────────────────────────────────────
-- Edge Assistant — Full Database Schema
-- PostgreSQL 15+
-- ─────────────────────────────────────────────────

-- ENUM type for user roles
DO $$ BEGIN
    CREATE TYPE roleenum AS ENUM ('admin', 'ba', 'sales', 'automation', 'ae');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════
-- 1. users
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS users (
    id              VARCHAR(36)     PRIMARY KEY,
    email           VARCHAR(255)    NOT NULL UNIQUE,
    hashed_password VARCHAR(255)    NOT NULL,
    roles           JSON            NOT NULL DEFAULT '["ba"]',
    is_approved     BOOLEAN         DEFAULT TRUE,
    is_active       BOOLEAN         DEFAULT TRUE,
    created_at      TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_users_email ON users (email);

-- ═══════════════════════════════════════════════════
-- 2. brd_projects
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS brd_projects (
    id              VARCHAR(36)     PRIMARY KEY,
    user_id         VARCHAR(36)     NOT NULL REFERENCES users(id),
    name            VARCHAR(255)    NOT NULL,
    client_name     VARCHAR(255)    DEFAULT '',
    process_name    VARCHAR(255)    DEFAULT '',
    ba_name         VARCHAR(255)    DEFAULT '',
    status          VARCHAR(50)     DEFAULT 'draft',
    created_at      TIMESTAMPTZ     DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_brd_projects_user_id ON brd_projects (user_id);

-- ═══════════════════════════════════════════════════
-- 3. brd_videos
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS brd_videos (
    id                  VARCHAR(36)     PRIMARY KEY,
    project_id          VARCHAR(36)     NOT NULL REFERENCES brd_projects(id) ON DELETE CASCADE,
    filename            VARCHAR(255)    NOT NULL,
    path                TEXT            NOT NULL,
    duration            FLOAT           DEFAULT 0.0,
    "order"             INTEGER         DEFAULT 1,
    transcript_text     TEXT            DEFAULT '',
    transcript_segments JSON            DEFAULT '[]'::json,
    capture_mode        VARCHAR(50)     DEFAULT 'intelligent',
    status              VARCHAR(50)     DEFAULT 'processing',
    created_at          TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_brd_videos_project_id ON brd_videos (project_id);

-- ═══════════════════════════════════════════════════
-- 4. brd_captures
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS brd_captures (
    id                  VARCHAR(36)     PRIMARY KEY,
    project_id          VARCHAR(36)     NOT NULL REFERENCES brd_projects(id) ON DELETE CASCADE,
    video_id            VARCHAR(36)     REFERENCES brd_videos(id) ON DELETE SET NULL,
    image_path          TEXT            NOT NULL,
    "timestamp"         FLOAT           DEFAULT 0.0,
    "order"             INTEGER         DEFAULT 0,
    label               VARCHAR(255)    DEFAULT 'Screen Capture',
    is_kept             BOOLEAN         DEFAULT TRUE,
    is_custom           BOOLEAN         DEFAULT FALSE,
    ocr_text            TEXT            DEFAULT '',
    description         TEXT            DEFAULT '',
    details_json        JSON            DEFAULT '{}'::json,
    edits_json          JSON            DEFAULT '{}'::json,
    preview_image_path  TEXT,
    llm_status          VARCHAR(50)     DEFAULT 'pending',
    created_at          TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_brd_captures_project_id ON brd_captures (project_id);
CREATE INDEX IF NOT EXISTS ix_brd_captures_project_order ON brd_captures (project_id, "order");

-- ═══════════════════════════════════════════════════
-- 5. brd_sections
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS brd_sections (
    id                  VARCHAR(36)     PRIMARY KEY,
    project_id          VARCHAR(36)     NOT NULL REFERENCES brd_projects(id) ON DELETE CASCADE,
    section_key         VARCHAR(100)    NOT NULL,
    title               VARCHAR(500)    NOT NULL,
    content             TEXT            DEFAULT '',
    "order"             INTEGER         DEFAULT 1,
    is_manual_override  BOOLEAN         DEFAULT FALSE,
    version             INTEGER         DEFAULT 1,
    created_at          TIMESTAMPTZ     DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_brd_sections_project_id ON brd_sections (project_id);
CREATE UNIQUE INDEX IF NOT EXISTS ix_brd_sections_project_key ON brd_sections (project_id, section_key);

-- ═══════════════════════════════════════════════════
-- 6. brd_versions
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS brd_versions (
    id                  VARCHAR(36)     PRIMARY KEY,
    section_id          VARCHAR(36)     NOT NULL REFERENCES brd_sections(id) ON DELETE CASCADE,
    version_number      INTEGER         NOT NULL,
    content_snapshot    TEXT            NOT NULL,
    created_at          TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_brd_versions_section_id ON brd_versions (section_id);

-- ═══════════════════════════════════════════════════
-- 7. brd_documents
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS brd_documents (
    id              VARCHAR(36)     PRIMARY KEY,
    project_id      VARCHAR(36)     NOT NULL REFERENCES brd_projects(id) ON DELETE CASCADE,
    filename        VARCHAR(255)    NOT NULL,
    path            TEXT            NOT NULL,
    extracted_text  TEXT            DEFAULT '',
    created_at      TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_brd_documents_project_id ON brd_documents (project_id);

-- ═══════════════════════════════════════════════════
-- 8. migration_cache
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS migration_cache (
    id              SERIAL          PRIMARY KEY,
    file_hash       VARCHAR(255)    NOT NULL UNIQUE,
    file_name       VARCHAR(255)    NOT NULL,
    tool            VARCHAR(50)     NOT NULL,
    output          TEXT            NOT NULL,
    created_at      TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_migration_cache_file_hash ON migration_cache (file_hash);
```

### Run via `psql`

```powershell
# From inside the postgres container
docker exec -i edge_postgres psql -U edgeadmin -d edge_assistant < DB_schema.sql

# Or copy-paste the SQL above into:
docker exec -it edge_postgres psql -U edgeadmin -d edge_assistant
```

---

## 14. ORM Auto-Creation (Recommended)

The ORM approach is preferred because it guarantees the schema matches the Python model
definitions exactly, including auto-generated index names and constraints.

```bash
docker exec -it auth_service python -c "
import asyncio
from core.db import engine, Base

# Import ALL models so they register with Base.metadata
from auth_service.models import User
from brd_service.models import (
    BrdProject, BrdVideo, BrdCapture,
    BrdSection, BrdVersion, BrdDocument
)
from migration_service.models import MigrationCache

async def create_all():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print('All 8 tables created successfully')
    
    # Verify
    async with engine.begin() as conn:
        result = await conn.run_sync(
            lambda sync_conn: sync_conn.execute(
                __import__('sqlalchemy').text(
                    \"\"\"SELECT tablename FROM pg_tables
                       WHERE schemaname = 'public'
                       ORDER BY tablename\"\"\"
                )
            ).fetchall()
        )
        for row in result:
            print(f'  ✓ {row[0]}')

asyncio.run(create_all())
"
```

Expected output:

```
All 8 tables created successfully
  ✓ brd_captures
  ✓ brd_documents
  ✓ brd_projects
  ✓ brd_sections
  ✓ brd_versions
  ✓ brd_videos
  ✓ migration_cache
  ✓ users
```

### Seed Admin User

After creating tables, seed the first admin user:

```bash
docker exec -it auth_service python -c "
import asyncio
from core.db import AsyncSessionLocal
from auth_service.models import User
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')

async def seed_admin():
    async with AsyncSessionLocal() as session:
        user = User(
            email='admin@automationedge.com',
            hashed_password=pwd_context.hash('ChangeMe123!'),
            roles=['admin'],
            is_approved=True,
            is_active=True,
        )
        session.add(user)
        await session.commit()
        print(f'Admin created: {user.email} (id={user.id})')

asyncio.run(seed_admin())
"
```

> **Change the password** immediately after first login.

---

## Notes

- All `id` columns use UUID v4 strings (`VARCHAR(36)`) generated in Python, not database-side UUIDs.
- `TIMESTAMPTZ` stores timestamps with timezone. The ORM default is `datetime.now(timezone.utc)`.
- `JSON` columns use PostgreSQL's native JSON type (not JSONB). If query performance on JSON fields becomes an issue, consider migrating to `JSONB` with GIN indexes.
- The `order` column is a reserved word in SQL — it is quoted in raw SQL (`"order"`) but handled transparently by SQLAlchemy.
- Cascade deletes flow from `brd_projects` downward: deleting a project removes all its videos, captures, sections, versions, and documents automatically.
- `brd_captures.video_id` uses `ON DELETE SET NULL` — if a video is deleted, captures from that video remain but lose their video reference.
