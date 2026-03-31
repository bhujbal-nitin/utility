"""
vertex_ai.py
------------
Calls Vertex AI (Gemini) to infer Complexity, PS Efforts, Solution Mapping,
and AI Plugins for each use case.
"""

import os
import json
import logging
import re
import vertexai
from vertexai.generative_models import GenerativeModel, GenerationConfig
from google.oauth2 import service_account

logger = logging.getLogger(__name__)

# ── CONFIGURATION ─────────────────────────────────────────────────────────────
VERTEX_PROJECT_ID = "rapid-scion-482011-f4"
VERTEX_LOCATION   = "us-central1"
VERTEX_MODEL      = "gemini-2.5-flash"

_CRED_FILE = os.path.join(
    os.path.dirname(__file__), "..", "vertex-key.json"
)
# ──────────────────────────────────────────────────────────────────────────────

_INITIALIZED = False

def _init():
    global _INITIALIZED
    if _INITIALIZED:
        return

    cred_path = os.path.abspath(_CRED_FILE)
    if not os.path.exists(cred_path):
        logger.error(f"Vertex key not found at {cred_path}")
        raise FileNotFoundError(f"Vertex key not found at {cred_path}")

    credentials = service_account.Credentials.from_service_account_file(
        cred_path,
        scopes=["https://www.googleapis.com/auth/cloud-platform"],
    )
    vertexai.init(
        project=VERTEX_PROJECT_ID,
        location=VERTEX_LOCATION,
        credentials=credentials,
    )
    _INITIALIZED = True

_SYSTEM_PROMPT = """
You are an expert RPA/Automation project analyst at AutomationEdge.
Analyse each business use case and return a JSON array.

COMPLEXITY (3 levels only):
  Simple  : 1-2 apps, no IDP/OCR/ML, simple decisions, no strict SLA
  Medium  : 3-4 apps, may need IDP/attended automation, moderate exceptions
  Complex : 5+ apps, heavy IDP/AI/ML, multi-system handoffs, HITL, critical SLA

PS EFFORTS (working days):
  Simple: 20-40  |  Medium: 45-65  |  Complex: 70-120
  If discovery sheet already has an Efforts value, use it as your baseline.

SOLUTION MAPPING: Key AutomationEdge/tech components, keep concise (max 120 chars).
AI_PLUGINS: Integer 0-3.

CRITICAL: Return ONLY a valid compact JSON array. No markdown, no explanation.
No newlines inside string values. Keep all string values short.
Each element must have exactly: sr_no, complexity, ps_efforts, solution_mapping, ai_plugins
"""

def _build_prompt(use_cases: list[dict]) -> str:
    lines = []
    for uc in use_cases:
        lines.append(
            f"sr_no:{uc['sr_no']} process:{uc['process_name'][:60]} "
            f"apps:{uc['apps'][:40]} idp:{uc['idp']} "
            f"docs_annually:{uc['docs_annually']} "
            f"disc_efforts:{uc['ps_efforts'] or 'none'} "
            f"daily_vol:{uc.get('daily_volume', 0)} "
            f"nature:{uc.get('nature', '')[:30]} input_type:{uc.get('input_type', '')[:20]} "
            f"ocr:{uc.get('ocr_nlp', '')[:20]} "
            f"summary:{uc.get('summary', '')[:120]}"
        )
    return "\n".join(lines)

def _try_parse(text: str) -> list[dict] | None:
    clean = re.sub(r"```(?:json)?", "", text).strip().rstrip("`").strip()
    try:
        return json.loads(clean)
    except json.JSONDecodeError:
        pass
    last_obj = clean.rfind("}")
    if last_obj == -1: return None
    truncated = clean[: last_obj + 1].rstrip().rstrip(",") + "\n]"
    try:
        return json.loads(truncated)
    except json.JSONDecodeError:
        pass
    return None

def _call_gemini(use_cases: list[dict], max_tokens: int = 8192) -> list[dict]:
    model = GenerativeModel(model_name=VERTEX_MODEL, system_instruction=_SYSTEM_PROMPT)
    config = GenerationConfig(temperature=0.1, max_output_tokens=max_tokens)
    response = model.generate_content(_build_prompt(use_cases), generation_config=config)
    result = _try_parse(response.text)
    if result is None:
        raise ValueError(f"Could not parse Gemini response.")
    return result

def enrich_use_cases(use_cases: list[dict]) -> list[dict]:
    _init()
    try:
        enriched = _call_gemini(use_cases, max_tokens=8192)
    except Exception as exc:
        logger.warning(f"Vertex call failed: {exc}")
        return use_cases

    enriched_by_sr = {item["sr_no"]: item for item in enriched}
    for uc in use_cases:
        sr = uc["sr_no"]
        data = enriched_by_sr.get(sr, {})
        uc["complexity"] = data.get("complexity", "Medium")
        ai_ps = int(data.get("ps_efforts", 0) or 0)
        uc["ps_efforts"] = ai_ps if ai_ps > 0 else (uc.get("ps_efforts") or 50)
        uc["solution_mapping"] = str(data.get("solution_mapping", ""))[:200]
        uc["ai_plugins"] = int(data.get("ai_plugins", 1) or 1)
    return use_cases
