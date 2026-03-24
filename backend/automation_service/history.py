"""
history.py
──────────
Saves every chat session to history.json.
Each entry stores: session_id, usecase_name, date, messages, cumulative tokens.
"""
import os, json
from datetime import datetime

HISTORY_FILE = os.path.join(os.path.dirname(__file__), "history.json")


def _load_all() -> list:
    if not os.path.exists(HISTORY_FILE):
        return []
    try:
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def _save_all(data: list):
    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def create_session(session_id: str, usecase_name: str):
    """Create a new history entry for a session."""
    all_sessions = _load_all()
    all_sessions.append({
        "session_id":   session_id,
        "usecase_name": usecase_name,
        "date":         datetime.now().strftime("%Y-%m-%d %H:%M"),
        "messages":     [],
        "tokens": {
            "prompt":     0,
            "candidates": 0,
            "total":      0,
        },
        "files_generated": [],
    })
    _save_all(all_sessions)


def append_message(session_id: str, role: str, content: str):
    """Append a chat message (role: 'user' | 'assistant' | 'system')."""
    all_sessions = _load_all()
    for s in all_sessions:
        if s["session_id"] == session_id:
            s["messages"].append({"role": role, "content": content})
            break
    _save_all(all_sessions)


def add_tokens(session_id: str, tokens: dict):
    """Accumulate token usage for a session."""
    all_sessions = _load_all()
    for s in all_sessions:
        if s["session_id"] == session_id:
            s["tokens"]["prompt"]     += tokens.get("prompt", 0)
            s["tokens"]["candidates"] += tokens.get("candidates", 0)
            s["tokens"]["total"]      += tokens.get("total", 0)
            break
    _save_all(all_sessions)


def add_file(session_id: str, filename: str, file_type: str, path: str):
    """Record a generated file against the session."""
    all_sessions = _load_all()
    for s in all_sessions:
        if s["session_id"] == session_id:
            s["files_generated"].append({
                "filename":  filename,
                "type":      file_type,
                "path":      path,
                "timestamp": datetime.now().strftime("%H:%M:%S"),
            })
            break
    _save_all(all_sessions)


def get_all() -> list:
    """Return all sessions, newest first."""
    return list(reversed(_load_all()))


def get_session(session_id: str) -> dict | None:
    for s in _load_all():
        if s["session_id"] == session_id:
            return s
    return None
