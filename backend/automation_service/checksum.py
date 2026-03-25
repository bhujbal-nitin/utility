"""checksum.py — exact logic from user's Checksum.py"""
import os, hashlib, zipfile, tempfile, shutil
from datetime import datetime


def _create_checksum(dir_name, hash_, exclude=["checksum.txt"]):
    for item in sorted(os.listdir(dir_name)):
        if item in exclude: continue
        path = os.path.join(dir_name, item)
        if os.path.isfile(path):
            with open(path, "rb") as f: hash_.update(f.read())
        elif os.path.isdir(path):
            _create_checksum(path, hash_, exclude)
    return hash_


def create_checksum_txt(folder_path):
    hash_ = hashlib.md5()
    _create_checksum(folder_path, hash_)
    cp = os.path.join(folder_path, "checksum.txt")
    with open(cp, "w") as f: f.write(hash_.hexdigest())
    return cp


def zip_folder(folder_path, zip_path):
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(folder_path):
            for file in files:
                fp = os.path.join(root, file)
                z.write(fp, os.path.relpath(fp, folder_path))


def _make_zip(files: dict, zip_name: str, output_dir: str) -> str:
    """Generic: files = {arcname: content_str}. Returns final zip path."""
    os.makedirs(output_dir, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix="gems_")
    folder = os.path.join(tmp, "upload_folder")
    os.makedirs(folder)
    try:
        for name, content in files.items():
            fpath = os.path.join(folder, name)
            os.makedirs(os.path.dirname(fpath), exist_ok=True)
            with open(fpath, "w", encoding="utf-8") as f:
                f.write(content)
        create_checksum_txt(folder)
        tmp_zip = os.path.join(tmp, zip_name)
        zip_folder(folder, tmp_zip)
        final = os.path.join(output_dir, zip_name)
        shutil.move(tmp_zip, final)
        return final
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def create_dialogs_zip(dialogs_json: str, usecase: str, output_dir: str) -> str:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    return _make_zip({"dialogs.json": dialogs_json},
                     f"{usecase}_dialogs_{ts}.zip", output_dir)


def create_wa_flow_zip(wa_flow_json: str, wa_meta_json: str,
                       usecase: str, output_dir: str) -> str:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    files = {f"{usecase}_flow.json": wa_flow_json}
    if wa_meta_json:
        files[f"{usecase}_flow_metadata.json"] = wa_meta_json
    return _make_zip(files, f"{usecase}_wa_flow_{ts}.zip", output_dir)
