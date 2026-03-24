"""
pipeline.py
───────────
Conversational Vertex AI pipeline.
One function: send_message(session_id, user_text) → LLM response text.

Sessions are kept in memory (chat history maintained by Vertex AI SDK).
Retry with exponential backoff on 429 ResourceExhausted.
"""

import os, sys, uuid, time, threading
import settings as cfg

_sessions: dict = {}   # { session_id: { "chat", "tokens_accumulated" } }
_lock = threading.Lock()

MAX_RETRIES      = 5
RETRY_BASE_DELAY = 15   # seconds, doubles each retry


# ─── Vertex init ──────────────────────────────────────────────────────────────

def _init_vertex():
    s = cfg.load()
    pylibs = s.get("pylibs_path", "").strip()
    if pylibs and os.path.isdir(pylibs) and pylibs not in sys.path:
        sys.path.insert(0, pylibs)

    import vertexai
    from vertexai.generative_models import GenerativeModel
    from google.oauth2 import service_account

    creds = service_account.Credentials.from_service_account_file(s["service_account_path"])
    vertexai.init(project=s["project_id"],
                  location=s.get("vertex_location", "us-central1"),
                  credentials=creds)

    with open(s["system_prompt_path"], "r", encoding="utf-8") as f:
        sys_instruction = f.read()

    kb_parts = []
    for fname in sorted(os.listdir(s["kb_folder"])):
        if fname.endswith((".py", ".json", ".md")):
            with open(os.path.join(s["kb_folder"], fname), "r", encoding="utf-8") as f:
                kb_parts.append(f"--- DOCUMENT: {fname} ---\n{f.read()}\n")

    model = GenerativeModel(
        s.get("vertex_model", "gemini-2.0-flash"),
        system_instruction=[sys_instruction],
    )
    return model, kb_parts


def _token_stats(response) -> dict:
    try:
        u = response.usage_metadata
        return {"prompt": u.prompt_token_count,
                "candidates": u.candidates_token_count,
                "total": u.total_token_count}
    except Exception:
        return {"prompt": 0, "candidates": 0, "total": 0}


# ─── Session management ───────────────────────────────────────────────────────

def create_session() -> str:
    """Create a new Vertex AI chat session. Returns session_id."""
    model, kb_parts = _init_vertex()
    chat = model.start_chat()
    session_id = str(uuid.uuid4())
    with _lock:
        _sessions[session_id] = {"chat": chat, "kb_parts": kb_parts}
    return session_id


def session_exists(session_id: str) -> bool:
    with _lock:
        return session_id in _sessions


# ─── Core send with retry ─────────────────────────────────────────────────────

def send_message(session_id: str, user_text: str,
                 is_first: bool = False, log=None) -> dict:
    """
    Send one message to the chat session.

    Parameters
    ----------
    session_id : str
    user_text  : str   — the user's message
    is_first   : bool  — if True, KB context is prepended to the message
    log        : callable(str) | None

    Returns
    -------
    dict: { text, tokens }
    """
    def _log(m):
        if log: log(m)

    with _lock:
        session = _sessions.get(session_id)
    if not session:
        raise ValueError("Session not found. Please start a new conversation.")

    chat     = session["chat"]
    kb_parts = session.get("kb_parts", [])

    # First message includes KB context
    msg = (kb_parts + [user_text]) if is_first else user_text

    delay = RETRY_BASE_DELAY
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = chat.send_message(msg)
            tokens = _token_stats(response)
            return {"text": response.text, "tokens": tokens}
        except Exception as e:
            err = str(e)
            if ("429" in err or "ResourceExhausted" in err or
                    "RESOURCE_EXHAUSTED" in err) and attempt < MAX_RETRIES:
                _log(f"⚠️ Rate limit (429) — waiting {delay}s, retry {attempt}/{MAX_RETRIES-1} …")
                time.sleep(delay)
                delay *= 2
            else:
                raise


def close_session(session_id: str):
    with _lock:
        _sessions.pop(session_id, None)
