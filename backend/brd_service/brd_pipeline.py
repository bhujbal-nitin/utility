"""
BRD Pipeline — Knowledge-Graph V2 Generation
─────────────────────────────────────────────
Section-by-section BRD generation using evidence extraction from
transcripts + captures + documents. Includes mandatory flow diagrams.
"""

import asyncio
import json
import logging
from typing import Any, Dict, List, Optional

import vertexai
from vertexai.generative_models import GenerativeModel
from google.oauth2 import service_account

from core.config import settings
from brd_service.prompts import (
    SECTION_WRITER_PROMPTS,
    SECTION_DEFINITIONS,
    EVIDENCE_EXTRACTION_PROMPT,
    FLOW_DIAGRAM_PROMPT,
    REFINE_SECTION_PROMPT,
    GENERATION_CONFIGS,
)

logger = logging.getLogger(__name__)

VERTEXAI_TIMEOUT = 300  # 5 minutes


class BRDPipeline:
    """
    Knowledge-graph V2 BRD generation pipeline.

    Flow:
    1. Build evidence pack from transcripts + capture descriptions + documents
    2. Extract structured evidence per transcript chunk
    3. Route evidence to section-specific prompts
    4. Generate sections in parallel (with concurrency limit)
    5. Generate mandatory flow diagrams
    6. Assemble into BrdSection records
    """

    def __init__(self):
        self._model: Optional[GenerativeModel] = None

    def _ensure_model(self) -> GenerativeModel:
        if self._model is not None:
            return self._model

        creds = service_account.Credentials.from_service_account_file(
            settings.VERTEX_KEY_PATH
        )
        prj = settings.VERTEX_PROJECT_ID or getattr(creds, "project_id", None)
        vertexai.init(project=prj, location=settings.VERTEX_LOCATION, credentials=creds)
        self._model = GenerativeModel(settings.VERTEX_MODEL)
        return self._model

    def _extract_text(self, response: Any) -> str:
        if hasattr(response, "text"):
            return response.text
        if hasattr(response, "candidates") and response.candidates:
            for candidate in response.candidates:
                if hasattr(candidate, "content") and hasattr(candidate.content, "parts"):
                    for part in candidate.content.parts:
                        if hasattr(part, "text"):
                            return part.text
        return ""

    # ── Evidence Building ─────────────────────────────────────────────────

    def build_evidence_pack(
        self,
        captures: List[Dict],
        transcripts: List[Dict],
        documents: List[Dict],
    ) -> str:
        """Build a unified evidence string from all sources."""
        parts = []

        # 1. Capture evidence (Primary for Section 9 Narrative)
        if captures:
            parts.append("## SCREEN CAPTURE NARRATIVE CONTEXT")
            parts.append("The following captures represent the step-by-step visual flow of the process. Use these to build the detailed narrative.")
            for idx, cap in enumerate(captures):
                if not cap.get("is_kept", True):
                    continue
                parts.append(f"\n### [IMAGE_REF:{cap.get('id', '')}] - Screen: {cap.get('label', 'Step ' + str(idx+1))}")
                parts.append(f"- Vision Description: {cap.get('description', 'No visual description available.')}")
                
                details = cap.get("details_json") or {}
                if details.get("app_name"):
                    parts.append(f"- App: {details['app_name']}")
                if details.get("action_performed"):
                    parts.append(f"- User Action: {details['action_performed']}")
                if cap.get("ocr_text"):
                    parts.append(f"- Key Text/Fields on Screen: {cap['ocr_text'][:500]}")

        # 2. Transcript evidence
        if transcripts:
            parts.append("\n## TRANSCRIPT & MEETING CONTEXT")
            for t in transcripts:
                text = t.get("transcript_text", "") or ""
                if text.strip():
                    parts.append(f"### Recording: {t.get('filename', 'Walkthrough')}")
                    parts.append(text[:8000])

        # 3. Additional documents
        if documents:
            parts.append("\n## DOCUMENTATION CONTEXT")
            for doc in documents:
                if doc.get("extracted_text"):
                    parts.append(f"### Ref Doc: {doc.get('filename', 'Document')}")
                    parts.append(doc["extracted_text"][:3000])

        return "\n".join(parts)

    # ── Section Generation ────────────────────────────────────────────────

    async def generate_section(
        self,
        section_key: str,
        evidence_pack: str,
        mode: str = "default",
        instruction: Optional[str] = None,
    ) -> str:
        """Generate a single BRD section from evidence."""
        prompt_template = SECTION_WRITER_PROMPTS.get(section_key)
        if not prompt_template:
            logger.warning(f"No prompt template for section: {section_key}")
            return ""

        prompt = prompt_template.format(evidence_pack=evidence_pack)
        
        # Append user instruction if provided
        if instruction:
            prompt += f"\n\nUSER INSTRUCTION FOR THIS SECTION:\n{instruction}"

        config = GENERATION_CONFIGS.get(mode, GENERATION_CONFIGS["default"])

        try:
            model = self._ensure_model()
            response = await asyncio.wait_for(
                asyncio.to_thread(model.generate_content, prompt, generation_config=config),
                timeout=VERTEXAI_TIMEOUT,
            )
            text = self._extract_text(response)

            # Log token usage
            usage = getattr(response, "usage_metadata", None)
            if usage:
                logger.info(
                    f"[SECTION_GEN] {section_key}: "
                    f"prompt={getattr(usage, 'prompt_token_count', '?')} "
                    f"output={getattr(usage, 'candidates_token_count', '?')}"
                )

            return text.strip()
        except Exception as e:
            logger.error(f"Section generation failed for {section_key}: {e}")
            return ""

    # ── Flow Diagram Generation (Mandatory) ───────────────────────────────

    async def generate_flow_diagram(
        self,
        evidence_pack: str,
        flow_type: str = "existing",
    ) -> str:
        """Generate a Mermaid flow diagram. ALWAYS generates even with minimal evidence."""
        prompt = FLOW_DIAGRAM_PROMPT.format(evidence_pack=evidence_pack)

        try:
            model = self._ensure_model()
            response = await asyncio.wait_for(
                asyncio.to_thread(
                    model.generate_content,
                    prompt,
                    generation_config=GENERATION_CONFIGS["precise"],
                ),
                timeout=VERTEXAI_TIMEOUT,
            )
            return self._extract_text(response).strip()
        except Exception as e:
            logger.error(f"Flow diagram generation failed ({flow_type}): {e}")
            # Return a minimal fallback diagram
            return f"""```mermaid
graph TD
    A[Start] --> B[Process Step 1]
    B --> C[Process Step 2]
    C --> D[End]
```

*Flow diagram could not be generated from evidence. Please update manually.*"""

    # ── Section Refinement ────────────────────────────────────────────────

    async def refine_section(
        self,
        content: str,
        instruction: str,
        context: str = "",
    ) -> str:
        """Refine a section based on user instruction."""
        prompt = REFINE_SECTION_PROMPT.format(
            content=content,
            instruction=instruction,
            context=context or "N/A",
        )

        try:
            model = self._ensure_model()
            response = await asyncio.wait_for(
                asyncio.to_thread(
                    model.generate_content,
                    prompt,
                    generation_config=GENERATION_CONFIGS["precise"],
                ),
                timeout=VERTEXAI_TIMEOUT,
            )
            return self._extract_text(response).strip()
        except Exception as e:
            logger.error(f"Section refinement failed: {e}")
            raise

    # ── Full BRD Generation ───────────────────────────────────────────────

    async def generate_full_brd(
        self,
        captures: List[Dict],
        videos: List[Dict],
        documents: List[Dict],
        mode: str = "default",
        instruction: Optional[str] = None,
        sections_to_generate: Optional[List[str]] = None,
    ) -> List[Dict]:
        """
        Generate all or specific BRD sections from evidence.
        """
        # 1. Build evidence pack
        evidence_pack = self.build_evidence_pack(captures, videos, documents)
        logger.info(f"Evidence pack built: {len(evidence_pack)} chars")

        # 2. Generate all sections concurrently (with limit)
        semaphore = asyncio.Semaphore(3)  # Max 3 concurrent LLM calls

        async def gen_with_limit(section_def):
            async with semaphore:
                key = section_def["key"]
                title = section_def["title"]

                # If sections_to_generate provided, skip ones not in the list
                if sections_to_generate and key not in sections_to_generate:
                    return None

                # The section prompts for flow_existing/flow_proposed already
                # include Mermaid diagram generation instructions.
                content = await self.generate_section(key, evidence_pack, mode, instruction)

                # Fallback: if flow sections came back without a Mermaid diagram,
                # generate one explicitly
                if key in ("flow_existing", "flow_proposed") and "```mermaid" not in (content or ""):
                    flow_diagram = await self.generate_flow_diagram(evidence_pack, key)
                    if flow_diagram:
                        content = (content or "") + "\n\n" + flow_diagram

                return {"section_key": key, "title": title, "content": content}

        tasks = [gen_with_limit(sd) for sd in SECTION_DEFINITIONS]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Filter out errors
        sections = []
        for r in results:
            if isinstance(r, dict):
                sections.append(r)
            elif isinstance(r, Exception):
                logger.error(f"Section generation error: {r}")

        logger.info(f"BRD generation complete: {len(sections)} sections")
        return sections


# Singleton
brd_pipeline = BRDPipeline()
