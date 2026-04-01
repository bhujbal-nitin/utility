"""
Frame Describer — Async LLM Vision Descriptions
─────────────────────────────────────────────────
Sends each captured frame to Vertex AI for OCR, description, and detail extraction.
All calls are async and can run concurrently.
"""

import asyncio
import json
import logging
import os
import re
from typing import Any, Dict, List, Optional

import vertexai
from vertexai.generative_models import GenerativeModel, Part
from google.oauth2 import service_account
from core.config import settings

logger = logging.getLogger(__name__)

FRAME_DESCRIPTION_PROMPT = """You are an expert Business Analyst examining a screenshot from a process walkthrough video.

Analyze this screenshot and provide a structured JSON response with EXACTLY these fields:

{
  "ocr_text": "All visible text on screen, transcribed verbatim. Include menu items, buttons, labels, form fields, error messages, URLs, etc.",
  "description": "A 2-3 sentence description of what screen/page is shown and what action is being performed.",
  "app_name": "Name of the application visible (e.g., 'SAP', 'Salesforce', 'Microsoft Excel', 'Chrome Browser')",
  "page_title": "Title or header of the current page/screen",
  "action_performed": "What action the user appears to be performing (e.g., 'Filling a form', 'Navigating to dashboard', 'Clicking submit button')",
  "ui_elements": ["List", "of", "key", "UI elements", "visible"],
  "data_fields": ["List of form fields or data columns visible, if any"],
  "navigation_context": "Where this screen sits in a workflow (e.g., 'Login page', 'After clicking Reports menu', 'Final review step')"
}

Return ONLY valid JSON. No markdown fences, no commentary."""


class FrameDescriber:
    """Describes frame images using Vertex AI vision model."""

    def __init__(self):
        self._model: Optional[GenerativeModel] = None
        self._semaphore = asyncio.Semaphore(max(1, int(settings.BRD_LLM_FRAME_CONCURRENCY or 6)))

    def _ensure_model(self) -> GenerativeModel:
        if self._model is not None:
            return self._model

        creds = service_account.Credentials.from_service_account_file(
            settings.VERTEX_KEY_PATH
        )
        prj = settings.VERTEX_PROJECT_ID or getattr(creds, "project_id", None)
        vertexai.init(
            project=prj,
            location=settings.VERTEX_LOCATION,
            credentials=creds,
        )
        self._model = GenerativeModel(settings.VERTEX_MODEL)
        return self._model

    @staticmethod
    def _safe_default_result(error_msg: str = "") -> Dict[str, Any]:
        return {
            "ocr_text": "",
            "description": error_msg or "Processing failed",
            "app_name": "",
            "page_title": "",
            "action_performed": "",
            "ui_elements": [],
            "data_fields": [],
            "navigation_context": "",
        }

    @staticmethod
    def _extract_json_block(text: str) -> str:
        cleaned = (text or "").strip()
        if not cleaned:
            return ""

        # Remove markdown code fences if the model still emits them.
        if "```" in cleaned:
            cleaned = re.sub(r"```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r"\s*```$", "", cleaned)
            cleaned = cleaned.strip()

        # Prefer the largest JSON object in the payload.
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            return cleaned[start : end + 1].strip()
        return cleaned

    @classmethod
    def _parse_model_json(cls, raw_text: str) -> Dict[str, Any]:
        payload = cls._extract_json_block(raw_text)
        if not payload:
            raise json.JSONDecodeError("Empty model response", "", 0)

        # Try strict JSON first.
        try:
            return json.loads(payload)
        except json.JSONDecodeError:
            pass

        # Best-effort repair for common model mistakes and TRUNCATED responses.
        repaired = payload
        repaired = repaired.replace("\r\n", "\n").replace("\r", "\n")
        
        # 1. Clean non-printable control characters (except common whitespace)
        repaired = "".join(c for c in repaired if c.isprintable() or c in "\n\r\t")
        
        # 2. Fix curly quotes and apostrophes
        repaired = repaired.replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'")
        
        # 3. Handle truncated responses (unterminated strings/objects)
        # If the last character isn't a closing brace/bracket, it might be truncated.
        if repaired and repaired[-1] not in ("}", "]"):
            # If we're inside a string, close it first.
            if repaired.count('"') % 2 != 0:
                repaired += '"'
            
            # Balance braces and brackets
            open_braces = repaired.count("{") - repaired.count("}")
            if open_braces > 0:
                repaired += "}" * open_braces
            
            open_brackets = repaired.count("[") - repaired.count("]")
            if open_brackets > 0:
                repaired += "]" * open_brackets

        # 4. Remove trailing commas before closing braces/brackets
        repaired = re.sub(r",\s*([}\]])", r"\1", repaired)

        try:
            return json.loads(repaired)
        except json.JSONDecodeError as e:
            # Last ditch effort: if it's still failing, it might be a very broken string.
            # We'll try to find any valid JSON or return an error.
            logger.warning(f"Final JSON repair failed: {e}. Payload: {repaired[:100]}...")
            raise

    @classmethod
    def _normalize_result(cls, parsed: Dict[str, Any]) -> Dict[str, Any]:
        base = cls._safe_default_result("")
        if not isinstance(parsed, dict):
            return base

        for key in base.keys():
            if key in parsed and parsed[key] is not None:
                base[key] = parsed[key]

        if not isinstance(base["ui_elements"], list):
            base["ui_elements"] = [str(base["ui_elements"])] if base["ui_elements"] else []
        if not isinstance(base["data_fields"], list):
            base["data_fields"] = [str(base["data_fields"])] if base["data_fields"] else []

        for key in ["ocr_text", "description", "app_name", "page_title", "action_performed", "navigation_context"]:
            base[key] = str(base.get(key) or "")

        return base

    async def describe_frame(
        self,
        image_path: str,
        transcript_context: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Send a single frame to Vertex AI for description.

        Args:
            image_path: Absolute path to the frame image

        Returns:
            Dict with keys: ocr_text, description, app_name, page_title,
            action_performed, ui_elements, data_fields, navigation_context
        """
        async with self._semaphore:
            try:
                model = self._ensure_model()

                # Read image bytes
                with open(image_path, "rb") as f:
                    image_bytes = f.read()

                # Determine mime type
                ext = os.path.splitext(image_path)[1].lower()
                mime_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
                mime = mime_map.get(ext, "image/jpeg")

                image_part = Part.from_data(data=image_bytes, mime_type=mime)

                transcript_block = ""
                if transcript_context:
                    snippet_lines = []
                    for idx, seg in enumerate(transcript_context):
                        start = seg.get("start", 0)
                        end = seg.get("end", 0)
                        speaker = seg.get("speaker") or "Unknown"
                        text = (seg.get("text") or "").strip()
                        if not text:
                            continue
                        snippet_lines.append(
                            f"{idx+1}. [{start:.2f}s - {end:.2f}s] {speaker}: {text[:600]}"
                        )
                    if snippet_lines:
                        transcript_block = (
                            "\n\nTRANSCRIPT CONTEXT (closest ±5 segments around this frame timestamp):\n"
                            + "\n".join(snippet_lines)
                            + "\n\nUse this context to improve screen action interpretation."
                        )

                response = await asyncio.to_thread(
                    model.generate_content,
                    [image_part, FRAME_DESCRIPTION_PROMPT + transcript_block],
                    generation_config={
                        "temperature": 0.1,
                        "max_output_tokens": int(settings.BRD_LLM_MAX_OUTPUT_TOKENS or 1024),
                    },
                )

                text = (response.text or "").strip()
                result = self._normalize_result(self._parse_model_json(text))

                # Log token usage
                usage = getattr(response, "usage_metadata", None)
                if usage:
                    logger.info(
                        f"[FRAME_DESCRIBE] {os.path.basename(image_path)}: "
                        f"prompt={getattr(usage, 'prompt_token_count', '?')} "
                        f"output={getattr(usage, 'candidates_token_count', '?')}"
                    )

                return result

            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse LLM response for {image_path}: {e}")
                return self._safe_default_result(f"Error parsing LLM response: {e}")
            except Exception as e:
                logger.error(f"Frame description failed for {image_path}: {e}")
                return self._safe_default_result(f"Error: {e}")

    async def describe_frames_batch(
        self,
        frames: List[Dict],
        callback=None,
        transcript_context_by_frame: Optional[Dict[str, List[Dict[str, Any]]]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Describe multiple frames concurrently with a semaphore.

        Args:
            frames: List of dicts with 'path' key pointing to image file
            callback: Optional async callback(frame_index, description) for streaming updates

        Returns:
            List of description dicts (same order as input)
        """
        results = [None] * len(frames)

        async def process_one(idx: int, frame: Dict):
            frame_key = frame.get("id") or frame.get("path")
            ctx = (transcript_context_by_frame or {}).get(frame_key) if frame_key else None
            desc = await self.describe_frame(frame["path"], transcript_context=ctx)
            results[idx] = desc
            if callback:
                await callback(idx, desc)

        tasks = [process_one(i, f) for i, f in enumerate(frames)]
        await asyncio.gather(*tasks, return_exceptions=True)

        # Replace any exceptions with error dicts
        for i, r in enumerate(results):
            if r is None or isinstance(r, Exception):
                results[i] = self._safe_default_result("Processing failed")

        return results


# Singleton
frame_describer = FrameDescriber()
