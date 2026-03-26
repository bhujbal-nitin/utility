import os, json, queue, threading, tempfile, uuid, asyncio
from fastapi import FastAPI, Request, Response, HTTPException, Depends, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel
from typing import Optional

# Internal imports from copied automation logic
from automation_service import settings as cfg
from automation_service import pipeline
from automation_service import parser as prs
from automation_service import deployer
from automation_service import history as hist
from automation_service.extractor import extract_text

# Cross-service deps
from core.deps import RequireRole, get_current_user
from auth_service.models import User, RoleEnum
from core.config import settings as core_settings

app = FastAPI(title="Edge Assistant Automation Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://mspeventwin2.westus.cloudapp.azure.com",
        "http://mspeventwin2.westus.cloudapp.azure.com:3000",
        "https://mspeventwin2.westus.cloudapp.azure.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DOWNLOADS_DIR = core_settings.AI_STUDIO_DOWNLOADS_DIR

# Required Roles setup
automation_role = RequireRole([RoleEnum.AUTOMATION, RoleEnum.ADMIN])

class StartRequest(BaseModel):
    usecase_name: str

class ChatRequest(BaseModel):
    session_id: str
    usecase_name: Optional[str] = "chatbot"
    message: str
    is_first: Optional[bool] = False
    attachment_text: Optional[str] = ""

@app.post("/api/start", dependencies=[Depends(automation_role)])
async def api_start(body: StartRequest):
    usecase_name = body.usecase_name.strip().replace(" ", "_")
    if not usecase_name:
        raise HTTPException(status_code=400, detail="usecase_name is required")
    try:
        session_id = pipeline.create_session()
        hist.create_session(session_id, usecase_name)
        return {"session_id": session_id, "usecase_name": usecase_name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat", dependencies=[Depends(automation_role)])
async def api_chat(body: ChatRequest):
    session_id = body.session_id
    usecase_name = body.usecase_name.replace(" ", "_")
    user_msg = body.message.strip()
    is_first = body.is_first
    attachment = body.attachment_text

    full_user_msg = f"{user_msg}\n\n{attachment}" if attachment else user_msg
    q = queue.Queue()

    def run():
        try:
            def log(m): q.put({"type": "progress", "message": m})
            hist.append_message(session_id, "user", user_msg)
            result = pipeline.send_message(session_id, full_user_msg, is_first=is_first, log=log)
            llm_text = result["text"]
            tokens = result["tokens"]
            hist.add_tokens(session_id, tokens)
            hist.append_message(session_id, "assistant", llm_text)

            is_asking = prs.is_asking_for_info(llm_text)
            artifacts = [] if is_asking else prs.detect_artifacts(llm_text)

            for art in artifacts:
                try:
                    info = deployer.deploy_artifact(art, usecase_name, DOWNLOADS_DIR)
                    hist.add_file(session_id, info["filename"], info["kind"], info["destination"])
                    q.put({"type": "artifact", "info": info})
                except Exception as ae:
                    q.put({"type": "progress", "message": f"⚠️ Could not save {art['filename']}: {ae}"})

            q.put({"type": "done", "text": llm_text, "tokens": tokens, "is_asking": is_asking})
        except Exception as exc:
            q.put({"type": "error", "message": str(exc)})

    threading.Thread(target=run, daemon=True).start()

    async def event_generator():
        while True:
            # Avoid blocking async loop
            while q.empty():
                await asyncio.sleep(0.1)
            msg = q.get()
            yield f"data: {json.dumps(msg, ensure_ascii=False)}\n\n"
            if msg["type"] in ("done", "error"):
                break

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.post("/api/upload", dependencies=[Depends(automation_role)])
async def api_upload(file: UploadFile = File(...)):
    suffix = os.path.splitext(file.filename)[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name
    try:
        text = extract_text(tmp_path)
        return {"text": text, "filename": file.filename}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        os.unlink(tmp_path)

@app.get("/api/history", dependencies=[Depends(automation_role)])
async def api_history():
    return hist.get_all()

@app.get("/api/history/{session_id}", dependencies=[Depends(automation_role)])
async def api_history_session(session_id: str):
    s = hist.get_session(session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Not found")
    return s

@app.get("/download/{filename}", dependencies=[Depends(automation_role)])
async def download(filename: str):
    # Search for the file in all relevant storage folders
    search_dirs = [
        core_settings.AI_STUDIO_DOWNLOADS_DIR,
        core_settings.AI_STUDIO_SCRIPTS_DIR,
        core_settings.AI_STUDIO_TEMPLATES_DIR,
        core_settings.AI_STUDIO_CARD_HELPER_DIR,
        core_settings.AI_STUDIO_HOOKS_DIR
    ]
    
    file_path = None
    for d in search_dirs:
        potential_path = os.path.join(d, filename)
        if os.path.exists(potential_path):
            file_path = potential_path
            break
            
    if not file_path:
        raise HTTPException(status_code=404, detail="File not found")
        
    return FileResponse(file_path, filename=filename)
