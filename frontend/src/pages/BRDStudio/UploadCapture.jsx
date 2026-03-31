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
  CircularProgress,
  IconButton,
  Tooltip,
  LinearProgress,
  Card,
  CardMedia,
  CardContent,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogActions,
  Divider,
  List,
  ListItem,
  ListItemText,
  Grid,
} from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import VideoFileIcon from "@mui/icons-material/VideoFile";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import RefreshIcon from "@mui/icons-material/Refresh";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import HourglassTopIcon from "@mui/icons-material/HourglassTop";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import StopCircleIcon from "@mui/icons-material/StopCircle";

export default function UploadCapture({
  projectId,
  setProjectId,
  captures,
  refreshCaptures,
  onNext,
  token,
  apiBase,
  onBusyChange,
}) {
  const [ingestionMode, setIngestionMode] = useState("video_transcript");
  const [videoFile, setVideoFile] = useState(null);
  const [transcriptFile, setTranscriptFile] = useState(null);
  const [transcriptText, setTranscriptText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const [captureProcessing, setCaptureProcessing] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const videoInputRef = useRef(null);
  const transcriptInputRef = useRef(null);
  const pollRef = useRef(null);
  const pollStopTimeoutRef = useRef(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [assetList, setAssetList] = useState({ videos: [], documents: [] });
  const [supportingFile, setSupportingFile] = useState(null);
  const supportingFileInputRef = useRef(null);
  const [assetBusyId, setAssetBusyId] = useState("");
  const [videoPreviewOpen, setVideoPreviewOpen] = useState(false);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState("");
  const [videoPreviewName, setVideoPreviewName] = useState("");

  const loadAssets = useCallback(async () => {
    if (!projectId || !token) return;
    try {
      const res = await fetch(`${apiBase}/api/brd/projects/${projectId}/assets`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAssetList({
          videos: data.videos || [],
          documents: data.documents || [],
        });
      }
    } catch (e) {
      console.error("Failed to load assets", e);
    }
  }, [projectId, token, apiBase]);


  // Poll for capture updates
  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (pollStopTimeoutRef.current) clearTimeout(pollStopTimeoutRef.current);
    pollRef.current = setInterval(async () => {
      await refreshCaptures();
      try {
        if (!projectId || !token) return;
        const statusRes = await fetch(`${apiBase}/api/brd/projects/${projectId}/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!statusRes.ok) return;
        const statusData = await statusRes.json();
        const videosProcessing = statusData?.videos?.processing ?? 0;
        if (videosProcessing === 0) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setCaptureProcessing(false);
          setProcessingStatus("Frame capture complete. AI description is on-demand in Step 2.");
        }
      } catch (e) {
        // Ignore status poll errors; capture polling will still refresh frames.
      }
    }, 3000);

    // Stop after 5 minutes
    pollStopTimeoutRef.current = setTimeout(() => {
      if (pollRef.current) clearInterval(pollRef.current);
    }, 300000);
  }, [refreshCaptures, projectId, token, apiBase]);

  const uiBusy = uploading || captureProcessing;

  // Let the parent block step navigation while processing is active.
  useEffect(() => {
    if (onBusyChange) onBusyChange(uiBusy || canceling);
  }, [uiBusy, canceling, onBusyChange]);

  // Update overlay messaging while the backend is extracting + cropping frames.
  useEffect(() => {
    if (!captureProcessing || canceling) return;
    if (String(processingStatus || "").startsWith("Error:")) return;
    if (captures.length === 0) setProcessingStatus("Extracting frames...");
    else setProcessingStatus("Cropping + queuing frames...");
  }, [captureProcessing, canceling, captures.length, processingStatus]);

  // During processing, block modal interactions by closing dialogs immediately.
  useEffect(() => {
    if (uiBusy || canceling) {
      setPreviewImage(null);
      setVideoPreviewOpen(false);
    }
  }, [uiBusy, canceling]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (pollStopTimeoutRef.current) clearTimeout(pollStopTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

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
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
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
    if (ingestionMode === "transcript_only") {
      await handleTranscriptOnly(currentId);
      return;
    }
    // video_transcript or video_only
    await handleUpload(currentId);
  };

  // Modified handleUpload to take ID directly
  const handleUpload = async (targetProjectId) => {
    const pid = targetProjectId || projectId;
    if (!pid) return;
    if ((ingestionMode === "video_transcript" || ingestionMode === "video_only") && !videoFile) return;

    setCanceling(false);
    setCaptureProcessing(false);
    setUploading(true);
    setProcessingStatus("Uploading files...");

    const formData = new FormData();
    formData.append("video", videoFile);
    if (ingestionMode !== "video_only") {
      if (transcriptFile) formData.append("transcript_file", transcriptFile);
      else if (transcriptText.trim()) formData.append("transcript", transcriptText);
    }

    try {
      const res = await fetch(`${apiBase}/api/brd/projects/${pid}/videos`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (res.ok) {
        setProcessingStatus("Upload complete. Extracting frames...");
        setCaptureProcessing(true);
        setVideoFile(null);
        setTranscriptFile(null);
        setTranscriptText("");
        startPolling();
        await loadAssets();
      } else {
        const err = await res.json();
        setProcessingStatus(`Error: ${err.detail || "Upload failed"}`);
        setCaptureProcessing(false);
      }
    } catch (err) {
      setProcessingStatus(`Error: ${err.message}`);
      setCaptureProcessing(false);
    } finally {
      setUploading(false);
    }
  };

  const handleTranscriptOnly = async (targetProjectId) => {
    const pid = targetProjectId || projectId;
    if (!pid || !transcriptText.trim()) return;
    setUploading(true);
    setProcessingStatus("Uploading transcript-only evidence...");
    try {
      const res = await fetch(`${apiBase}/api/brd/projects/${pid}/transcript-only`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: transcriptText,
          source_name: processName || projectName || "Transcript Input",
        }),
      });
      if (res.ok) {
        setTranscriptText("");
        setProcessingStatus("Transcript evidence added successfully.");
        await loadAssets();
      } else {
        const err = await res.json();
        setProcessingStatus(`Error: ${err.detail || "Transcript upload failed"}`);
      }
    } catch (err) {
      setProcessingStatus(`Error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const uploadSupportingFile = async () => {
    if (!supportingFile || !projectId) return;
    const formData = new FormData();
    formData.append("file", supportingFile);
    try {
      const res = await fetch(`${apiBase}/api/brd/projects/${projectId}/documents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) {
        setSupportingFile(null);
        await loadAssets();
      }
    } catch (e) {
      console.error("Supporting file upload failed", e);
    }
  };

  const openVideoPreview = (video) => {
    if (!video?.video_url) return;
    setVideoPreviewName(video.filename || "Video");
    setVideoPreviewUrl(`${apiBase}${video.video_url}`);
    setVideoPreviewOpen(true);
  };

  const deleteVideoAsset = async (video) => {
    if (!projectId || !video?.id) return;
    const ok = window.confirm(`Delete video "${video.filename}" and linked captures?`);
    if (!ok) return;
    setAssetBusyId(`video-${video.id}`);
    try {
      const res = await fetch(`${apiBase}/api/brd/projects/${projectId}/videos/${video.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        await loadAssets();
        await refreshCaptures();
      }
    } catch (e) {
      console.error("Failed to delete video asset", e);
    } finally {
      setAssetBusyId("");
    }
  };

  const deleteDocumentAsset = async (doc) => {
    if (!projectId || !doc?.id) return;
    const ok = window.confirm(`Delete document "${doc.filename}"?`);
    if (!ok) return;
    setAssetBusyId(`doc-${doc.id}`);
    try {
      const res = await fetch(`${apiBase}/api/brd/projects/${projectId}/documents/${doc.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        await loadAssets();
      }
    } catch (e) {
      console.error("Failed to delete document asset", e);
    } finally {
      setAssetBusyId("");
    }
  };

  const stopAndRevert = async () => {
    if (!projectId || canceling) return;
    setCanceling(true);
    setCaptureProcessing(false);
    setUploading(false);
    setProcessingStatus("Stopping and reverting changes...");

    // Prevent further polling from updating UI during revert.
    if (pollRef.current) clearInterval(pollRef.current);
    if (pollStopTimeoutRef.current) clearTimeout(pollStopTimeoutRef.current);
    pollRef.current = null;
    pollStopTimeoutRef.current = null;

    try {
      await fetch(`${apiBase}/api/brd/projects/${projectId}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (e) {
      console.error("Cancel failed", e);
    }

    try {
      await fetch(`${apiBase}/api/brd/projects/${projectId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (e) {
      console.error("Project delete failed", e);
    }

    // Reset local UI immediately; BRDStudio also clears captures/sections when projectId becomes null.
    setPreviewImage(null);
    setVideoPreviewOpen(false);
    setVideoFile(null);
    setTranscriptFile(null);
    setTranscriptText("");
    setSupportingFile(null);
    setAssetList({ videos: [], documents: [] });
    setAssetBusyId("");
    setProjectId(null);
    setProcessingStatus("");
    setCanceling(false);
  };

  return (
    <Box sx={{ height: "100%", display: "flex", overflow: "hidden", position: "relative" }}>
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

        <Box>
          <Typography variant="caption" sx={{ color: "#8fa3c0", mb: 1, display: "block" }}>
            Ingestion Mode
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button
              size="small"
              variant={ingestionMode === "video_transcript" ? "contained" : "outlined"}
              onClick={() => setIngestionMode("video_transcript")}
              sx={{ textTransform: "none" }}
            >
              Video + Transcript
            </Button>
            <Button
              size="small"
              variant={ingestionMode === "video_only" ? "contained" : "outlined"}
              onClick={() => setIngestionMode("video_only")}
              sx={{ textTransform: "none" }}
            >
              Video Only
            </Button>
            <Button
              size="small"
              variant={ingestionMode === "transcript_only" ? "contained" : "outlined"}
              onClick={() => setIngestionMode("transcript_only")}
              sx={{ textTransform: "none" }}
            >
              Transcript Only
            </Button>
          </Box>
          {ingestionMode === "video_only" && (
            <Typography variant="caption" sx={{ color: "#8fa3c0", mt: 0.8, display: "block" }}>
              Video-only mode starts capture/description immediately. You can upload transcript later for higher BRD accuracy.
            </Typography>
          )}
        </Box>

        {/* Video Selection */}
        {ingestionMode !== "transcript_only" && (
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
        )}

        {/* Transcript Area */}
        {ingestionMode !== "video_only" && (
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
        )}

        {projectId && (
          <Box>
            <Typography variant="caption" sx={{ color: "#8fa3c0", mb: 1, display: "block" }}>
              Additional BRD Supporting File (PDF/DOCX/TXT)
            </Typography>
            <input
              ref={supportingFileInputRef}
              type="file"
              accept=".docx,.pdf,.txt"
              hidden
              onChange={(e) => setSupportingFile(e.target.files?.[0] || null)}
            />
            <Button
              variant="outlined"
              fullWidth
              startIcon={<CloudUploadIcon />}
              onClick={() => supportingFileInputRef.current?.click()}
              sx={{ mb: 1, borderColor: "rgba(255,255,255,0.2)", color: "#8fa3c0" }}
            >
              {supportingFile ? supportingFile.name : "Select Supporting File"}
            </Button>
            <Button
              variant="contained"
              fullWidth
              disabled={!supportingFile || uiBusy || canceling}
              onClick={uploadSupportingFile}
              sx={{ background: "#1F3864", fontWeight: 700 }}
            >
              Add to Project Assets
            </Button>
          </Box>
        )}

        <Button
          variant="contained"
          onClick={createAndUpload}
          disabled={
            uiBusy ||
            canceling ||
            uploading ||
            (!projectId && !projectName.trim()) ||
            ((ingestionMode === "video_transcript" || ingestionMode === "video_only") && !videoFile) ||
            (ingestionMode === "transcript_only" && !transcriptText.trim())
          }
          startIcon={uploading ? <CircularProgress size={16} /> : <CloudUploadIcon />}
          sx={{
            py: 1.5,
            background: "linear-gradient(135deg, #F26522 0%, #e55a1b 100%)",
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          {uploading ? "Processing..." : ingestionMode === "transcript_only" ? "Add Transcript Evidence" : (projectId ? "Upload & Analyze" : "Create & Start Analysis")}
        </Button>

        {processingStatus && (
          <Typography variant="caption" sx={{ color: "#F26522", textAlign: "center" }}>
            {processingStatus}
          </Typography>
        )}

        {projectId && (
          <>
            <Divider sx={{ opacity: 0.2 }} />
            <Typography variant="caption" sx={{ color: "#8fa3c0", fontWeight: 700 }}>
              Project Assets
            </Typography>
            <List dense sx={{ maxHeight: 220, overflowY: "auto", bgcolor: "rgba(255,255,255,0.02)", borderRadius: 1, border: "1px solid rgba(255,255,255,0.06)" }}>
              {(assetList.videos || []).map((v) => (
                <ListItem
                  key={v.id}
                  sx={{ py: 0.4, display: "flex", alignItems: "center", gap: 0.5 }}
                  secondaryAction={
                    <Box sx={{ display: "flex", alignItems: "center" }}>
                      <Tooltip title="Play video">
                        <IconButton
                          size="small"
                          onClick={() => openVideoPreview(v)}
                          sx={{ color: "#8fa3c0" }}
                        >
                          <PlayArrowIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete video and linked captures">
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => deleteVideoAsset(v)}
                            disabled={assetBusyId === `video-${v.id}`}
                            sx={{ color: "#ef5350" }}
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Box>
                  }
                >
                  <ListItemText
                    primary={v.filename}
                    secondary={`Video · ${v.status}${v.has_transcript ? " · transcript" : ""}`}
                    primaryTypographyProps={{ fontSize: 11, color: "#e8edf5" }}
                    secondaryTypographyProps={{ fontSize: 10, color: "#8fa3c0" }}
                  />
                </ListItem>
              ))}
              {(assetList.documents || []).map((d) => (
                <ListItem
                  key={d.id}
                  sx={{ py: 0.4, display: "flex", alignItems: "center", gap: 0.5 }}
                  secondaryAction={
                    <Tooltip title="Delete document">
                      <span>
                        <IconButton
                          size="small"
                          onClick={() => deleteDocumentAsset(d)}
                          disabled={assetBusyId === `doc-${d.id}`}
                          sx={{ color: "#ef5350" }}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  }
                >
                  <ListItemText
                    primary={d.filename}
                    secondary={`Doc · ${d.has_text ? "indexed" : "uploaded"}`}
                    primaryTypographyProps={{ fontSize: 11, color: "#e8edf5" }}
                    secondaryTypographyProps={{ fontSize: 10, color: "#8fa3c0" }}
                  />
                </ListItem>
              ))}
              {((assetList.videos || []).length + (assetList.documents || []).length) === 0 && (
                <ListItem><ListItemText primary="No assets yet." primaryTypographyProps={{ fontSize: 11, color: "#8fa3c0" }} /></ListItem>
              )}
            </List>
            <Typography variant="caption" sx={{ mt: 0.8, color: "#8fa3c0", display: "block" }}>
              Videos: {(assetList.videos || []).length} • Docs: {(assetList.documents || []).length}
            </Typography>
          </>
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
                <IconButton
                  onClick={refreshCaptures}
                  size="small"
                  sx={{ color: "#8fa3c0" }}
                  disabled={uiBusy || canceling}
                >
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>

            <Grid container spacing={1.5}>
              {captures.map((cap, idx) => (
                <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={cap.id}>
                  <Card
                    onClick={() => cap.image_url && setPreviewImage(`${apiBase}${cap.image_url}`)}
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
                    <Box sx={{ position: "relative", width: "100%", pt: "62%", bgcolor: "#0a0e18" }}>
                      {cap.image_url ? (
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
                      ) : (
                        <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Typography variant="caption" sx={{ color: "#8fa3c0" }}>
                            Preview unavailable
                          </Typography>
                        </Box>
                      )}
                      {/* Index badge */}
                      <Box sx={{ position: "absolute", top: 6, left: 6, bgcolor: "#1F3864", color: "#fff", px: 0.8, py: 0.2, borderRadius: 0.8, fontSize: '9px', fontWeight: 800 }}>
                        #{idx + 1}
                      </Box>
                    </Box>
                    <CardContent sx={{ p: 0.8, "&:last-child": { pb: 0.8 } }}>
                      <Typography noWrap sx={{ color: "#dce6f7", fontWeight: 700, fontSize: 11, mb: 0.4 }}>
                        {cap.label || `Frame ${idx + 1}`}
                      </Typography>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        {statusIcon(cap.llm_status)}
                        <Typography variant="caption" noWrap sx={{ color: "#8fa3c0", fontSize: 9, flex: 1 }}>
                          {cap.llm_status === "done"
                            ? "Described"
                            : cap.llm_status === "processing"
                              ? "Describing..."
                              : cap.llm_status === "pending"
                                ? "Cropped (AI pending)"
                                : cap.llm_status}
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
              {captures.length > 0 && captureProcessing && (
                <Box sx={{ width: "100%", maxWidth: 300 }}>
                  <Typography variant="caption" sx={{ color: "#F26522", mb: 1, display: "block", textAlign: "center" }}>
                    Capturing + cropping frames...
                  </Typography>
                  <LinearProgress sx={{ borderRadius: 4, height: 6, bgcolor: "rgba(242,101,34,0.1)", "& .MuiLinearProgress-bar": { bgcolor: "#F26522" } }} />
                </Box>
              )}

              {captures.length > 0 && (
                <Button
                  variant="contained"
                  endIcon={captureProcessing ? <CircularProgress size={16} /> : <NavigateNextIcon />}
                  onClick={onNext}
                  disabled={uiBusy || canceling}
                  sx={{
                    px: 6,
                    py: 1.5,
                    background: "linear-gradient(135deg, #F26522 0%, #e55a1b 100%)",
                    fontWeight: 700,
                    fontSize: 15,
                    boxShadow: "0 8px 24px rgba(242,101,34,0.3)",
                  }}
                >
                  {captureProcessing ? "Proceed to Review (Capturing...)" : `Review & Edit (${captures.length} Frames)`}
                </Button>
              )}
            </Box>
          </>
        )}
      </Box>

      {/* Blocking overlay (single Stop & Revert) */}
      {uiBusy || canceling ? (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            zIndex: 2000,
            bgcolor: "rgba(0,0,0,0.35)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            p: 3,
            textAlign: "center",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <StopCircleIcon sx={{ color: "#ef5350" }} />
            <Typography sx={{ color: "#fff", fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 18 }}>
              Processing in progress
            </Typography>
          </Box>
          <Typography sx={{ color: "#8fa3c0", fontSize: 13, maxWidth: 520, lineHeight: 1.6 }}>
            {processingStatus ||
              (uploading ? "Uploading files..." : "Cropping + queuing frames...")}
          </Typography>
          {uiBusy && !canceling ? (
            <Button
              variant="contained"
              color="error"
              onClick={stopAndRevert}
              sx={{ px: 4, py: 1.4, borderRadius: 2, fontWeight: 900 }}
            >
              Stop & Revert
            </Button>
          ) : (
            <Typography sx={{ color: "#8fa3c0", fontSize: 12 }}>
              Reverting...
            </Typography>
          )}
        </Box>
      ) : null}

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

      <Dialog open={videoPreviewOpen} onClose={() => setVideoPreviewOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ color: "#e8edf5", bgcolor: "#112240" }}>{videoPreviewName}</DialogTitle>
        <DialogContent sx={{ p: 0, bgcolor: "#000" }}>
          {videoPreviewUrl ? (
            <video src={videoPreviewUrl} controls style={{ width: "100%", maxHeight: "72vh", display: "block" }} />
          ) : (
            <Box sx={{ p: 4, color: "#fff" }}>Video unavailable</Box>
          )}
        </DialogContent>
        <DialogActions sx={{ bgcolor: "#112240" }}>
          <Button onClick={() => setVideoPreviewOpen(false)} sx={{ color: "#8fa3c0" }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
