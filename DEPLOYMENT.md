# Edge Assistant — Production Deployment Guide

**Target VM:** `mspeventwin2.westus.cloudapp.azure.com` (Windows)  
**Architecture:** Docker Compose (8 containers) with Nginx API Gateway  
**Last Updated:** March 2026

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [VM Preparation (Windows)](#3-vm-preparation-windows)
4. [Project Setup](#4-project-setup)
5. [Environment Configuration](#5-environment-configuration)
6. [Docker Configuration Changes](#6-docker-configuration-changes)
7. [Nginx Configuration (Frontend API Gateway)](#7-nginx-configuration-frontend-api-gateway)
8. [Frontend Build Configuration](#8-frontend-build-configuration)
9. [CORS & Backend Configuration](#9-cors--backend-configuration)
10. [Build & Deploy](#10-build--deploy)
11. [Host-Level Nginx for TLS (Optional)](#11-host-level-nginx-for-tls-optional)
12. [Windows Firewall & Azure NSG](#12-windows-firewall--azure-nsg)
13. [Post-Deployment Verification](#13-post-deployment-verification)
14. [Security Hardening](#14-security-hardening)
15. [Monitoring & Logging](#15-monitoring--logging)
16. [Maintenance & Operations](#16-maintenance--operations)
17. [Troubleshooting](#17-troubleshooting)

---

## 1. Architecture Overview

The frontend Nginx container acts as the **unified API gateway**. It serves the React SPA
and reverse-proxies all `/api/*` requests to the correct backend container via the Docker
Compose internal network. Backend ports are **never exposed to the host**, reducing the
attack surface to a single port (3000 or 80/443 via optional host Nginx).

```
Internet
   │
   ▼  Port 80 / 443 (optional host Nginx for TLS)
┌──────────────────────────────────────────────────────────┐
│              Host-Level Nginx (optional)                  │
│              TLS termination only                         │
└───────────────────────┬──────────────────────────────────┘
                        │  proxy_pass → :3000
                        ▼
┌──────────────────────────────────────────────────────────┐
│          Frontend Nginx Container (:3000 → :80)          │
│  ┌──────────────┬────────────────────────────────────┐   │
│  │  /           │  React SPA (static files)          │   │
│  │  /api/auth/* │  → auth-service:8000               │   │
│  │  /api/brd/*  │  → brd-service:8001                │   │
│  │  /api/prop*  │  → proposal-service:8002           │   │
│  │  /api/*      │  → automation-service:8003          │   │
│  │  /api/migr*  │  → migration-service:8004          │   │
│  │  /download/* │  → automation-service:8003          │   │
│  └──────────────┴────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
            │ Docker Compose internal network
  ┌─────────┼─────────┬─────────┬─────────┬─────────┐
  ▼         ▼         ▼         ▼         ▼         ▼
:8000     :8001     :8002     :8003     :8004    (internal)
 Auth      BRD     Proposal  Automat   Migrat   ┌────────┐
(FastAPI) (FastAPI) (FastAPI) (FastAPI) (FastAPI) │Postgres│
                                                 │ Redis  │
                                                 └────────┘
```

| Container            | Internal Port | Exposed to Host | Role                                   |
|----------------------|:------------:|:---------------:|----------------------------------------|
| `edge_frontend`      | 80 → 3000   | **Yes** (3000)  | React SPA + API Gateway (Nginx)        |
| `auth_service`       | 8000         | No              | Authentication & User Management       |
| `brd_service`        | 8001         | No              | BRD Studio (video + AI generation)     |
| `proposal_service`   | 8002         | No              | Proposal Generation                    |
| `automation_service` | 8003         | No              | Automation & Artifact Downloads         |
| `migration_service`  | 8004         | No              | Migration (UiPath / BluePrism / AA)    |
| `edge_postgres`      | 5432         | No              | PostgreSQL 15                          |
| `edge_redis`         | 6379         | No              | Redis 7 (rate limiting & caching)      |

**Key benefit:** Only port 3000 (or 80/443 with host Nginx) is exposed. All inter-service
communication uses Docker's internal DNS. The frontend uses relative URLs (`/api/...`)
making the deployment hostname-agnostic.

---

## 2. Prerequisites

### On Your Local Machine
- Git access to the `edge-assistant` repository
- GCP Service Account JSON key file (`vertex-key.json`) with Vertex AI permissions

### On the Target VM

| Software            | Version   | Purpose                                    | Required |
|---------------------|-----------|--------------------------------------------|---------:|
| Docker Desktop      | Latest    | Container runtime (WSL 2 backend)          | **Yes**  |
| Docker Compose      | v2+       | Multi-container orchestration              | **Yes**  |
| Git                 | Latest    | Clone repository                           | **Yes**  |
| Nginx (host)        | Latest    | TLS termination (optional, see §11)        | No       |
| OpenSSL / Win-ACME  | —         | TLS certificate generation (if using TLS)  | No       |

> **Note:** FFmpeg is included **inside** the Docker image (see §6.1). You do NOT need
> it on the host unless you plan to run the backend outside Docker.

---

## 3. VM Preparation (Windows)

### 3.1 Connect to the VM

```powershell
# RDP into the Azure VM
mstsc /v:mspeventwin2.westus.cloudapp.azure.com
```

Or use Azure Bastion / SSH if configured.

### 3.2 Install Docker Desktop

1. Download Docker Desktop for Windows from https://docs.docker.com/desktop/install/windows-install/
2. Run the installer — ensure **WSL 2 backend** is selected (not Hyper-V)
3. Restart the VM when prompted
4. After reboot, open Docker Desktop → Settings → General → ensure "Use the WSL 2 based engine" is checked
5. Docker Desktop → Settings → Resources → adjust:
   - **CPUs:** at least 4
   - **Memory:** at least 8 GB (16 GB recommended for concurrent AI generation)
   - **Disk image size:** at least 50 GB
6. Verify:

```powershell
docker --version
docker compose version
```

### 3.3 Install Git

```powershell
winget install Git.Git
# Restart terminal after install
git --version
```

### 3.4 Create Deployment Directory

```powershell
mkdir C:\deploy
cd C:\deploy
```

---

## 4. Project Setup

### 4.1 Clone the Repository

```powershell
cd C:\deploy
git clone <your-repo-url> edge-assistant
cd edge-assistant
```

Or copy the project files from your local machine via SCP/RDP file transfer.

### 4.2 Place the Vertex AI Key

```powershell
# Copy your GCP service account key to the backend directory
copy <path-to-your-key>\vertex-key.json C:\deploy\edge-assistant\backend\vertex-key.json
```

> **CRITICAL:** This file must exist at `backend/vertex-key.json` before building containers.
> Never commit this file to Git.

### 4.3 Create Data Directories

```powershell
cd C:\deploy\edge-assistant
mkdir ae_studio_data
mkdir brd_studio_data
mkdir brd_studio_data\frames
mkdir brd_studio_data\videos
mkdir brd_studio_data\exports
mkdir brd_studio_data\documents
```

---

## 5. Environment Configuration

### 5.1 Create the `.env` File

```powershell
cd C:\deploy\edge-assistant
copy .env.docker.example .env
```

### 5.2 Edit `.env` with Production Values

Open `.env` in a text editor and set:

```ini
# ── Global Security ──────────────────────────────────────────
PROJECT_NAME="Edge Assistant"
VERSION="1.0.0"

# IMPORTANT: Generate a strong random key (64+ chars)
SECRET_KEY="<GENERATE_A_STRONG_RANDOM_KEY_HERE>"
ALGORITHM="HS256"
ACCESS_TOKEN_EXPIRE_MINUTES=10080

# ── Database ─────────────────────────────────────────────────
POSTGRES_USER=edgeadmin
POSTGRES_PASSWORD=<STRONG_DB_PASSWORD_HERE>
POSTGRES_DB=edge_assistant
POSTGRES_PORT=5432

# ── Redis ────────────────────────────────────────────────────
REDIS_HOST=redis
REDIS_PORT=6379

# ── Vertex AI ────────────────────────────────────────────────
VERTEX_PROJECT_ID="<your-gcp-project-id>"
VERTEX_LOCATION="us-central1"
VERTEX_MODEL="gemini-2.0-flash"
VERTEX_KEY_PATH="/app/vertex-key.json"

# ── Data Directories ─────────────────────────────────────────
AE_STUDIO_DATA_DIR="/app/ae_studio_data"
```

### 5.3 Generate a Secure SECRET_KEY

```powershell
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

Copy the output into the `SECRET_KEY` field in `.env`.

> **Conditions:**
> - `POSTGRES_PASSWORD` must be at least 16 characters, alphanumeric + special chars.
> - `SECRET_KEY` must be unique per deployment — never reuse from dev.
> - `VERTEX_PROJECT_ID` must match the GCP project that owns the service account.
> - `VERTEX_LOCATION` must be a region where Gemini models are available.

---

## 6. Docker Configuration Changes

### 6.1 Update Backend Dockerfile — Add FFmpeg

The BRD service needs FFmpeg for video frame extraction. Edit `backend/Dockerfile`:

```dockerfile
# Production Grade Slim Python Build
FROM python:3.11-slim as builder

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Final stage
FROM python:3.11-slim

WORKDIR /app

COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONPATH=/app

# Install runtime dependencies INCLUDING FFmpeg for BRD video processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY . .

RUN mkdir -p /app/ae_studio_data /app/brd_studio_data

RUN adduser --disabled-password --gecos '' appuser && chown -R appuser:appuser /app
USER appuser

CMD ["uvicorn", "auth_service.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 6.2 Update `docker-compose.yml`

Replace the contents of `docker-compose.yml` with the following. **Important changes:**
- Backend service ports are NOT exposed to the host (only internal Docker network)
- Frontend container depends on ALL backend services
- Health checks on database and cache
- Named volumes for data persistence
- Workers and timeouts tuned for production

```yaml
version: '3.8'

services:
  db:
    image: postgres:15-alpine
    container_name: edge_postgres
    restart: always
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
      POSTGRES_DB: ${POSTGRES_DB:-edge_assistant}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - edge_network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-postgres}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: edge_redis
    restart: always
    networks:
      - edge_network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  auth-service:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: auth_service
    restart: always
    command: uvicorn auth_service.main:app --host 0.0.0.0 --port 8000 --workers 2
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      - POSTGRES_SERVER=db
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=${POSTGRES_DB}
      - POSTGRES_PORT=5432
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - SECRET_KEY=${SECRET_KEY}
      - ALGORITHM=${ALGORITHM}
      - ACCESS_TOKEN_EXPIRE_MINUTES=${ACCESS_TOKEN_EXPIRE_MINUTES:-10080}
      - PROJECT_NAME=${PROJECT_NAME}
      - VERSION=${VERSION}
    # NO ports: section — only accessible via Docker network
    networks:
      - edge_network

  brd-service:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: brd_service
    restart: always
    command: uvicorn brd_service.main:app --host 0.0.0.0 --port 8001 --workers 2 --timeout-keep-alive 120
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      - POSTGRES_SERVER=db
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=${POSTGRES_DB}
      - POSTGRES_PORT=5432
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - SECRET_KEY=${SECRET_KEY}
      - ALGORITHM=${ALGORITHM}
      - ACCESS_TOKEN_EXPIRE_MINUTES=${ACCESS_TOKEN_EXPIRE_MINUTES:-10080}
      - PROJECT_NAME=${PROJECT_NAME}
      - VERSION=${VERSION}
      - VERTEX_PROJECT_ID=${VERTEX_PROJECT_ID}
      - VERTEX_LOCATION=${VERTEX_LOCATION}
      - VERTEX_MODEL=${VERTEX_MODEL}
      - VERTEX_KEY_PATH=/app/vertex-key.json
    volumes:
      - ./backend/vertex-key.json:/app/vertex-key.json:ro
      - brd_studio_data:/app/brd_studio_data
    networks:
      - edge_network

  proposal-service:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: proposal_service
    restart: always
    command: uvicorn proposal_service.main:app --host 0.0.0.0 --port 8002 --workers 2
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      - POSTGRES_SERVER=db
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=${POSTGRES_DB}
      - POSTGRES_PORT=5432
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - SECRET_KEY=${SECRET_KEY}
      - ALGORITHM=${ALGORITHM}
      - ACCESS_TOKEN_EXPIRE_MINUTES=${ACCESS_TOKEN_EXPIRE_MINUTES:-10080}
      - PROJECT_NAME=${PROJECT_NAME}
      - VERSION=${VERSION}
      - VERTEX_PROJECT_ID=${VERTEX_PROJECT_ID}
      - VERTEX_LOCATION=${VERTEX_LOCATION}
      - VERTEX_MODEL=${VERTEX_MODEL}
      - VERTEX_KEY_PATH=/app/vertex-key.json
    volumes:
      - ./backend/vertex-key.json:/app/vertex-key.json:ro
    networks:
      - edge_network

  automation-service:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: automation_service
    restart: always
    command: uvicorn automation_service.main:app --host 0.0.0.0 --port 8003 --workers 2
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      - POSTGRES_SERVER=db
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=${POSTGRES_DB}
      - POSTGRES_PORT=5432
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - SECRET_KEY=${SECRET_KEY}
      - ALGORITHM=${ALGORITHM}
      - ACCESS_TOKEN_EXPIRE_MINUTES=${ACCESS_TOKEN_EXPIRE_MINUTES:-10080}
      - PROJECT_NAME=${PROJECT_NAME}
      - VERSION=${VERSION}
      - VERTEX_PROJECT_ID=${VERTEX_PROJECT_ID}
      - VERTEX_LOCATION=${VERTEX_LOCATION}
      - VERTEX_MODEL=${VERTEX_MODEL}
      - VERTEX_KEY_PATH=/app/vertex-key.json
      - AE_STUDIO_DATA_DIR=/app/ae_studio_data
    volumes:
      - ./backend/vertex-key.json:/app/vertex-key.json:ro
      - ae_studio_data:/app/ae_studio_data
    networks:
      - edge_network

  migration-service:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: migration_service
    restart: always
    command: uvicorn migration_service.main:app --host 0.0.0.0 --port 8004 --workers 2
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      - POSTGRES_SERVER=db
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=${POSTGRES_DB}
      - POSTGRES_PORT=5432
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - SECRET_KEY=${SECRET_KEY}
      - ALGORITHM=${ALGORITHM}
      - ACCESS_TOKEN_EXPIRE_MINUTES=${ACCESS_TOKEN_EXPIRE_MINUTES:-10080}
      - PROJECT_NAME=${PROJECT_NAME}
      - VERSION=${VERSION}
      - VERTEX_PROJECT_ID=${VERTEX_PROJECT_ID}
      - VERTEX_LOCATION=${VERTEX_LOCATION}
      - VERTEX_MODEL=${VERTEX_MODEL}
      - VERTEX_KEY_PATH=/app/vertex-key.json
    volumes:
      - ./backend/vertex-key.json:/app/vertex-key.json:ro
    networks:
      - edge_network

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: edge_frontend
    restart: always
    depends_on:
      - auth-service
      - brd-service
      - automation-service
      - migration-service
      - proposal-service
    ports:
      - "3000:80"
    networks:
      - edge_network

networks:
  edge_network:
    driver: bridge

volumes:
  postgres_data:
  ae_studio_data:
  brd_studio_data:
```

**Key differences from the original `docker-compose.yml`:**

| Change | Why |
|--------|-----|
| Backend services have NO `ports:` section | Only the frontend Nginx needs host access; backends are internal-only |
| `healthcheck` on `db` and `redis` | Services wait for dependencies to be truly ready before starting |
| `depends_on` with `condition: service_healthy` | Prevents startup crashes from database not yet accepting connections |
| `--workers 2` on all Uvicorn commands | Better throughput under concurrent load |
| `--timeout-keep-alive 120` on BRD service | Video processing and AI generation can take minutes |
| `restart: always` on all services | Auto-recover from crashes; auto-start when Docker starts |
| `vertex-key.json` mounted `:ro` | Read-only security — containers cannot modify the key file |
| Named volumes for `brd_studio_data` and `ae_studio_data` | Data persists across container rebuilds |
| Frontend depends on ALL backend services | Nginx needs the upstream containers to be running for proxy |

---

## 7. Nginx Configuration (Frontend API Gateway)

This is the **most critical** configuration file. The frontend's `nginx.conf` makes the
frontend container serve as the unified entry point: static SPA files AND API reverse proxy.

### 7.1 The Configuration File

The file at `frontend/nginx.conf` has been updated to:

```nginx
# ──────────────────────────────────────────────────────────────────────────────
# Edge Assistant — Frontend Nginx Configuration (Production)
# ──────────────────────────────────────────────────────────────────────────────
# This Nginx instance serves the React SPA AND acts as the unified API gateway.
# All /api/* requests are reverse-proxied to the correct backend container via
# the Docker Compose network (service names resolve to container IPs).
#
# Architecture:
#   Browser → :3000 (this Nginx) → static files   (React SPA)
#                                 → auth_service   (:8000)
#                                 → brd_service    (:8001)
#                                 → proposal_service (:8002)
#                                 → automation_service (:8003)
#                                 → migration_service (:8004)
# ──────────────────────────────────────────────────────────────────────────────

# Upstream definitions — use Docker Compose service names
upstream auth_backend       { server auth-service:8000; }
upstream brd_backend        { server brd-service:8001; }
upstream proposal_backend   { server proposal-service:8002; }
upstream automation_backend { server automation-service:8003; }
upstream migration_backend  { server migration-service:8004; }

server {
    listen 80;
    server_name _;

    # ── Global Settings ───────────────────────────────────────────────────
    client_max_body_size 500M;          # Video uploads can be large
    proxy_read_timeout   600s;          # BRD generation can take minutes
    proxy_connect_timeout 30s;
    proxy_send_timeout   120s;

    # Common proxy headers (inherited by all location blocks)
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # ── API Routes (order matters — most specific first) ──────────────────

    # Auth Service — /api/auth/*
    location /api/auth/ {
        proxy_pass http://auth_backend;
    }

    # BRD Service — /api/brd/*
    location /api/brd/ {
        proxy_pass http://brd_backend;
        proxy_read_timeout 600s;        # Extra-long for video processing + AI
        proxy_request_buffering off;    # Stream uploads directly
    }

    # Migration Service — /api/migration/*
    location /api/migration/ {
        proxy_pass http://migration_backend;
        proxy_read_timeout 300s;
    }

    # Proposal Service — /api/proposal/*
    location /api/proposal/ {
        proxy_pass http://proposal_backend;
    }

    # Automation Service — /api/* (catch-all for remaining API paths)
    # MUST come AFTER more-specific /api/ prefixes above
    location /api/ {
        proxy_pass http://automation_backend;
        proxy_read_timeout 300s;
    }

    # Automation Service — /download/* (artifact downloads)
    location /download/ {
        proxy_pass http://automation_backend;
    }

    # ── Health Check (Nginx itself) ───────────────────────────────────────
    location = /nginx-health {
        access_log off;
        return 200 'ok';
        add_header Content-Type text/plain;
    }

    # ── React SPA (catch-all) ─────────────────────────────────────────────
    location / {
        root   /usr/share/nginx/html;
        index  index.html index.htm;
        try_files $uri $uri/ /index.html;
    }

    # ── Static Asset Caching ──────────────────────────────────────────────
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|otf|map)$ {
        root /usr/share/nginx/html;
        expires 1y;
        add_header Cache-Control "public, no-transform";
        access_log off;
    }

    # ── Error Pages ───────────────────────────────────────────────────────
    error_page 500 502 503 504 /50x.html;
    location = /50x.html {
        root /usr/share/nginx/html;
    }

    # ── Compression ───────────────────────────────────────────────────────
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 1000;
    gzip_types
        text/plain
        text/css
        application/json
        application/javascript
        text/xml
        application/xml
        application/xml+rss
        text/javascript
        image/svg+xml;
}
```

### 7.2 How It Works

| Request Path | Proxied To | Timeout | Notes |
|---|---|---|---|
| `/api/auth/*` | `auth-service:8000` | 600s | Login, register, user management |
| `/api/brd/*` | `brd-service:8001` | 600s | Video upload, AI generation, exports |
| `/api/migration/*` | `migration-service:8004` | 300s | UiPath, BluePrism, AA analysis |
| `/api/proposal/*` | `proposal-service:8002` | 600s | Proposal generation |
| `/api/*` (catch-all) | `automation-service:8003` | 300s | Chat, sessions, artifacts |
| `/download/*` | `automation-service:8003` | 600s | File downloads |
| `/*` (catch-all) | Static files | — | React SPA with `try_files` fallback |
| `/nginx-health` | Nginx itself | — | Health check endpoint (returns 200) |

**Order matters:** Nginx matches `location` blocks by prefix length. More-specific
prefixes like `/api/auth/` are matched before the catch-all `/api/`. The `location /api/`
block for automation-service MUST come last among the `/api/*` blocks.

### 7.3 Important Settings Explained

| Setting | Value | Why |
|---------|-------|-----|
| `client_max_body_size` | `500M` | BRD video uploads can be hundreds of MB |
| `proxy_read_timeout` | `600s` | AI generation + video processing can take 5–10 minutes |
| `proxy_connect_timeout` | `30s` | Fail fast if a backend container is unreachable |
| `proxy_send_timeout` | `120s` | Large file upload body transfer can take time |
| `proxy_request_buffering` | `off` (BRD) | Stream video uploads directly to backend without buffering in Nginx memory |
| `gzip_proxied` | `any` | Compress proxied responses too, not just static files |
| `gzip_comp_level` | `6` | Good balance between CPU usage and compression ratio |

### 7.4 Conditions & Requirements

- **Upstream names must match Docker Compose service names exactly.** The names
  `auth-service`, `brd-service`, etc. are resolved by Docker's built-in DNS.
- **If you rename a service in `docker-compose.yml`, you MUST update the corresponding
  `upstream` block in `nginx.conf`.**
- **The frontend container must `depends_on` all backend services** so they exist in the
  Docker network when Nginx starts. Without this, Nginx will fail to resolve upstream hosts
  and exit with an error.
- **If a backend service is temporarily down**, Nginx will return 502 Bad Gateway for that
  route. The `restart: always` policy in `docker-compose.yml` ensures auto-recovery.

---

## 8. Frontend Build Configuration

All frontend API calls now use **relative URLs** (e.g., `/api/auth/login` instead of
`http://localhost:8000/api/auth/login`). This was already applied to the source code.

### 8.1 Files Changed

| File | Old Value | New Value |
|------|-----------|-----------|
| `frontend/src/context/AuthContext.jsx` | `http://localhost:8000/api` | `/api` |
| `frontend/src/context/AuthContext.jsx` | `http://localhost:8000/api/auth/me` | `/api/auth/me` |
| `frontend/src/context/AuthContext.jsx` | `http://localhost:8000/api/auth/login` | `/api/auth/login` |
| `frontend/src/pages/Signup.jsx` | `http://localhost:8000/api/auth/register` | `/api/auth/register` |
| `frontend/src/pages/BRDStudio/BRDStudio.jsx` | `http://localhost:8001` | `""` (empty) |
| `frontend/src/components/ChatWindow.jsx` | `http://localhost:8003/api/start` | `/api/start` |
| `frontend/src/components/ChatWindow.jsx` | `http://localhost:8003/api/chat` | `/api/chat` |
| `frontend/src/components/ChatWindow.jsx` | `http://localhost:8003/download/` | `/download/` |
| `frontend/src/components/UiPathChatWindow.jsx` | `http://localhost:8004/api/migration/uipath/analyze` | `/api/migration/uipath/analyze` |
| `frontend/src/components/BluePrismChatWindow.jsx` | `http://localhost:8004/api/migration/bp/analyze` | `/api/migration/bp/analyze` |
| `frontend/src/components/AutomationAnywhereChatWindow.jsx` | `http://localhost:8004/api/migration/aa/analyze` | `/api/migration/aa/analyze` |

### 8.2 Verify No Hardcoded URLs Remain

After deployment, run this from the project root to confirm:

```powershell
# Should return zero matches
Select-String -Path "frontend\src\**\*.jsx","frontend\src\**\*.js" -Pattern "localhost:8\d{3}" -Recurse
```

### 8.3 Frontend Dockerfile

The existing `frontend/Dockerfile` requires no changes:

```dockerfile
FROM node:20-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm install --silent
COPY . .
RUN npm run build

FROM nginx:stable-alpine
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

> **Condition:** If your React build outputs to `dist/` instead of `build/`, update
> the `COPY --from=build /app/build` line accordingly. Check your `vite.config.js` or
> `package.json` `build` script output directory.

---

## 9. CORS & Backend Configuration

### 9.1 Backend CORS Origins

Each backend service's `main.py` has been updated to include the production hostname:

```python
allow_origins=[
    "http://localhost:3000",
    "http://localhost:5173",
    "http://mspeventwin2.westus.cloudapp.azure.com",
    "http://mspeventwin2.westus.cloudapp.azure.com:3000",
    "https://mspeventwin2.westus.cloudapp.azure.com",
],
```

**Files updated:**
- `backend/auth_service/main.py`
- `backend/brd_service/main.py`
- `backend/automation_service/main.py`

> **Note:** With the Nginx gateway architecture, API requests originate from the **same
> origin** as the frontend (port 3000). Browsers won't send CORS preflight requests for
> same-origin calls. The CORS config is a fallback safety net.

### 9.2 Backend `core/deps.py` — OAuth2 Token URL

Changed from hardcoded localhost to a relative URL:

```python
# Before:
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="http://localhost:8000/api/auth/login")

# After:
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
```

This makes the Swagger UI `/docs` work correctly regardless of the deployment hostname.

### 9.3 BRD Service Data Path

The BRD service stores frames, videos, exports, and documents in `/app/brd_studio_data`
inside the container, which is backed by the `brd_studio_data` Docker named volume.
No code changes needed — the path is computed relative to the source file automatically.

---

## 10. Build & Deploy

### 10.1 Build All Containers

```powershell
cd C:\deploy\edge-assistant
docker compose build --no-cache
```

This will:
- Build the Python backend image (with FFmpeg)
- Build the React frontend, then package the built SPA into an Nginx image
- Pull PostgreSQL 15 and Redis 7 Alpine images

Expected build time: **10–20 minutes** (first build).

### 10.2 Start the Stack

```powershell
docker compose up -d
```

### 10.3 Verify All Containers Are Running

```powershell
docker compose ps
```

Expected output:

```
NAME                 STATUS              PORTS
auth_service         Up (healthy)
automation_service   Up (healthy)
brd_service          Up (healthy)
edge_frontend        Up                  0.0.0.0:3000->80/tcp
edge_postgres        Up (healthy)        5432/tcp
edge_redis           Up (healthy)        6379/tcp
migration_service    Up (healthy)
proposal_service     Up (healthy)
```

> **Note:** Only `edge_frontend` shows a host port mapping (3000→80). Backend services
> are accessible only via Docker's internal network.

### 10.4 Check Logs for Errors

```powershell
# All services
docker compose logs --tail=50

# Specific service
docker compose logs -f brd-service
docker compose logs -f auth-service
docker compose logs -f frontend
```

**Common startup issues:**
- `host not found in upstream "auth-service"` → Backend container hasn't started yet.
  The `depends_on` should prevent this, but if it occurs, restart the frontend:
  `docker compose restart frontend`
- `password authentication failed` → Check `POSTGRES_USER` and `POSTGRES_PASSWORD` in `.env`

### 10.5 Initialize the Database and Create Admin User

```powershell
docker exec -it auth_service bash
```

Inside the container:

```bash
python -c "
import asyncio
from core.db import AsyncSessionLocal, engine, Base
from auth_service.models import User
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')

async def create_admin():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncSessionLocal() as session:
        user = User(
            email='admin@automationedge.com',
            username='admin',
            hashed_password=pwd_context.hash('ChangeMe123!'),
            role='admin',
            is_active=True,
        )
        session.add(user)
        await session.commit()
        print('Admin user created successfully')

asyncio.run(create_admin())
"
exit
```

> **Change the password** immediately after first login.

### 10.6 Quick Smoke Test

```powershell
# Test the Nginx gateway health
curl http://localhost:3000/nginx-health

# Test auth API through the gateway
curl http://localhost:3000/api/health

# Test BRD API through the gateway
curl http://localhost:3000/api/brd/health

# Open in browser
start http://localhost:3000
```

---

## 11. Host-Level Nginx for TLS (Optional)

If you need HTTPS (recommended for production), install Nginx on the Windows host to
terminate TLS and forward all traffic to the frontend container on port 3000.

> **Without TLS:** Just expose port 3000 directly and access via
> `http://mspeventwin2.westus.cloudapp.azure.com:3000`. Skip this section.

### 11.1 Install Nginx on Windows

Download from https://nginx.org/en/download.html (Windows stable) and extract to `C:\nginx`.

### 11.2 Host Nginx Configuration

Create `C:\nginx\conf\nginx.conf`:

```nginx
worker_processes auto;

events {
    worker_connections 1024;
}

http {
    include       mime.types;
    default_type  application/octet-stream;
    sendfile      on;
    keepalive_timeout 65;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=general:10m rate=50r/s;

    # The single upstream — our frontend container handles all routing
    upstream app_gateway {
        server 127.0.0.1:3000;
    }

    # ── HTTP → HTTPS Redirect ─────────────────────────────────────────────
    server {
        listen 80;
        server_name mspeventwin2.westus.cloudapp.azure.com;

        # Uncomment the next line to force HTTPS (after TLS certs are in place)
        # return 301 https://$host$request_uri;

        # While testing without TLS, proxy everything to the gateway:
        location / {
            limit_req zone=general burst=30 nodelay;
            proxy_pass http://app_gateway;
            proxy_set_header Host              $host;
            proxy_set_header X-Real-IP         $remote_addr;
            proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout   600s;
            proxy_send_timeout   120s;
            client_max_body_size 500M;
        }
    }

    # ── HTTPS Server (uncomment after placing TLS certs) ──────────────────
    # server {
    #     listen 443 ssl http2;
    #     server_name mspeventwin2.westus.cloudapp.azure.com;
    #
    #     ssl_certificate      C:/nginx/ssl/fullchain.pem;
    #     ssl_certificate_key  C:/nginx/ssl/privkey.pem;
    #     ssl_protocols        TLSv1.2 TLSv1.3;
    #     ssl_ciphers          HIGH:!aNULL:!MD5:!RC4;
    #     ssl_prefer_server_ciphers on;
    #     ssl_session_cache    shared:SSL:10m;
    #     ssl_session_timeout  1d;
    #
    #     # HSTS — tell browsers to always use HTTPS
    #     add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    #
    #     location / {
    #         limit_req zone=general burst=30 nodelay;
    #         proxy_pass http://app_gateway;
    #         proxy_set_header Host              $host;
    #         proxy_set_header X-Real-IP         $remote_addr;
    #         proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    #         proxy_set_header X-Forwarded-Proto $scheme;
    #         proxy_read_timeout   600s;
    #         proxy_send_timeout   120s;
    #         client_max_body_size 500M;
    #     }
    # }
}
```

> **Key simplification:** The host Nginx is a thin TLS terminator. It does NOT need
> per-service routing — all path-based routing is already handled by the frontend
> container's Nginx. The host just proxies everything to `127.0.0.1:3000`.

### 11.3 Start Host Nginx

```powershell
cd C:\nginx
.\nginx.exe
```

To reload after config changes:
```powershell
.\nginx.exe -s reload
```

To stop:
```powershell
.\nginx.exe -s quit
```

### 11.4 TLS Certificate with Let's Encrypt (Win-ACME)

```powershell
# Download win-acme from https://www.win-acme.com/
# Run:
wacs.exe --target manual --host mspeventwin2.westus.cloudapp.azure.com --store pemfiles --pemfilespath C:\nginx\ssl
```

Then:
1. Uncomment the `return 301` line in the HTTP server block
2. Uncomment the entire HTTPS server block
3. Reload: `C:\nginx\nginx.exe -s reload`

### 11.5 Auto-Start Host Nginx as a Windows Service

```powershell
# Using NSSM (Non-Sucking Service Manager)
# Download from https://nssm.cc/download
nssm install nginx C:\nginx\nginx.exe
nssm set nginx AppDirectory C:\nginx
nssm set nginx Start SERVICE_AUTO_START
nssm start nginx
```

---

## 12. Windows Firewall & Azure NSG

### 12.1 Windows Firewall

```powershell
# Allow inbound HTTP (host Nginx or direct container access)
New-NetFirewallRule -DisplayName "HTTP (80)" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow

# Allow inbound HTTPS (if using TLS)
New-NetFirewallRule -DisplayName "HTTPS (443)" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow

# Allow inbound on 3000 (if NOT using host Nginx, access frontend container directly)
New-NetFirewallRule -DisplayName "Frontend (3000)" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

> **Do NOT open ports 8000–8004.** Backend services are only accessible via the Docker
> internal network through the frontend Nginx gateway.

### 12.2 Azure Network Security Group (NSG)

In the Azure Portal: **VM** → **Networking** → **Network Security Group** → **Add Inbound Rules**:

**With host Nginx (recommended):**

| Priority | Name     | Port | Protocol | Source | Action |
|----------|----------|------|----------|--------|--------|
| 100      | HTTP     | 80   | TCP      | Any    | Allow  |
| 110      | HTTPS    | 443  | TCP      | Any    | Allow  |

**Without host Nginx (direct container access):**

| Priority | Name      | Port | Protocol | Source | Action |
|----------|-----------|------|----------|--------|--------|
| 100      | Frontend  | 3000 | TCP      | Any    | Allow  |

> **Security:** Never open backend ports (8000–8004) or database ports (5432, 6379)
> in the NSG. These should only be accessible within the VM / Docker network.

---

## 13. Post-Deployment Verification

### 13.1 Health Checks

```powershell
# Nginx gateway health (direct)
curl http://localhost:3000/nginx-health

# Auth API (through Nginx gateway)
curl http://localhost:3000/api/health

# BRD API (through Nginx gateway)
curl http://localhost:3000/api/brd/health

# External access (from your laptop or browser)
curl http://mspeventwin2.westus.cloudapp.azure.com/nginx-health       # With host Nginx
curl http://mspeventwin2.westus.cloudapp.azure.com:3000/nginx-health  # Without host Nginx
```

### 13.2 Frontend Verification

Open a browser and navigate to:

```
http://mspeventwin2.westus.cloudapp.azure.com        # With host Nginx on port 80
http://mspeventwin2.westus.cloudapp.azure.com:3000   # Without host Nginx
```

You should see the Edge Assistant login page.

### 13.3 End-to-End Test Checklist

- [ ] Login page loads correctly
- [ ] Register a new user → success
- [ ] Login with the new user → dashboard loads
- [ ] Navigate to BRD Studio → page loads
- [ ] Create a new project → project appears in list
- [ ] Upload a video → frames are extracted and displayed
- [ ] Generate BRD → sections populate with AI content
- [ ] Export DOCX → file downloads successfully with images and diagrams
- [ ] Navigate to Automation chat → send a message → AI responds
- [ ] Test migration tools (UiPath / BluePrism / AA) → analysis works

### 13.4 Database Verification

```powershell
docker exec -it edge_postgres psql -U edgeadmin -d edge_assistant -c "\dt"
```

You should see tables for `users`, `brd_projects`, `brd_sections`, `brd_captures`, etc.

---

## 14. Security Hardening

### 14.1 Mandatory Steps

| Item | Action | Status |
|------|--------|--------|
| Change default admin password | Login and change immediately after creation | Required |
| Unique SECRET_KEY | Generate a 64+ char random key, never reuse | Required |
| Strong DB password | 16+ chars, alphanumeric + special | Required |
| vertex-key.json permissions | Mount as read-only (`:ro` in docker-compose) | Done |
| Backend ports unexposed | No `ports:` section for backend services | Done |
| Non-root container user | `appuser` created in Dockerfile | Done |

### 14.2 Recommended Steps

| Item | Action |
|------|--------|
| Enable TLS/HTTPS | See §11 — use Win-ACME for free Let's Encrypt certs |
| Add HSTS header | Included in HTTPS config (§11.2) |
| Restrict NSG source IPs | If only certain IPs need access, restrict in Azure NSG |
| Disable Docker Desktop auto-update | Prevent unexpected restarts during business hours |
| Set `ACCESS_TOKEN_EXPIRE_MINUTES` | Default 10080 (7 days) — reduce for stricter security |
| Add Nginx rate limiting | Included in host Nginx config (§11.2) — 50 req/s per IP |
| Rotate secrets periodically | Change SECRET_KEY and DB password quarterly |

### 14.3 Environment File Security

```powershell
# Restrict .env file permissions (Windows)
icacls "C:\deploy\edge-assistant\.env" /inheritance:r /grant:r "SYSTEM:(R)" /grant:r "Administrators:(R)"
```

Never commit `.env` or `vertex-key.json` to Git. Ensure `.gitignore` includes:

```
.env
backend/vertex-key.json
*.pem
*.key
```

---

## 15. Monitoring & Logging

### 15.1 Docker Logs

```powershell
# Follow all logs in real-time
docker compose logs -f

# Follow a specific service
docker compose logs -f brd-service --tail=100

# Save logs to file
docker compose logs --no-color > C:\deploy\logs\docker_$(Get-Date -Format "yyyy-MM-dd").log
```

### 15.2 Nginx Access Logs (inside frontend container)

```powershell
# View frontend Nginx access log
docker exec edge_frontend cat /var/log/nginx/access.log

# View frontend Nginx error log (useful for upstream connection issues)
docker exec edge_frontend cat /var/log/nginx/error.log
```

### 15.3 Host Nginx Logs (if using §11)

```powershell
# Default location
Get-Content C:\nginx\logs\access.log -Tail 50
Get-Content C:\nginx\logs\error.log -Tail 50
```

### 15.4 Automated Log Rotation (PowerShell Scheduled Task)

Create `C:\deploy\scripts\rotate-logs.ps1`:

```powershell
$date = Get-Date -Format "yyyy-MM-dd"
$logDir = "C:\deploy\logs"
if (!(Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir }

# Save Docker logs
docker compose -f C:\deploy\edge-assistant\docker-compose.yml logs --no-color > "$logDir\docker_$date.log"

# Rotate host Nginx logs (if installed)
if (Test-Path "C:\nginx\logs\access.log") {
    Move-Item "C:\nginx\logs\access.log" "$logDir\nginx_access_$date.log" -Force
    Move-Item "C:\nginx\logs\error.log" "$logDir\nginx_error_$date.log" -Force
    C:\nginx\nginx.exe -s reopen
}

# Remove logs older than 30 days
Get-ChildItem "$logDir\*.log" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item
```

Schedule it:

```powershell
$action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-File C:\deploy\scripts\rotate-logs.ps1"
$trigger = New-ScheduledTaskTrigger -Daily -At "02:00AM"
Register-ScheduledTask -TaskName "EdgeAssistant-LogRotation" -Action $action -Trigger $trigger -User "SYSTEM"
```

### 15.5 Disk Usage Monitoring

```powershell
# Docker disk usage
docker system df

# BRD data volume size
docker exec edge_frontend du -sh /var/log/nginx/ 2>$null
docker system df -v | Select-String "brd_studio_data|ae_studio_data|postgres_data"

# Windows disk space
Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{N="Free(GB)";E={[math]::Round($_.Free/1GB,2)}}, @{N="Used(GB)";E={[math]::Round($_.Used/1GB,2)}}
```

---

## 16. Maintenance & Operations

### 16.1 Common Commands

```powershell
# View running containers
docker compose ps

# View logs (follow mode)
docker compose logs -f <service-name>

# Restart a single service
docker compose restart brd-service

# Stop everything
docker compose down

# Stop and remove volumes (CAUTION: deletes DB data)
docker compose down -v

# Rebuild and restart a single service
docker compose up -d --build brd-service

# Full rebuild
docker compose build --no-cache
docker compose up -d
```

### 16.2 Database Backup

```powershell
# Create backup directory
if (!(Test-Path C:\deploy\backups)) { mkdir C:\deploy\backups }

# Backup
docker exec edge_postgres pg_dump -U edgeadmin edge_assistant > "C:\deploy\backups\db_backup_$(Get-Date -Format 'yyyy-MM-dd_HH-mm').sql"

# Restore
Get-Content C:\deploy\backups\db_backup_2026-03-26_14-00.sql | docker exec -i edge_postgres psql -U edgeadmin edge_assistant
```

**Automated daily backup** (add to Windows Task Scheduler):

```powershell
$action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-Command `"docker exec edge_postgres pg_dump -U edgeadmin edge_assistant > C:\deploy\backups\db_$(Get-Date -Format 'yyyy-MM-dd').sql`""
$trigger = New-ScheduledTaskTrigger -Daily -At "01:00AM"
Register-ScheduledTask -TaskName "EdgeAssistant-DBBackup" -Action $action -Trigger $trigger -User "SYSTEM"
```

### 16.3 Update Deployment

```powershell
cd C:\deploy\edge-assistant

# Pull latest code
git pull origin main

# Rebuild and restart
docker compose build --no-cache
docker compose up -d

# Verify
docker compose ps
curl http://localhost:3000/nginx-health
```

### 16.4 Monitor Disk Usage

```powershell
# Docker disk usage
docker system df

# Clean up unused images/containers
docker system prune -f

# Clean up unused volumes (CAUTION: only if you know volumes are unused)
docker volume prune -f
```

### 16.5 Auto-Start on Boot

Docker Desktop can be configured to start on login:

1. Docker Desktop → Settings → General → **Start Docker Desktop when you sign in** ✓
2. Docker Compose services with `restart: always` will auto-start with Docker

For the host Nginx (if used), install it as a Windows Service via NSSM (see §11.5).

---

## 17. Troubleshooting

### Frontend shows blank page or 502 errors

```powershell
# Check if all containers are running
docker compose ps

# Check frontend Nginx error log
docker exec edge_frontend cat /var/log/nginx/error.log

# Common cause: backend containers not yet started when frontend started
docker compose restart frontend
```

### "host not found in upstream" error from frontend container

This means a backend container was not running when the frontend Nginx started.

```powershell
# Fix: restart the frontend after all backends are healthy
docker compose restart frontend

# Permanent fix: ensure depends_on is configured (already done in §6.2)
```

### Container won't start

```powershell
# Check logs
docker compose logs <service-name>

# Common issues:
# - "password authentication failed" → Check POSTGRES_USER/PASSWORD in .env
# - "vertex-key.json not found" → Ensure file exists at backend/vertex-key.json
# - "address already in use" → Another process using the port
netstat -ano | findstr :3000
```

### BRD Video Processing Fails

```powershell
# Check FFmpeg is available inside the container
docker exec -it brd_service ffmpeg -version

# If not found, rebuild the backend image
docker compose build --no-cache brd-service
docker compose up -d brd-service
```

### Mermaid Diagrams Not Rendering in Export

The BRD export service calls `mermaid.ink` to render diagrams as images. This requires
outbound internet access from the `brd_service` container.

```powershell
# Test internet connectivity from inside the container
docker exec brd_service curl -s https://mermaid.ink/img/Z3JhcGggVEQKICAgIEFbIlN0YXJ0Il0gLS0-IEJbIkVuZCJd -o /dev/null -w "%{http_code}"
# Should return: 200
```

If blocked, check Windows Firewall outbound rules and Docker network settings.

### Database Connection Errors

```powershell
# Check PostgreSQL is healthy
docker compose logs db

# Connect directly
docker exec -it edge_postgres psql -U edgeadmin -d edge_assistant
```

### Out of Disk Space

```powershell
# Check Windows disk
Get-PSDrive -PSProvider FileSystem

# Clean Docker aggressively
docker system prune -a --volumes

# Remove old BRD exports (inside container)
docker exec brd_service find /app/brd_studio_data/exports -mtime +30 -delete
```

### Vertex AI Authentication Errors

```powershell
# Verify the key file is mounted correctly
docker exec -it brd_service ls -la /app/vertex-key.json

# Test Vertex AI connectivity
docker exec -it brd_service python -c "
from google.oauth2 import service_account
creds = service_account.Credentials.from_service_account_file('/app/vertex-key.json')
print(f'Project: {creds.project_id}')
print('Auth OK')
"
```

### Performance Issues

```powershell
# Check container resource usage
docker stats --no-stream

# If containers are memory-constrained, increase Docker Desktop resources:
# Docker Desktop → Settings → Resources → Memory → increase to 16GB
```

---

## Quick Reference — URL Map

```
With Host Nginx (port 80/443):
  http://mspeventwin2.westus.cloudapp.azure.com           → Login page
  http://mspeventwin2.westus.cloudapp.azure.com/api/health → Auth health
  http://mspeventwin2.westus.cloudapp.azure.com/api/brd/health → BRD health

Without Host Nginx (port 3000 direct):
  http://mspeventwin2.westus.cloudapp.azure.com:3000           → Login page
  http://mspeventwin2.westus.cloudapp.azure.com:3000/api/health → Auth health
  http://mspeventwin2.westus.cloudapp.azure.com:3000/api/brd/health → BRD health

Internal (from VM):
  http://localhost:3000/nginx-health  → Nginx gateway health
  http://localhost:3000/api/health    → Auth health
```

---

## Pre-Deployment Checklist

- [ ] `.env` created with production values (unique SECRET_KEY, strong DB password)
- [ ] `backend/vertex-key.json` present with valid GCP credentials
- [ ] `backend/Dockerfile` updated to include FFmpeg
- [ ] `docker-compose.yml` updated (no exposed backend ports, health checks, volumes)
- [ ] `frontend/nginx.conf` updated with API gateway routing
- [ ] Frontend source files use relative API URLs (no `localhost` references)
- [ ] Backend CORS origins include production hostname
- [ ] `backend/core/deps.py` tokenUrl changed to `/api/auth/login`
- [ ] Azure NSG rules allow port 80/443 (or 3000)
- [ ] Windows Firewall rules allow port 80/443 (or 3000)
- [ ] Docker Desktop installed, running with WSL 2, adequate resources allocated
- [ ] Data directories created (`ae_studio_data`, `brd_studio_data`)
- [ ] Admin user created after first deployment
- [ ] Database backup schedule configured
- [ ] Log rotation configured
