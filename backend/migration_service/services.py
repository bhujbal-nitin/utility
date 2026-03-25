import os
import json
from google.cloud import aiplatform
from vertexai.generative_models import GenerativeModel, Part
from core.config import settings

def build_prompt(platform: str, content: str, user_prompt: str = None, chunk_index: int = None, total_chunks: int = None) -> str:
    chunk_note = f"\n> NOTE: This is chunk {chunk_index + 1} of {total_chunks}. Analyze only this portion.\n" if chunk_index is not None else ""
    user_prompt_note = f'\n## USER INSTRUCTIONS\nPlease pay special attention to the following user requirement during the analysis:\n"{user_prompt}"\n' if user_prompt else ""
    
    # Base prompt elements (reconstructed from legacy system)
    platform_name = "UiPath" if platform == "uipath" else "Blue Prism" if platform == "bp" else "Automation Anywhere"
    
    prompt = f"""
I have this {platform_name} RPA tool's project file. Analyze it completely and provide the following:
{user_prompt_note}
{chunk_note}

## 1. AUTOMATION OVERVIEW
Tell me what automation is done in it - step by step, in plain language.

## 2. ALL VALUES & TECHNICAL ARTIFACTS USED
Extract every value used in the implementation, categorized as:
- Variables & Parameters (name, data type, initial value, scope)
- Collections (name, column headers, data types)
- File Paths (input files, output files, temp files, config files)
- Excel Details (workbook names, sheet names, column/header names, cell references, named ranges)
- Data Items & Constants (hardcoded strings, numbers, flags, thresholds)
- Code Stages (language used, full code block)
- Commands & Scripts (shell commands, PowerShell scripts, SQL queries)
- Application/Process Names
- Credentials & Config (usernames, config keys)

## 3. DATA MASSAGING LOGIC
- Transformations, Calculations, Filtering & Conditions, Data Mapping, String Operations, etc.

## 4. GUI & WEB AUTOMATION (If Present)
- Web/Browser Automation (URL, Action, Selectors like XPath, Index)
- Desktop/GUI Automation (Application name, Control names, Spy mode values)

## 5. PROCESS FLOW SUMMARY
Numbered end-to-end summary from trigger to completion including all branches.
"""
    if platform == "uipath":
        prompt += "\n## TOPOLOGY FLATTENING\nFlatten state machines and cyclical flowcharts into Directed Acyclic Graphs (DAGs) representing sequential data streaming steps.\n"

    prompt += f"\nFILE CONTENT:\n{content}"
    return prompt

def build_image_prompt(user_prompt: str = None) -> str:
    user_prompt_note = f'\n\nUSER INSTRUCTIONS:\n{user_prompt}' if user_prompt else ""
    return f"""STEP 1 :-
Here are some screenshots of a process developed using Automation Anywhere. 
Explain what this process line wise exactly as there are the lines in the screenshot.
Also include any variables, file paths, VB Script paths, BOT names etc. in the linewise explanation.

**Using line wise explaination Give me step by step full implementation logic with all plugin used only don't required any xml file just refer my Automation Anywhere line wise explaination and give me implementation logic.
in implementation logic use child workflow if required**

AGAIN: Output only the line-by-line explanation and step-by-step implementation logic. DO NOT output any XML markup. {user_prompt_note}"""


async def call_llm(prompt: str, system_msg: str) -> str:
    # Strictly VertexAI
    project_id = os.getenv("GCP_PROJECT_ID")
    model_name = os.getenv("GEMINI_MODEL", "gemini-2.0-flash-001")
    
    import vertexai
    vertexai.init(project=project_id, location=os.getenv("GCP_LOCATION", "us-central1"))
    model = GenerativeModel(
        model_name,
        system_instruction=[system_msg]
    )
    response = await model.generate_content_async(prompt)
    return response.text

async def call_vision_llm(base64_img: str, mime_type: str, user_prompt: str = None) -> str:
    # Strictly VertexAI
    text_payload = build_image_prompt(user_prompt)
    
    project_id = os.getenv("GCP_PROJECT_ID")
    model_name = os.getenv("GEMINI_MODEL", "gemini-2.0-flash-001")
    
    import vertexai
    vertexai.init(project=project_id, location=os.getenv("GCP_LOCATION", "us-central1"))
    model = GenerativeModel(model_name)
    
    image_part = Part.from_data(data=base64_img, mime_type=mime_type)
    response = await model.generate_content_async([text_payload, image_part])
    return response.text
