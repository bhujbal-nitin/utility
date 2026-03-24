"""settings.py — persists all user config to settings.json"""
import os, json

SETTINGS_FILE = os.path.join(os.path.dirname(__file__), "settings.json")

DEFAULTS = {
    "service_account_path": "",
    "project_id":           "",
    "vertex_location":      "us-central1",
    "vertex_model":         "gemini-2.0-flash",
    "pylibs_path":          "",
    "kb_folder":            "",
    "system_prompt_path":   "",
    "scripts_dir":          "",
    "card_helper_dir":      "",
    "templates_dir":        "",
    "hooks_dir":            "",
}

def load() -> dict:
    if not os.path.exists(SETTINGS_FILE):
        return {}
    with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save(data: dict):
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump({**DEFAULTS, **data}, f, indent=2)

def is_configured() -> bool:
    s = load()
    return all(s.get(k, "").strip() for k in
               ["service_account_path", "project_id", "kb_folder",
                "system_prompt_path", "scripts_dir", "hooks_dir"])

def get(key: str, fallback="") -> str:
    return load().get(key, fallback)
