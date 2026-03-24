"""
app.py — GEMS Automation Pipeline (conversational)
"""
import os, json, queue, threading, tempfile, uuid
from flask import Flask, render_template, request, Response, send_from_directory, jsonify, redirect

import settings as cfg
import pipeline
import parser as prs
import deployer
import history as hist
from extractor import extract_text

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 32 * 1024 * 1024

DOWNLOADS_DIR = os.path.join(os.path.dirname(__file__), "downloads")
os.makedirs(DOWNLOADS_DIR, exist_ok=True)


# ─── Installer ────────────────────────────────────────────────────────────────

@app.route("/install", methods=["GET", "POST"])
def install():
    if request.method == "POST":
        cfg.save({k: v.strip() for k, v in request.form.items()})
        return redirect("/")
    return render_template("install.html")

@app.route("/settings", methods=["GET", "POST"])
def settings_page():
    if request.method == "POST":
        cfg.save({k: v.strip() for k, v in request.form.items()})
        return redirect("/settings?saved=1")
    return render_template("install.html",
                           current=cfg.load(),
                           saved=request.args.get("saved") == "1",
                           is_settings=True)

@app.route("/")
def index():
    if not cfg.is_configured():
        return redirect("/install")
    return render_template("index.html")


# ─── Download ──────────────────────────────────────────────────────────────────

@app.route("/download/<filename>")
def download(filename):
    return send_from_directory(DOWNLOADS_DIR, filename, as_attachment=True)


# ─── History API ──────────────────────────────────────────────────────────────

@app.route("/api/history")
def api_history():
    return jsonify(hist.get_all())

@app.route("/api/history/<session_id>")
def api_history_session(session_id):
    s = hist.get_session(session_id)
    if not s:
        return jsonify({"error": "Not found"}), 404
    return jsonify(s)


# ─── Start session ────────────────────────────────────────────────────────────

@app.route("/api/start", methods=["POST"])
def api_start():
    """Create a new Vertex AI session and history entry."""
    body         = request.get_json(force=True)
    usecase_name = body.get("usecase_name", "").strip().replace(" ", "_")
    if not usecase_name:
        return jsonify({"error": "usecase_name is required"}), 400

    try:
        session_id = pipeline.create_session()
        hist.create_session(session_id, usecase_name)
        return jsonify({"session_id": session_id, "usecase_name": usecase_name})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── Chat endpoint (SSE stream) ───────────────────────────────────────────────

@app.route("/api/chat", methods=["POST"])
def api_chat():
    """
    Accepts: { session_id, usecase_name, message, is_first, attachment_text? }
    Streams SSE events:
      { type: "token",    text }          — partial response (future streaming)
      { type: "progress", message }       — status updates
      { type: "artifact", artifact_info } — a file was saved/zipped
      { type: "done",     full_text }     — complete response text
      { type: "error",    message }
    """
    body         = request.get_json(force=True)
    session_id   = body.get("session_id", "")
    usecase_name = body.get("usecase_name", "chatbot").replace(" ", "_")
    user_msg     = body.get("message", "").strip()
    is_first     = body.get("is_first", False)
    attachment   = body.get("attachment_text", "")   # extracted doc text

    if not session_id or not user_msg:
        return jsonify({"error": "session_id and message required"}), 400

    full_user_msg = f"{user_msg}\n\n{attachment}" if attachment else user_msg

    q: queue.Queue = queue.Queue()

    def run():
        try:
            def log(m): q.put({"type": "progress", "message": m})

            # Save user message to history
            hist.append_message(session_id, "user", user_msg)

            # Send to LLM
            result  = pipeline.send_message(session_id, full_user_msg,
                                            is_first=is_first, log=log)
            llm_text = result["text"]
            tokens   = result["tokens"]

            # Save tokens and assistant message
            hist.add_tokens(session_id, tokens)
            hist.append_message(session_id, "assistant", llm_text)

            # Detect and deploy artifacts
            # If LLM is asking for more info → no artifacts are deployed,
            # response is flagged as "asking" so the UI can style it differently
            is_asking = prs.is_asking_for_info(llm_text)
            artifacts = [] if is_asking else prs.detect_artifacts(llm_text)

            for art in artifacts:
                try:
                    info = deployer.deploy_artifact(art, usecase_name, DOWNLOADS_DIR)
                    hist.add_file(session_id, info["filename"],
                                  info["kind"], info["destination"])
                    q.put({"type": "artifact", "info": info})
                except Exception as ae:
                    q.put({"type": "progress",
                           "message": f"⚠️ Could not save {art['filename']}: {ae}"})

            q.put({
                "type":       "done",
                "text":       llm_text,
                "tokens":     tokens,
                "is_asking":  is_asking,   # tells UI to show "awaiting your answer" indicator
            })

        except Exception as exc:
            q.put({"type": "error", "message": str(exc)})

    threading.Thread(target=run, daemon=True).start()

    def stream():
        while True:
            msg = q.get()
            yield f"data: {json.dumps(msg, ensure_ascii=False)}\n\n"
            if msg["type"] in ("done", "error"):
                break

    return Response(stream(), mimetype="text/event-stream")


# ─── Upload document → extract text ──────────────────────────────────────────

@app.route("/api/upload", methods=["POST"])
def api_upload():
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "No file"}), 400
    suffix = os.path.splitext(file.filename)[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        file.save(tmp.name)
        tmp_path = tmp.name
    try:
        text = extract_text(tmp_path)
        return jsonify({"text": text, "filename": file.filename})
    except Exception as e:
        return jsonify({"error": str(e)}), 400
    finally:
        os.unlink(tmp_path)


if __name__ == "__main__":
    app.run(debug=False, port=5050, threaded=True)
