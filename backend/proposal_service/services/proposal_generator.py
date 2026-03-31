"""
proposal_generator.py
---------------------
Calls the Node.js generate_proposal.js script to produce a .docx proposal.
Works on Windows, macOS, and Linux.
"""

import os
import sys
import json
import shutil
import subprocess
import logging

logger = logging.getLogger(__name__)

_SCRIPT  = os.path.join(os.path.dirname(__file__), "generate_proposal.js")
_IMG_DIR = os.path.join(os.path.dirname(__file__), "proposal_images")


def _find_node() -> str:
    """
    Return the path to the node executable, searching common Windows install
    locations if `node` is not on PATH.
    """
    # 1. Already on PATH?
    node = shutil.which("node") or shutil.which("node.exe")
    if node:
        return node

    # 2. Common Windows install paths
    candidates = []
    for base in (
        os.environ.get("ProgramFiles",      r"C:\Program Files"),
        os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"),
        os.environ.get("LOCALAPPDATA",      ""),
        os.environ.get("APPDATA",           ""),
    ):
        if base:
            candidates.append(os.path.join(base, "nodejs", "node.exe"))

    # nvm-windows stores versions under APPDATA\nvm or NVM_HOME
    nvm_root = os.environ.get("NVM_HOME") or os.path.join(
        os.environ.get("APPDATA", ""), "nvm"
    )
    if os.path.isdir(nvm_root):
        try:
            for ver_dir in sorted(os.listdir(nvm_root), reverse=True):
                candidates.append(os.path.join(nvm_root, ver_dir, "node.exe"))
        except OSError:
            pass

    for path in candidates:
        if os.path.isfile(path):
            logger.info("Found node at: %s", path)
            return path

    raise FileNotFoundError(
        "Cannot find node.exe. Make sure Node.js is installed and either:\n"
        "  * Added to your system PATH, or\n"
        "  * Installed at C:\\Program Files\\nodejs\\node.exe\n"
        "Download from https://nodejs.org/"
    )


def _find_node_modules() -> str:
    """
    Return the node_modules directory that contains the 'docx' package.
    Checks local (next to the JS script) first, then npm global.
    """
    # Local node_modules (next to the JS file)
    local_nm = os.path.join(os.path.dirname(_SCRIPT), "node_modules")
    if os.path.isdir(os.path.join(local_nm, "docx")):
        return local_nm

    # On Windows, always prefer npm.cmd to avoid WinError 193
    npm_exe = "npm.cmd" if os.name == "nt" else "npm"
    
    try:
        node = _find_node()
        npm = shutil.which(npm_exe) or os.path.join(os.path.dirname(node), npm_exe)
        
        if npm and os.path.isfile(npm):
            # shell=True is mandatory for batch files (.cmd) on Windows
            r = subprocess.run(
                [npm, "root", "-g"],
                capture_output=True, text=True, timeout=15, shell=(os.name == "nt")
            )
            global_nm = r.stdout.strip()
            if global_nm and os.path.isdir(os.path.join(global_nm, "docx")):
                return global_nm
    except Exception:
        pass

    return None


def generate_proposal_docx(
    output_path: str,
    use_cases: list,
    client_info: dict,
    software: dict = None,
    hardware: dict = None,
) -> str:
    """
    Build a proposal .docx file from use_cases + client_info.
    """
    node_exe = _find_node()

    # Make sure 'docx' npm package is resolvable – install locally if needed
    nm = _find_node_modules()
    if nm is None:
        logger.info("'docx' package not found; running npm install in services/")
        services_dir = os.path.dirname(_SCRIPT)
        
        npm_exe = "npm.cmd" if os.name == "nt" else "npm"
        npm = shutil.which(npm_exe) or os.path.join(os.path.dirname(node_exe), npm_exe)

        subprocess.run(
            [npm, "install", "docx"],
            cwd=services_dir,
            check=True,
            timeout=120,
            shell=(os.name == "nt")
        )

    data = {
        **client_info,
        "use_cases": use_cases,
        "software":  software or {},
        "hardware":  hardware or {},
    }

    tmp_json = output_path.replace(".docx", "_data.json")
    with open(tmp_json, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    cmd = [
        node_exe, _SCRIPT,
        "--data",   tmp_json,
        "--out",    output_path,
        "--images", _IMG_DIR,
    ]

    # On Windows, set NODE_PATH so require('docx') resolves from global modules
    env = os.environ.copy()
    if nm:
        existing = env.get("NODE_PATH", "")
        env["NODE_PATH"] = nm + (os.pathsep + existing if existing else "")

    logger.info("Running node: %s", node_exe)

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
            shell=False,
            env=env,
        )
        if result.returncode != 0:
            err = (result.stderr or result.stdout or "Node script failed with no output").strip()
            logger.error("generate_proposal.js error:\n%s", err)
            raise RuntimeError(err)
        logger.info("Proposal generated: %s", output_path)
    finally:
        try:
            if os.path.exists(tmp_json):
                os.remove(tmp_json)
        except OSError:
            pass

    return output_path
