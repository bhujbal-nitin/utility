from core.config import settings as core_settings
import os

def load() -> dict:
    # Resolve relative paths against the backend root so it works regardless of CWD if needed
    # But since uvicorn runs typically from backend/, relative defaults work nicely.
    return {
        "service_account_path": core_settings.VERTEX_KEY_PATH,
        "project_id":           core_settings.VERTEX_PROJECT_ID,
        "vertex_location":      core_settings.VERTEX_LOCATION,
        "vertex_model":         core_settings.VERTEX_MODEL,
        "pylibs_path":          "",
        "kb_folder":            core_settings.AI_STUDIO_KB_FOLDER,
        "system_prompt_path":   core_settings.AI_STUDIO_SYSTEM_PROMPT_PATH,
        "scripts_dir":          core_settings.AI_STUDIO_SCRIPTS_DIR,
        "card_helper_dir":      core_settings.AI_STUDIO_CARD_HELPER_DIR,
        "templates_dir":        core_settings.AI_STUDIO_TEMPLATES_DIR,
        "hooks_dir":            core_settings.AI_STUDIO_HOOKS_DIR,
    }

def save(data: dict):
    pass

def is_configured() -> bool:
    return True

def get(key: str, fallback="") -> str:
    return load().get(key, fallback)
