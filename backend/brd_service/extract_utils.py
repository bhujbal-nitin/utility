import os
import docx
import pdfplumber
import logging

logger = logging.getLogger(__name__)

async def extract_text_from_file(file_path: str) -> str:
    """Extract text from .docx, .pdf, or .txt files."""
    ext = os.path.splitext(file_path)[1].lower()
    text = ""
    
    try:
        if ext == ".docx":
            doc = docx.Document(file_path)
            text = "\n".join([para.text for para in doc.paragraphs])
        elif ext == ".pdf":
            with pdfplumber.open(file_path) as pdf:
                text = "\n".join([page.extract_text() or "" for page in pdf.pages])
        elif ext == ".txt":
            with open(file_path, "r", encoding="utf-8") as f:
                text = f.read()
        else:
            logger.warning(f"Unsupported file type for extraction: {ext}")
            
    except Exception as e:
        logger.error(f"Error extracting text from {file_path}: {e}")
        
    return text.strip()
