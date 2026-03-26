/**
 * Step 1: Upload & Capture
 * ────────────────────────
 * - Create project / upload video + transcript
 * - Intelligent frame capture (scene-detect) with streaming results
 * - Async LLM descriptions per frame
 */

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  Paper,
  Grid,
  CircularProgress,
  Chip,
  IconButton,
  Tooltip,
  LinearProgress,
  Card,
  CardMedia,
  CardContent,
  Dialog,
  DialogContent,
} from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import VideoFileIcon from "@mui/icons-material/VideoFile";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import RefreshIcon from "@mui/icons-material/Refresh";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import HourglassTopIcon from "@mui/icons-material/HourglassTop";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";

export default function UploadCapture({
  projectId,
  setProjectId,
  captures,
  refreshCaptures,
  onNext,
  token,
  apiBase,
}) {
  const [videoFile, setVideoFile] = useState(null);
  const [transcriptFile, setTranscriptFile] = useState(null);
  const [transcriptText, setTranscriptText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const videoInputRef = useRef(null);
  const transcriptInputRef = useRef(null);
  const pollRef = useRef(null);
  const [previewImage, setPreviewImage] = useState(null);

  const headers = {
    Authorization: `Bearer ${token}`,
  };


  // Poll for capture updates
  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      await refreshCaptures();
    }, 3000);

    // Stop after 5 minutes
    setTimeout(() => {
      if (pollRef.current) clearInterval(pollRef.current);
    }, 300000);
  }, [refreshCaptures]);

  // Check if all captures are done
  const allCapturesDone = captures.length > 0 && captures.every((c) => c.llm_status !== "processing" && c.llm_status !== "pending");

  // Stop polling when all captures are done (in useEffect, not during render)
  useEffect(() => {
    if (allCapturesDone && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [allCapturesDone]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const statusIcon = (status) => {
    if (status === "done") return <CheckCircleIcon sx={{ color: "#4caf50", fontSize: 16 }} />;
    if (status === "processing" || status === "pending") return <HourglassTopIcon sx={{ color: "#F26522", fontSize: 16 }} />;
    return <ErrorOutlineIcon sx={{ color: "#f44336", fontSize: 16 }} />;
  };

  // Create project logic (restored/refined)
  const [projectName, setProjectName] = useState("");
  const [clientName, setClientName] = useState("");
  const [processName, setProcessName] = useState("");

  const createAndUpload = async () => {
    let currentId = projectId;
    if (!currentId) {
      if (!projectName.trim()) return;
      try {
        const res = await fetch(`${apiBase}/api/brd/projects`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ name: projectName, client_name: clientName, process_name: processName }),
        });
        if (res.ok) {
          const data = await res.json();
          currentId = data.id;
          setProjectId(currentId);
        } else return;
      } catch (err) {
        console.error("Project creation failed", err);
        return;
      }
    }
    // Now upload
    handleUpload(currentId);
  };

  // Modified handleUpload to take ID directly
  const handleUpload = async (targetProjectId) => {
    const pid = targetProjectId || projectId;
    if (!videoFile || !pid) return;

    setUploading(true);
    setProcessingStatus("Uploading files...");

    const formData = new FormData();
    formData.append("video", videoFile);
    if (transcriptFile) formData.append("transcript_file", transcriptFile);
    else if (transcriptText.trim()) formData.append("transcript", transcriptText);

    try {
      const res = await fetch(`${apiBase}/api/brd/projects/${pid}/videos`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (res.ok) {
        setProcessingStatus("Upload complete. Generating descriptions...");
        setVideoFile(null);
        setTranscriptFile(null);
        setTranscriptText("");
        startPolling();
      } else {
        const err = await res.json();
        setProcessingStatus(`Error: ${err.detail || "Upload failed"}`);
      }
    } catch (err) {
      setProcessingStatus(`Error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Box sx={{ height: "100%", display: "flex", overflow: "hidden" }}>
      {/* Left: Setup & Upload */}
      <Box
        sx={{
          width: 420,
          flexShrink: 0,
          borderRight: "1px solid rgba(255,255,255,0.06)",
          overflowY: "auto",
          p: 3,
          display: "flex",
          flexDirection: "column",
          gap: 2.5,
        }}
      >
        <Typography variant="h6" sx={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, color: "#e8edf5" }}>
          {projectId ? "Add Video Call" : "New BRD Project"}
        </Typography>

        {!projectId && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField label="Project Name" value={projectName} onChange={(e) => setProjectName(e.target.value)} fullWidth size="small" required />
            <TextField label="Client Name" value={clientName} onChange={(e) => setClientName(e.target.value)} fullWidth size="small" />
            <TextField label="Process Name" value={processName} onChange={(e) => setProcessName(e.target.value)} fullWidth size="small" />
          </Box>
        )}

        {/* Video Selection */}
        <Box>
          <Typography variant="caption" sx={{ color: "#8fa3c0", mb: 1, display: "block" }}>Select Video Walkthrough</Typography>
          <input ref={videoInputRef} type="file" accept="video/*" hidden onChange={(e) => setVideoFile(e.target.files[0])} />
          <Button
            variant="outlined"
            fullWidth
            startIcon={<VideoFileIcon />}
            onClick={() => videoInputRef.current?.click()}
            sx={{ py: 1.5, borderColor: videoFile ? "#4caf50" : "rgba(242,101,34,0.4)", color: videoFile ? "#4caf50" : "#F26522" }}
          >
            {videoFile ? videoFile.name : "Choose Video"}
          </Button>
        </Box>

        {/* Transcript Area */}
        <Box>
          <Typography variant="caption" sx={{ color: "#8fa3c0", mb: 1, display: "block" }}>Transcript (Paste or Upload File)</Typography>
          <TextField
            multiline
            rows={4}
            fullWidth
            size="small"
            placeholder="Paste transcript here..."
            value={transcriptText}
            onChange={(e) => setTranscriptText(e.target.value)}
            disabled={!!transcriptFile}
            sx={{ mb: 1.5 }}
          />
          <input ref={transcriptInputRef} type="file" accept=".docx,.pdf,.txt" hidden onChange={(e) => setTranscriptFile(e.target.files[0])} />
          <Button
            variant="text"
            size="small"
            startIcon={<CloudUploadIcon />}
            onClick={() => transcriptInputRef.current?.click()}
            sx={{ color: transcriptFile ? "#4caf50" : "#8fa3c0", fontSize: 11 }}
          >
            {transcriptFile ? `File: ${transcriptFile.name}` : "Or upload DOCX/PDF/TXT"}
          </Button>
          {transcriptFile && (
            <Button size="small" color="error" onClick={() => setTranscriptFile(null)} sx={{ fontSize: 9 }}>Remove</Button>
          )}
        </Box>

        <Button
          variant="contained"
          onClick={createAndUpload}
          disabled={uploading || !videoFile || (!projectId && !projectName.trim())}
          startIcon={uploading ? <CircularProgress size={16} /> : <CloudUploadIcon />}
          sx={{
            py: 1.5,
            background: "linear-gradient(135deg, #F26522 0%, #e55a1b 100%)",
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          {uploading ? "Processing..." : projectId ? "Upload & Analyze" : "Create & Start Analysis"}
        </Button>

        {processingStatus && (
          <Typography variant="caption" sx={{ color: "#F26522", textAlign: "center" }}>
            {processingStatus}
          </Typography>
        )}
      </Box>

      {/* Center: Frame Gallery */}
      <Box sx={{ flex: 1, overflowY: "auto", p: 3 }}>
        {captures.length === 0 ? (
          <Box
            sx={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <CloudUploadIcon sx={{ fontSize: 64, color: "rgba(242,101,34,0.2)" }} />
            <Typography sx={{ color: "#8fa3c0", fontSize: 14 }}>
              Upload a video to begin intelligent frame capture
            </Typography>
          </Box>
        ) : (
          <>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
              <Typography variant="subtitle1" sx={{ color: "#e8edf5", fontWeight: 600 }}>
                Captured Frames ({captures.length})
              </Typography>
              <Tooltip title="Refresh captures">
                <IconButton onClick={refreshCaptures} size="small" sx={{ color: "#8fa3c0" }}>
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>

            <Grid container spacing={1.5}>
              {captures.map((cap, idx) => (
                <Grid item xs={6} sm={4} md={3} key={cap.id}>
                  <Card
                    onClick={() => setPreviewImage(`${apiBase}${cap.image_url}`)}
                    sx={{
                      bgcolor: "rgba(17,34,64,0.4)",
                      border: "1px solid rgba(255,255,255,0.05)",
                      borderRadius: 1.5,
                      overflow: "hidden",
                      cursor: "pointer",
                      transition: "all 0.2s",
                      "&:hover": { borderColor: "rgba(242,101,34,0.4)", transform: "translateY(-2px)", boxShadow: "0 4px 16px rgba(242,101,34,0.15)" },
                    }}
                  >
                    <Box sx={{ position: "relative", width: "100%", pt: "56.25%", bgcolor: "#0a0e18" }}>
                      {cap.image_url && (
                        <CardMedia
                          component="img"
                          image={`${apiBase}${cap.image_url}`}
                          alt={cap.label}
                          sx={{ 
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            height: "100%",
                            objectFit: "contain" 
                          }}
                        />
                      )}
                      {/* Index badge */}
                      <Box sx={{ position: "absolute", top: 6, left: 6, bgcolor: "#1F3864", color: "#fff", px: 0.8, py: 0.2, borderRadius: 0.8, fontSize: '9px', fontWeight: 800 }}>
                        #{idx + 1}
                      </Box>
                    </Box>
                    <CardContent sx={{ p: 0.8, "&:last-child": { pb: 0.8 } }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        {statusIcon(cap.llm_status)}
                        <Typography variant="caption" noWrap sx={{ color: "#8fa3c0", fontSize: 9, flex: 1 }}>
                          {cap.llm_status === "done" ? "Described" : cap.llm_status === "processing" ? "Analyzing..." : cap.llm_status}
                        </Typography>
                        {cap.timestamp > 0 && (
                          <Typography variant="caption" sx={{ color: "#556", fontSize: 8 }}>
                            {Math.round(cap.timestamp)}s
                          </Typography>
                        )}
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>

            {/* Progress & Bottom Action */}
            <Box sx={{ mt: 4, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              {captures.length > 0 && !allCapturesDone && (
                <Box sx={{ width: "100%", maxWidth: 300 }}>
                  <Typography variant="caption" sx={{ color: "#F26522", mb: 1, display: "block", textAlign: "center" }}>
                    Analyzing frames...
                  </Typography>
                  <LinearProgress sx={{ borderRadius: 4, height: 6, bgcolor: "rgba(242,101,34,0.1)", "& .MuiLinearProgress-bar": { bgcolor: "#F26522" } }} />
                </Box>
              )}

              {captures.length > 0 && (
                <Button
                  variant="contained"
                  endIcon={!allCapturesDone ? <CircularProgress size={16} /> : <NavigateNextIcon />}
                  onClick={onNext}
                  sx={{
                    px: 6,
                    py: 1.5,
                    background: "linear-gradient(135deg, #F26522 0%, #e55a1b 100%)",
                    fontWeight: 700,
                    fontSize: 15,
                    boxShadow: "0 8px 24px rgba(242,101,34,0.3)",
                  }}
                >
                  {allCapturesDone ? `Review & Edit (${captures.length} Frames)` : "Proceed to Review (Analyzing...)"}
                </Button>
              )}
            </Box>
          </>
        )}
      </Box>

      {/* Lightbox Preview */}
      <Dialog
        open={!!previewImage}
        onClose={() => setPreviewImage(null)}
        maxWidth="lg"
        PaperProps={{ sx: { bgcolor: "transparent", boxShadow: "none", overflow: "hidden" } }}
      >
        <DialogContent sx={{ p: 0, position: "relative" }}>
          {previewImage && (
            <img
              src={previewImage}
              alt="Preview"
              style={{ width: "100%", height: "auto", display: "block", borderRadius: 8 }}
            />
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
