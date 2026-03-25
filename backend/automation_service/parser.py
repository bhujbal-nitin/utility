"""
parser.py
─────────
Detects what code the LLM generated and extracts it.

IMPORTANT — Incomplete / question detection
───────────────────────────────────────────
If the LLM response signals that it needs more information before generating
(via a {"status":"incomplete"} JSON block, or via natural-language question
patterns), NO artifacts are returned. The caller should treat the response as
a plain conversational message and wait for the user to answer.

This prevents files being auto-saved when the LLM is mid-clarification.
"""
import re, json


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _blocks(text: str) -> list[tuple[str, str]]:
    return [(lang.lower().strip() if lang else "", code.strip())
            for lang, code in re.findall(r"```(\w*)\n(.*?)```", text, re.DOTALL)]


def _parse_json(code: str):
    try:
        return json.loads(code)
    except Exception:
        m = re.search(r"\{.*\}", code, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except Exception:
                pass
    return None


def _path_comment(code: str) -> str:
    m = re.search(r"#\s*Path:\s*(.+)", code)
    return m.group(1).strip() if m else ""


def _filename_from_path(path: str) -> str:
    return path.replace("\\", "/").split("/")[-1] if path else ""


# ─── Incomplete / clarification detection ────────────────────────────────────

# Phrases that indicate the LLM is asking questions, not generating final output
_QUESTION_PATTERNS = [
    r'"status"\s*:\s*"incomplete"',
    r'"missing_fields"',
    r'"status"\s*:\s*"clarification_needed"',
    r'please\s+provide',
    r'could\s+you\s+please',
    r'can\s+you\s+please\s+provide',
    r'i\s+need\s+the\s+following\s+information',
    r'before\s+i\s+can\s+generate',
    r'to\s+generate\s+the\s+correct',
    r'kindly\s+provide',
    r'please\s+clarify',
    r'i\s+need\s+more\s+details',
    r'additional\s+information\s+(?:is\s+)?(?:required|needed)',
]

_QUESTION_RE = re.compile(
    "|".join(_QUESTION_PATTERNS), re.IGNORECASE | re.DOTALL
)


def is_asking_for_info(text: str) -> bool:
    """
    Return True if the LLM response is asking for clarification rather than
    generating final artifacts.

    Checks:
    1. Any JSON block contains {"status": "incomplete"} or "missing_fields"
    2. The plain text contains clarification phrases
    """
    # Check every JSON block for incomplete status
    for lang, code in _blocks(text):
        if "json" in lang or code.strip().startswith("{"):
            obj = _parse_json(code)
            if obj:
                if obj.get("status") in ("incomplete", "clarification_needed"):
                    return True
                if "missing_fields" in obj:
                    return True

    # Check plain text (outside code blocks) for question patterns
    # Strip code blocks first to avoid false positives inside generated code
    plain = re.sub(r"```.*?```", "", text, flags=re.DOTALL)
    if _QUESTION_RE.search(plain):
        return True

    return False


# ─── Main artifact detector ───────────────────────────────────────────────────

def detect_artifacts(text: str) -> list[dict]:
    """
    Parse an LLM response and return a list of detected artifacts.

    Returns [] (empty list) if the LLM is asking for more information —
    the response should be shown as a plain chat message in that case.

    Each artifact dict:
    {
        "kind":          "dialogs" | "wa_flow" | "wa_meta" | "python_script"
                         | "python_hook" | "python_card_helper" | "python_template",
        "filename":      str,
        "content":       str,   # pretty JSON string or raw Python code
        "original_path": str,
    }
    """
    # ── Guard: if LLM is asking questions, return nothing ────────────────────
    if is_asking_for_info(text):
        return []

    artifacts = []

    for lang, code in _blocks(text):

        # ── JSON blocks ───────────────────────────────────────────────────────
        if lang == "json" or (not lang and code.strip().startswith("{")):
            obj = _parse_json(code)
            if not obj:
                continue

            # Skip status/metadata objects — not deployable artifacts
            if "status" in obj or "missing_fields" in obj:
                continue

            if "dialogs" in obj and "triggers" in obj:
                artifacts.append({
                    "kind":          "dialogs",
                    "filename":      "dialogs.json",
                    "content":       json.dumps(obj, indent=2),
                    "original_path": "",
                })
            elif "screens" in obj and "routing_model" in obj:
                artifacts.append({
                    "kind":          "wa_flow",
                    "filename":      "flow.json",
                    "content":       json.dumps(obj, indent=2),
                    "original_path": "",
                })
            elif "dialogs" not in obj and "screens" not in obj:
                # WA metadata or adaptive card wrapper
                artifacts.append({
                    "kind":          "wa_meta",
                    "filename":      "flow_metadata.json",
                    "content":       json.dumps(obj, indent=2),
                    "original_path": "",
                })

        # ── Python blocks ─────────────────────────────────────────────────────
        elif "python" in lang:
            path     = _path_comment(code)
            path_low = path.lower()
            filename = _filename_from_path(path) or "script.py"

            if "hook" in path_low or "hook" in code[:600].lower():
                kind = "python_hook"
            elif "card_helper" in path_low or "cardhelper" in path_low:
                kind = "python_card_helper"
            elif "template" in path_low:
                kind = "python_template"
            else:
                kind = "python_script"

            artifacts.append({
                "kind":          kind,
                "filename":      filename,
                "content":       code,
                "original_path": path,
            })

    return artifacts
