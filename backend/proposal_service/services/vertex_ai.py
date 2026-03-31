"""
vertex_ai.py
------------
Calls Vertex AI (Gemini) to infer Complexity, PS Efforts, Solution Mapping,
and AI Plugins for each use case.

v7 changes:
  - Complexity is determined using the full Ref Complexity Grid (embedded in system prompt)
  - ps_efforts no longer comes from discovery sheet (removed); AI determines it from complexity
  - estimated_exec_time is user-filled and passed through (not AI-determined)
"""

import os
import json
import logging
import re

import vertexai
from vertexai.generative_models import GenerativeModel, GenerationConfig
from core.config import settings

logger = logging.getLogger(__name__)

# ── CONFIGURATION ─────────────────────────────────────────────────────────────
VERTEX_PROJECT_ID = settings.VERTEX_PROJECT_ID
VERTEX_LOCATION   = settings.VERTEX_LOCATION
VERTEX_MODEL      = settings.VERTEX_MODEL

_CRED_FILE = settings.VERTEX_KEY_PATH
# ──────────────────────────────────────────────────────────────────────────────

_INITIALIZED = False


def _init():
    global _INITIALIZED
    if _INITIALIZED:
        return

    cred_path = os.path.abspath(_CRED_FILE)
    if not os.path.exists(cred_path):
        raise FileNotFoundError(
            f"Vertex AI credentials not found at:\n  {cred_path}\n\n"
            "Please ensure the service account JSON is at the path specified in your .env (VERTEX_KEY_PATH)."
        )

    from google.oauth2 import service_account
    credentials = service_account.Credentials.from_service_account_file(
        cred_path,
        scopes=["https://www.googleapis.com/auth/cloud-platform"],
    )
    logger.info("Using service account: %s", cred_path)
    vertexai.init(
        project=VERTEX_PROJECT_ID,
        location=VERTEX_LOCATION,
        credentials=credentials,
    )
    _INITIALIZED = True


_SYSTEM_PROMPT = """
You are an expert RPA/Automation project analyst at AutomationEdge.
Analyse each business use case and return a JSON array.

## COMPLEXITY GRID (use this to determine complexity level)

Assess each use case against these 8 parameters and their weightages:

| # | Parameter            | Weight | Simple           | Medium         | Complex         |
|---|----------------------|--------|------------------|----------------|-----------------|
| 1 | # of Applications    | 20%    | 1-2              | 3-4            | 5+              |
| 2 | # of Fields          | 25%    | <50              | 51-75          | 76+             |
| 3 | # of Screens         | 15%    | <10              | 11-20          | 21+             |
| 4 | # of Decision Points | 10%    | <3               | 4-7            | 8+              |
| 5 | Strict SLA           | 10%    | No               | Yes            | Critical        |
| 6 | Extent of Exceptions | 10%    | <5               | 6-10           | 11+             |
| 7 | # of Validations     | 10%    | <10              | 11-20          | 21+             |

Definitions:
- Simple: Simple input (Excel/web), binary decisions (Yes/No), no scanned/handwritten docs, 1-2 apps
- Medium: 3-4 apps, moderate fields, attended automation may be needed, some exceptions
- Complex: 5+ apps, multi-system handoffs, HITL, heavy IDP/AI/ML, mission-critical SLA

## PS EFFORTS (working days, based on complexity):
  Simple: 20-40 days  |  Medium: 45-65 days  |  Complex: 70-120 days

## RULES:
- complexity: MUST be exactly one of: "Simple", "Medium", "Complex"
- ps_efforts: Integer (working days). Derive from complexity range above.
- solution_mapping: Key AutomationEdge/tech components (max 120 chars, no newlines).
- ai_plugins: Integer 0-3.

CRITICAL: Return ONLY a valid compact JSON array. No markdown, no explanation.
No newlines inside string values.
Each element must have exactly: sr_no, complexity, ps_efforts, solution_mapping, ai_plugins
"""


def _build_prompt(use_cases):
    lines = []
    for uc in use_cases:
        lines.append(
            f"sr_no:{uc['sr_no']} process:{uc['process_name'][:60]} "
            f"apps:{uc['apps'][:40]} idp:{uc['idp']} "
            f"docs_annually:{uc['docs_annually']} "
            f"daily_vol:{uc['daily_volume']} "
            f"nature:{uc['nature'][:30]} input_type:{uc['input_type'][:20]} "
            f"ocr:{uc['ocr_nlp'][:20]} "
            f"summary:{uc['summary'][:120]}"
        )
    return "\n".join(lines)


def _try_parse(text):
    clean = re.sub(r"```(?:json)?", "", text).strip().rstrip("`").strip()
    try:
        return json.loads(clean)
    except json.JSONDecodeError:
        pass
    last_obj = clean.rfind("}")
    if last_obj == -1: return None
    truncated = clean[: last_obj + 1]
    truncated = truncated.rstrip().rstrip(",") + "\n]"
    try:
        return json.loads(truncated)
    except json.JSONDecodeError:
        pass
    return None


def _call_gemini(use_cases, max_tokens=8192):
    model = GenerativeModel(
        model_name=VERTEX_MODEL,
        system_instruction=_SYSTEM_PROMPT,
    )
    config = GenerationConfig(
        temperature=0.1,
        max_output_tokens=max_tokens,
    )
    response = model.generate_content(_build_prompt(use_cases), generation_config=config)
    result = _try_parse(response.text)
    if result is None:
        raise ValueError(f"Could not parse Gemini response. Raw (first 500 chars):\n{response.text[:500]}")
    return result


def _call_in_chunks(use_cases, chunk_size=4):
    all_results = []
    for i in range(0, len(use_cases), chunk_size):
        chunk = use_cases[i: i + chunk_size]
        logger.info("Calling Vertex AI chunk %d-%d ...", i + 1, i + len(chunk))
        chunk_results = _call_gemini(chunk, max_tokens=4096)
        all_results.extend(chunk_results)
    return all_results


def enrich_use_cases(use_cases):
    """
    Enrich use cases with complexity, ps_efforts, solution_mapping, ai_plugins.
    """
    _init()
    logger.info("Calling Vertex AI with %d use cases ...", len(use_cases))
    enriched = None
    try:
        enriched = _call_gemini(use_cases, max_tokens=8192)
    except (ValueError, Exception) as exc:
        logger.warning("Full call failed (%s). Retrying in chunks ...", exc)
        try:
            enriched = _call_in_chunks(use_cases, chunk_size=4)
        except Exception as exc2:
            logger.error("Chunked call also failed: %s", exc2)
            raise RuntimeError(f"Vertex AI enrichment failed even in chunks: {exc2}") from exc2

    enriched_by_sr = {item["sr_no"]: item for item in enriched}
    for uc in use_cases:
        sr   = uc["sr_no"]
        data = enriched_by_sr.get(sr, {})
        uc["complexity"]       = data.get("complexity", "Medium")
        ai_ps = int(data.get("ps_efforts", 0) or 0)
        uc["ps_efforts"]       = ai_ps if ai_ps > 0 else 50
        uc["solution_mapping"] = str(data.get("solution_mapping", ""))[:200]
        uc["ai_plugins"]       = int(data.get("ai_plugins", 1) or 1)
    return use_cases
