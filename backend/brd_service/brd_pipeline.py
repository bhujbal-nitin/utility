"""
BRD Pipeline — Knowledge-Graph V2 Generation
─────────────────────────────────────────────
Section-by-section BRD generation using evidence extraction from
transcripts + captures + documents. Includes mandatory flow diagrams.
"""

import asyncio
import logging
import json
import re
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
    FLOW_GRAPH_JSON_PROMPT,
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
        parts: List[str] = []

        # 1. Capture evidence (Primary for Section 9 Narrative)
        if captures:
            parts.append("## SCREEN CAPTURE NARRATIVE CONTEXT")
            parts.append("The following captures represent the step-by-step visual flow of the process. Use these to build the detailed narrative.")
            for idx, cap in enumerate(sorted(captures, key=lambda c: (c.get("timestamp", 0), c.get("id", "")))):
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
                    parts.append(f"- Key Text/Fields on Screen: {cap['ocr_text'][:1200]}")

        # 2. Transcript evidence
        if transcripts:
            parts.append("\n## TRANSCRIPT & MEETING CONTEXT")
            for t in sorted(transcripts, key=lambda t: (t.get("order", 10**9), t.get("filename", ""))):
                text = t.get("transcript_text", "") or ""
                if text.strip():
                    parts.append(f"### Recording: {t.get('filename', 'Walkthrough')}")
                    parts.append(text)

        # 3. Additional documents
        if documents:
            parts.append("\n## DOCUMENTATION CONTEXT")
            for doc in sorted(documents, key=lambda d: d.get("filename", "")):
                if doc.get("extracted_text"):
                    parts.append(f"### Ref Doc: {doc.get('filename', 'Document')}")
                    parts.append(doc["extracted_text"])

        return "\n".join(parts)

    def build_evidence_pack_for_section(
        self,
        section_key: str,
        captures: List[Dict],
        transcripts: List[Dict],
        documents: List[Dict],
    ) -> str:
        """
        Section-specific evidence shaping.

        Rationale:
        - Section 9 (process_detail) should be a readable screen sequence, not a raw
          OCR/UI dump. We therefore provide a capture-focused, concise evidence pack.
        - Other sections can use the full unified evidence pack.
        """
        if section_key != "process_detail":
            return self.build_evidence_pack(captures, transcripts, documents)

        parts: List[str] = []
        kept = [c for c in captures if c.get("is_kept", True)]
        if kept:
            parts.append("## SCREEN CAPTURES (ORDERED)")
            parts.append(
                "Use these captures to infer the screen sequence and write concise step bullets. "
                "Do NOT transcribe every field or include long clickstreams."
            )
            for idx, cap in enumerate(sorted(kept, key=lambda c: (c.get("timestamp", 0), c.get("id", "")))):
                cap_id = cap.get("id", "")
                label = cap.get("label") or f"Step {idx + 1}"
                desc = (cap.get("description") or "").strip()
                # Keep description short; it is meant to guide grouping, not to be copied verbatim.
                if len(desc) > 420:
                    desc = desc[:417].rstrip() + "..."
                parts.append(f'\n### [IMAGE_REF:{cap_id}] - {label}')
                if desc:
                    parts.append(f"- Visual Summary: {desc}")

                details = cap.get("details_json") or {}
                app = (details.get("app_name") or "").strip()
                title = (details.get("page_title") or "").strip()
                if app or title:
                    bits = []
                    if app:
                        bits.append(app)
                    if title:
                        bits.append(title)
                    parts.append(f"- Screen Context: {' — '.join(bits)}")

        # Provide light transcript context (optional) to avoid hallucinated steps,
        # but keep it short so Section 9 stays readable.
        if transcripts:
            short_tx = []
            for t in sorted(transcripts, key=lambda t: (t.get("order", 10**9), t.get("filename", ""))):
                text = (t.get("transcript_text") or "").strip()
                if not text:
                    continue
                short_tx.append(f"### Recording: {t.get('filename', 'Walkthrough')}\n{text[:2200]}")
            if short_tx:
                parts.append("\n## TRANSCRIPT (ABRIDGED)")
                parts.extend(short_tx[:1])  # keep only the first transcript blob to control size

        # Additional docs are generally not needed for Section 9 step narration.
        return "\n".join(parts).strip()

    def build_evidence_manifest(
        self,
        captures: List[Dict],
        transcripts: List[Dict],
        documents: List[Dict],
    ) -> Dict[str, Any]:
        kept = [c for c in captures if c.get("is_kept", True)]
        missing_desc = [c.get("id") for c in kept if not (c.get("description") or "").strip()]
        transcript_missing = [t.get("filename") for t in transcripts if not (t.get("transcript_text") or "").strip()]
        doc_missing = [d.get("filename") for d in documents if not (d.get("extracted_text") or "").strip()]
        return {
            "captures_total": len(captures),
            "captures_kept": len(kept),
            "capture_ids": [c.get("id") for c in kept],
            "captures_missing_description": [x for x in missing_desc if x],
            "transcripts_total": len(transcripts),
            "transcripts_with_text": len(transcripts) - len(transcript_missing),
            "transcripts_missing_text": [x for x in transcript_missing if x],
            "documents_total": len(documents),
            "documents_with_text": len(documents) - len(doc_missing),
            "documents_missing_text": [x for x in doc_missing if x],
        }

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
        """Generate robust Mermaid via canonical flow JSON and code-side compilation."""
        try:
            graph_json = await self._generate_flow_graph_json(evidence_pack)
            if graph_json:
                mermaid = self._flow_json_to_mermaid(graph_json)
                return f"```mermaid\n{mermaid}\n```\n\n*{flow_type.replace('_', ' ').title()} diagram generated from canonical flow graph.*"
        except Exception as e:
            logger.warning("Canonical flow-JSON generation failed (%s): %s", flow_type, e)

        # Fallback to legacy direct Mermaid prompt
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
            text = self._extract_text(response).strip()
            if "```mermaid" in text:
                return text
        except Exception as e:
            logger.error(f"Legacy flow diagram generation failed ({flow_type}): {e}")

        return """```mermaid
graph TD
    N1["Start"] --> N2["Process Step 1"]
    N2 --> N3["Process Step 2"]
    N3 --> N4["End"]
```

*Flow diagram fallback generated. Please refine manually if needed.*"""

    async def _generate_flow_graph_json(self, evidence_pack: str) -> Optional[Dict[str, Any]]:
        prompt = FLOW_GRAPH_JSON_PROMPT.format(evidence_pack=evidence_pack)
        model = self._ensure_model()
        response = await asyncio.wait_for(
            asyncio.to_thread(
                model.generate_content,
                prompt,
                generation_config=GENERATION_CONFIGS["precise"],
            ),
            timeout=VERTEXAI_TIMEOUT,
        )
        raw = self._extract_text(response).strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)
        data = json.loads(raw)
        if not isinstance(data, dict):
            return None
        nodes = data.get("nodes") or []
        edges = data.get("edges") or []
        if not nodes or not edges:
            return None
        return data

    def _flow_json_to_mermaid(self, graph: Dict[str, Any]) -> str:
        nodes = graph.get("nodes") or []
        edges = graph.get("edges") or []
        node_lines = []
        edge_lines = []

        for node in nodes:
            node_id = re.sub(r"[^A-Za-z0-9_]", "_", str(node.get("id", "N")))
            label = (str(node.get("label", "")).strip() or node_id).replace('"', "'")[:48]
            ntype = str(node.get("type", "process")).lower()
            if ntype == "decision":
                node_lines.append(f'    {node_id}{{"{label}"}}')
            else:
                node_lines.append(f'    {node_id}["{label}"]')

        for edge in edges:
            src = re.sub(r"[^A-Za-z0-9_]", "_", str(edge.get("from", "")))
            dst = re.sub(r"[^A-Za-z0-9_]", "_", str(edge.get("to", "")))
            if not src or not dst:
                continue
            lbl = str(edge.get("label", "")).strip().replace('"', "'")[:32]
            if lbl:
                edge_lines.append(f'    {src} -->|{lbl}| {dst}')
            else:
                edge_lines.append(f"    {src} --> {dst}")

        mermaid = "graph TD\n" + "\n".join(node_lines + edge_lines)
        return mermaid.strip()

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
        # 1. Build evidence pack (full) for manifest/logging; generation can use section-specific shaping.
        evidence_pack = self.build_evidence_pack(captures, videos, documents)
        manifest = self.build_evidence_manifest(captures, videos, documents)
        logger.info("Evidence manifest: %s", manifest)
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
                section_evidence = self.build_evidence_pack_for_section(key, captures, videos, documents)
                content = await self.generate_section(key, section_evidence, mode, instruction)

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
