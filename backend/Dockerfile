# Production Grade Slim Python Build
FROM python:3.11-slim as builder

WORKDIR /app

# Prevent python from producing pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies into venv for low size final image
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Final stage
FROM python:3.11-slim

WORKDIR /app

# Copy venv from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONPATH=/app

# Install runtime dependencies (libpq for asyncpg/postgresql)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Copy application source
COPY . .

# Ensure data directory exists
RUN mkdir -p /app/ae_studio_data

# Use a non-root user for security
RUN adduser --disabled-password --gecos '' appuser && chown -R appuser:appuser /app
USER appuser

# The CMD is overridden in docker-compose.yml for different services
CMD ["uvicorn", "auth_service.main:app", "--host", "0.0.0.0", "--port", "8000"]
