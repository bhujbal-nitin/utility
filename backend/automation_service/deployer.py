"""
deployer.py
───────────
Saves each detected artifact to the correct configured directory.
Python files → {scripts_dir}/{usecase}_{filename}  (no subfolder)
Hooks        → {hooks_dir}/custom_hook.py
Card helper  → {card_helper_dir}/{filename}
Templates    → {templates_dir}/{filename}
Dialogs      → downloads/{usecase}_dialogs_{ts}.zip  (with checksum)
WA Flow      → downloads/{usecase}_wa_flow_{ts}.zip  (with checksum)
"""
import os, shutil
from datetime import datetime
from . import settings as cfg
from . import checksum as ck


def _ensure(path):
    os.makedirs(path, exist_ok=True)

def _ts():
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def deploy_artifact(artifact: dict, usecase_name: str,
                    downloads_dir: str) -> dict:
    """
    Deploy a single artifact.

    Returns
    -------
    dict: { kind, filename, destination, download, status, action_msg }
    """
    s    = cfg.load()
    kind = artifact["kind"]
    ts   = _ts()

    # ── Dialogs zip ───────────────────────────────────────────────────────────
    if kind == "dialogs":
        zip_path = ck.create_dialogs_zip(artifact["content"], usecase_name, downloads_dir)
        zip_name = os.path.basename(zip_path)
        return {
            "kind":        kind,
            "filename":    zip_name,
            "destination": zip_path,
            "download":    zip_name,
            "status":      "✅",
            "action_msg":  f"Dialogs zipped with checksum → ready to import into AI Studio",
        }

    # ── WhatsApp flow zip ─────────────────────────────────────────────────────
    if kind == "wa_flow":
        zip_path = ck.create_wa_flow_zip(
            artifact["content"], "", usecase_name, downloads_dir)
        zip_name = os.path.basename(zip_path)
        return {
            "kind":        kind,
            "filename":    zip_name,
            "destination": zip_path,
            "download":    zip_name,
            "status":      "✅",
            "action_msg":  "WhatsApp Flow zipped with checksum → upload to Meta manually",
        }

    # ── WhatsApp metadata ─────────────────────────────────────────────────────
    if kind == "wa_meta":
        dest_dir = downloads_dir
        _ensure(dest_dir)
        fname = f"{usecase_name}_flow_metadata_{ts}.json"
        dest  = os.path.join(dest_dir, fname)
        with open(dest, "w", encoding="utf-8") as f:
            f.write(artifact["content"])
        return {
            "kind":        kind,
            "filename":    fname,
            "destination": dest,
            "download":    fname,
            "status":      "✅",
            "action_msg":  "WA Flow metadata saved",
        }

    # ── Python script (no subfolder — saved as {usecase}_{filename}) ──────────
    if kind == "python_script":
        dest_dir = s.get("scripts_dir", "").strip()
        _ensure(dest_dir)
        raw_name = artifact["filename"]
        # Prefix with usecase name if not already prefixed
        if not raw_name.startswith(usecase_name + "_"):
            fname = f"{usecase_name}_{raw_name}"
        else:
            fname = raw_name
        dest = os.path.join(dest_dir, fname)
        with open(dest, "w", encoding="utf-8") as f:
            f.write(artifact["content"])
        return {
            "kind":        kind,
            "filename":    fname,
            "destination": dest,
            "download":    None,
            "status":      "✅",
            "action_msg":  f"Saved to scripts directory as {fname}",
        }

    # ── Custom hooks ──────────────────────────────────────────────────────────
    if kind == "python_hook":
        dest_dir = s.get("hooks_dir", "").strip()
        _ensure(dest_dir)
        dest = os.path.join(dest_dir, "custom_hook.py")
        if os.path.exists(dest):
            shutil.copy2(dest, dest.replace(".py", f"_bak_{ts}.py"))
        with open(dest, "w", encoding="utf-8") as f:
            f.write(artifact["content"])
        return {
            "kind":        kind,
            "filename":    "custom_hook.py",
            "destination": dest,
            "download":    None,
            "status":      "✅",
            "action_msg":  "Saved to hooks directory (previous backed up)",
        }

    # ── Card helper ───────────────────────────────────────────────────────────
    if kind == "python_card_helper":
        dest_dir = s.get("card_helper_dir", "").strip() or s.get("scripts_dir", "")
        _ensure(dest_dir)
        dest = os.path.join(dest_dir, artifact["filename"])
        with open(dest, "w", encoding="utf-8") as f:
            f.write(artifact["content"])
        return {
            "kind":        kind,
            "filename":    artifact["filename"],
            "destination": dest,
            "download":    None,
            "status":      "✅",
            "action_msg":  "Saved to card helper directory",
        }

    # ── Template ──────────────────────────────────────────────────────────────
    if kind == "python_template":
        dest_dir = s.get("templates_dir", "").strip() or s.get("scripts_dir", "")
        _ensure(dest_dir)
        dest = os.path.join(dest_dir, artifact["filename"])
        with open(dest, "w", encoding="utf-8") as f:
            f.write(artifact["content"])
        return {
            "kind":        kind,
            "filename":    artifact["filename"],
            "destination": dest,
            "download":    None,
            "status":      "✅",
            "action_msg":  "Saved to templates directory",
        }

    return {
        "kind":        kind,
        "filename":    artifact.get("filename", "unknown"),
        "destination": "—",
        "download":    None,
        "status":      "⚠️",
        "action_msg":  f"Unknown artifact kind: {kind}",
    }
