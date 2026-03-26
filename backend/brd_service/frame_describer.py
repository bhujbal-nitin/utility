"""
Frame Describer — Async LLM Vision Descriptions
─────────────────────────────────────────────────
Sends each captured frame to Vertex AI for OCR, description, and detail extraction.
All calls are async and can run concurrently.
"""

import asyncio
import base64
import json
import logging
import os
from typing import Any, Dict, List, Optional

import vertexai
from vertexai.generative_models import GenerativeModel, Part, Image
from google.oauth2 import service_account
from core.config import settings

logger = logging.getLogger(__name__)

# Limit concurrent LLM calls to avoid rate limiting
_CONCURRENCY_LIMIT = 5

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
        self._semaphore = asyncio.Semaphore(_CONCURRENCY_LIMIT)

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

    async def describe_frame(self, image_path: str) -> Dict[str, Any]:
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

                response = await asyncio.to_thread(
                    model.generate_content,
                    [image_part, FRAME_DESCRIPTION_PROMPT],
                    generation_config={
                        "temperature": 0.1,
                        "max_output_tokens": 2048,
                    },
                )

                text = response.text.strip()

                # Strip markdown fences if present
                if text.startswith("```"):
                    text = text.split("\n", 1)[1] if "\n" in text else text[3:]
                if text.endswith("```"):
                    text = text[:-3]
                text = text.strip()

                result = json.loads(text)

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
                return {
                    "ocr_text": "",
                    "description": f"Error parsing LLM response: {e}",
                    "app_name": "", "page_title": "",
                    "action_performed": "", "ui_elements": [],
                    "data_fields": [], "navigation_context": "",
                }
            except Exception as e:
                logger.error(f"Frame description failed for {image_path}: {e}")
                return {
                    "ocr_text": "",
                    "description": f"Error: {e}",
                    "app_name": "", "page_title": "",
                    "action_performed": "", "ui_elements": [],
                    "data_fields": [], "navigation_context": "",
                }

    async def describe_frames_batch(
        self, frames: List[Dict], callback=None
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
            desc = await self.describe_frame(frame["path"])
            results[idx] = desc
            if callback:
                await callback(idx, desc)

        tasks = [process_one(i, f) for i, f in enumerate(frames)]
        await asyncio.gather(*tasks, return_exceptions=True)

        # Replace any exceptions with error dicts
        for i, r in enumerate(results):
            if r is None or isinstance(r, Exception):
                results[i] = {
                    "ocr_text": "", "description": "Processing failed",
                    "app_name": "", "page_title": "",
                    "action_performed": "", "ui_elements": [],
                    "data_fields": [], "navigation_context": "",
                }

        return results


# Singleton
frame_describer = FrameDescriber()
