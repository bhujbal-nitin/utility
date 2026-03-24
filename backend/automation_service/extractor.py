"""extractor.py — Extract text from .txt/.pdf/.docx/.md"""
import os

def extract_text(filepath: str) -> str:
    ext = os.path.splitext(filepath)[1].lower()
    if ext in (".txt", ".md"):
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()
    if ext == ".pdf":
        import pypdf
        return "\n".join(p.extract_text() or "" for p in pypdf.PdfReader(filepath).pages)
    if ext == ".docx":
        from docx import Document
        return "\n".join(p.text for p in Document(filepath).paragraphs)
    raise ValueError(f"Unsupported: {ext}")
