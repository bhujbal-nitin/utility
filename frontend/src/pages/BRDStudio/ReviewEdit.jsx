/**
 * Step 2: Review & Edit (with Drag-and-Drop + Image Editor)
 * ──────────────────────────────────────────────────────────
 * - Sortable frame gallery with @dnd-kit
 * - Image editor (crop, annotate) via ImageEditor component
 * - Keep/skip toggles, inline description editing
 * - Custom capture upload with LLM processing gate
 */

import React, { useState, useRef, useMemo, useCallback, useEffect } from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  Card,
  CardMedia,
  CardContent,
  IconButton,
  Tooltip,
  Switch,
  FormControlLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Divider,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Alert,
  Grid,
} from "@mui/material";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import AddPhotoAlternateIcon from "@mui/icons-material/AddPhotoAlternate";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import SaveIcon from "@mui/icons-material/Save";
import CropIcon from "@mui/icons-material/Crop";
import VideocamIcon from "@mui/icons-material/Videocam";
import ImageEditor from "./ImageEditor";

function SortableFrame({
  cap,
  idx,
  onCrop,
  onEdit,
  onDelete,
  onToggleKeep,
  onPreview,
  apiBase,
  onGenerateDescription,
  isDescribing,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cap.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 1,
    opacity: isDragging ? 0.5 : 1,
  };

  const imageUrl = cap.image_url ? `${apiBase}${cap.image_url}` : null;

  return (
    <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} ref={setNodeRef} style={style}>
      <Card
        sx={{
          bgcolor: "#fff",
          border: "1px solid #e0e6ed",
          borderRadius: 2.5,
          overflow: "hidden",
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          boxShadow: cap.is_kept ? "0 8px 24px rgba(242,101,34,0.12)" : "0 2px 8px rgba(0,0,0,0.05)",
          opacity: cap.is_kept ? 1 : 0.7,
          "&:hover": { 
            borderColor: "#F26522", 
            boxShadow: "0 12px 32px rgba(242,101,34,0.2)",
            transform: "translateY(-4px)",
            opacity: 1,
          },
        }}
      >
        <Box sx={{ position: "relative", width: "100%", pt: "58%", bgcolor: "#0b1322", cursor: imageUrl ? "pointer" : "default" }} onClick={() => imageUrl && onPreview(imageUrl)}>
          {imageUrl ? (
            <CardMedia
              component="img"
              image={imageUrl}
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
              <Typography variant="caption" sx={{ color: "#8fa3c0" }}>Preview unavailable</Typography>
            </Box>
          )}

          {/* Drag Handle — top-left corner only */}
          <Box 
            {...attributes} 
            {...listeners} 
            sx={{ 
              position: "absolute", 
              top: 6, left: 6,
              bgcolor: "#1F3864",
              color: "#fff",
              px: 1, py: 0.4,
              borderRadius: 1,
              fontSize: '10px',
              fontWeight: 800,
              zIndex: 3,
              cursor: "grab",
              display: "flex",
              alignItems: "center",
              gap: 0.3,
            }} 
          >
            <DragIndicatorIcon sx={{ fontSize: 12 }} />
            {cap.timestamp ? `${Math.round(cap.timestamp)}s` : `#${idx+1}`}
          </Box>

          {cap.is_kept && (
            <Box sx={{ position: "absolute", top: 6, right: 6, bgcolor: "#F26522", color: "#fff", px: 1.2, py: 0.5, borderRadius: 1.5, fontSize: '10px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 0.5, zIndex: 3, boxShadow: "0 4px 12px rgba(242,101,34,0.3)" }}>
              Keep
            </Box>
          )}
        </Box>

        <CardContent sx={{ p: 1.5, bgcolor: "#fff", "&:last-child": { pb: 1.5 } }}>
          <Typography noWrap sx={{ color: "#0f172a", fontWeight: 700, fontSize: 12, mb: 0.6 }}>
            {cap.label || `Frame ${idx + 1}`}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 1 }}>
            <Typography
              variant="caption"
              sx={{
                color:
                  cap.llm_status === "done"
                    ? "#4caf50"
                    : cap.llm_status === "processing"
                      ? "#F26522"
                      : cap.llm_status === "pending"
                        ? "#64748b"
                        : "#ef4444",
                fontWeight: 800,
                fontSize: "10px",
              }}
            >
              {cap.llm_status === "done"
                ? "✓ Described"
                : cap.llm_status === "processing"
                  ? "Describing..."
                  : cap.llm_status === "pending"
                    ? "AI pending"
                    : cap.llm_status || "AI pending"}
            </Typography>

            <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 0.6 }}>
              <Button
                size="small"
                variant="outlined"
                onClick={() => onGenerateDescription?.(cap.id)}
                disabled={!cap.image_url || isDescribing || cap.llm_status === "processing"}
                sx={{
                  px: 0.9,
                  py: 0.2,
                  borderColor: "rgba(242,101,34,0.6)",
                  color: "#F26522",
                  fontSize: "10px",
                  fontWeight: 800,
                  textTransform: "none",
                }}
              >
                {isDescribing || cap.llm_status === "processing" ? <CircularProgress size={12} /> : "Generate"}
              </Button>

              <IconButton size="small" onClick={() => onEdit(cap)} sx={{ color: "#8fa3c0", p: 0.3 }} disabled={!cap.image_url}>
                <EditIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Box>
          </Box>
          
          <Typography 
            variant="body2" 
            sx={{ 
              color: "#475569", 
              fontSize: '11px', 
              lineHeight: 1.5,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              mb: 1
            }}
          >
            {cap.description
              ? cap.description
              : cap.llm_status === "pending"
                ? "No AI description yet. Click Generate for this image."
                : "No description. Click Edit to add."}
          </Typography>

          <Divider sx={{ my: 1, opacity: 0.4 }} />

          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <FormControlLabel
              control={
                <Switch
                  checked={cap.is_kept}
                  onChange={() => onToggleKeep(cap)}
                  size="small"
                  sx={{
                    "& .MuiSwitch-switchBase.Mui-checked": { color: "#F26522" },
                    "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": { backgroundColor: "#F26522" },
                  }}
                />
              }
              label={cap.is_kept ? "Kept" : "Skip"}
              sx={{ "& .MuiFormControlLabel-label": { fontSize: '10px', fontWeight: 600, color: cap.is_kept ? "#F26522" : "#94a3b8" } }}
            />
            
            <Box sx={{ display: "flex", gap: 0.3 }}>
              <Tooltip title={imageUrl ? "Crop/Annotate" : "Image unavailable"}>
                <span>
                  <IconButton size="small" onClick={() => onCrop(cap)} disabled={!imageUrl} sx={{ color: "#F26522", p: 0.4 }}>
                    <CropIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Delete"><IconButton size="small" onClick={() => onDelete(cap.id)} sx={{ color: "#ef4444", p: 0.4 }}><DeleteIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Grid>
  );
}

export default function ReviewEdit({
  projectId,
  captures,
  refreshCaptures,
  onNext,
  onBack,
  token,
  apiBase,
}) {
  const [editingCapture, setEditingCapture] = useState(null);
  const [editDescription, setEditDescription] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editOcr, setEditOcr] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imageEditorCap, setImageEditorCap] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [projectVideos, setProjectVideos] = useState([]);
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [selectedVideoUrl, setSelectedVideoUrl] = useState("");
  const [captureAtTime, setCaptureAtTime] = useState(0);
  const [captureConfirmOpen, setCaptureConfirmOpen] = useState(false);
  const [capturedFrameBlob, setCapturedFrameBlob] = useState(null);
  const [capturedFramePreview, setCapturedFramePreview] = useState("");
  const [captureError, setCaptureError] = useState("");
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const capturesRef = useRef(captures);
  const [describingCaptureIds, setDescribingCaptureIds] = useState({});

  const authHeaders = { Authorization: `Bearer ${token}` };
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => {
    capturesRef.current = captures;
  }, [captures]);

  // Ordered IDs for sortable
  const captureIds = useMemo(() => captures.map((c) => c.id), [captures]);

  // Open edit dialog
  const openEdit = (cap) => {
    setEditingCapture(cap);
    setEditDescription(cap.description || "");
    setEditLabel(cap.label || "");
    setEditOcr(cap.ocr_text || "");
  };

  // Save edits
  const saveEdit = async () => {
    if (!editingCapture) return;
    setSaving(true);
    try {
      await fetch(`${apiBase}/api/brd/captures/${editingCapture.id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ description: editDescription, label: editLabel, ocr_text: editOcr }),
      });
      await refreshCaptures();
      setEditingCapture(null);
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  // Toggle keep/skip
  const handleToggleKeep = async (cap) => {
    try {
      await fetch(`${apiBase}/api/brd/captures/${cap.id}`, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ is_kept: !cap.is_kept }),
      });
      await refreshCaptures();
    } catch (err) {
      console.error("Toggle failed:", err);
    }
  };

  // Delete capture
  const handleDeleteCapture = async (capId) => {
    try {
      await fetch(`${apiBase}/api/brd/captures/${capId}`, { method: "DELETE", headers: authHeaders });
      await refreshCaptures();
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  // Drag-and-drop reorder
  const handleDragEnd = async (event) => {
    // Timestamp ordering is canonical; drag is disabled for sequence integrity.
    const { active, over } = event;
    if (!over || active.id === over.id) return;
  };

  // Custom upload
  const handleCustomUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);

    const formData = new FormData();
    formData.append("image", file);
    formData.append("label", "Custom Screenshot");

    try {
      await fetch(`${apiBase}/api/brd/projects/${projectId}/captures`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      await refreshCaptures();
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
    }
  };

  const refreshAndWaitForCapture = async (capId, attempts = 30, intervalMs = 2000) => {
    for (let i = 0; i < attempts; i += 1) {
      await refreshCaptures();
      await new Promise((r) => setTimeout(r, intervalMs));
      const current = capturesRef.current.find((c) => c.id === capId);
      if (current && (current.llm_status === "done" || current.llm_status === "error")) return;
    }
  };

  const generateDescriptionForCapture = async (capId) => {
    if (!capId || !projectId) return;
    const currently = capturesRef.current.find((c) => c.id === capId);
    if (!currently || !currently.image_url) return;
    if (currently.llm_status === "processing") return;

    if (describingCaptureIds[capId]) return;
    setDescribingCaptureIds((prev) => ({ ...prev, [capId]: true }));

    try {
      const res = await fetch(`${apiBase}/api/brd/captures/${capId}/describe`, {
        method: "POST",
        headers: authHeaders,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to start description");
      }

      // Live polling until this capture is done/error.
      await refreshAndWaitForCapture(capId);
    } catch (err) {
      console.error("Generate description failed:", err);
    } finally {
      setDescribingCaptureIds((prev) => {
        const next = { ...prev };
        delete next[capId];
        return next;
      });
    }
  };

  const keptCount = captures.filter((c) => c.is_kept).length;
  const keptMissingDescCount = captures.filter((c) => c.is_kept && c.llm_status !== "done").length;

  useEffect(() => {
    return () => {
      if (capturedFramePreview) URL.revokeObjectURL(capturedFramePreview);
    };
  }, [capturedFramePreview]);

  const loadProjectVideos = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`${apiBase}/api/brd/projects/${projectId}/assets`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const videos = data?.videos || [];
        setProjectVideos(videos);
        if (videos.length > 0 && !selectedVideoId) {
          setSelectedVideoId(videos[0].id);
          setSelectedVideoUrl(videos[0].video_url ? `${apiBase}${videos[0].video_url}` : "");
        }
      }
    } catch (err) {
      console.error("Failed to load project videos:", err);
    }
  }, [projectId, apiBase, selectedVideoId, token]);

  const openVideoDialog = async () => {
    setVideoDialogOpen(true);
    setCaptureError("");
    await loadProjectVideos();
  };

  const handleVideoSelection = (videoId) => {
    setSelectedVideoId(videoId);
    const vid = projectVideos.find((v) => v.id === videoId);
    setSelectedVideoUrl(vid?.video_url ? `${apiBase}${vid.video_url}` : "");
  };

  const captureCurrentFrame = async () => {
    const v = videoRef.current;
    if (!v || !selectedVideoId) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = v.videoWidth || 1280;
      canvas.height = v.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.97));
      if (!blob) return;
      if (capturedFramePreview) URL.revokeObjectURL(capturedFramePreview);
      const previewUrl = URL.createObjectURL(blob);
      setCapturedFrameBlob(blob);
      setCapturedFramePreview(previewUrl);
      setCaptureAtTime(v.currentTime || 0);
      setCaptureConfirmOpen(true);
    } catch (e) {
      console.error("Frame capture failed", e);
      setCaptureError("Failed to capture frame from video.");
    }
  };

  const confirmCapturedFrame = async () => {
    if (!capturedFrameBlob || !selectedVideoId) return;
    try {
      const formData = new FormData();
      formData.append("image", capturedFrameBlob, `manual_capture_${Date.now()}.jpg`);
      formData.append("label", `Manual Capture @ ${Math.round(captureAtTime)}s`);
      formData.append("timestamp", String(captureAtTime));
      formData.append("video_id", selectedVideoId);
      const res = await fetch(`${apiBase}/api/brd/projects/${projectId}/captures`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        throw new Error("Upload failed");
      }
      setCaptureConfirmOpen(false);
      await refreshCaptures();
    } catch (e) {
      console.error("Manual capture upload failed", e);
      setCaptureError("Failed to add captured frame. Please retry.");
    }
  };

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Toolbar */}
      <Box
        sx={{
          px: 3, py: 1.5,
          display: "flex", alignItems: "center", gap: 2,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
        }}
      >
        <Button startIcon={<ArrowBackIcon />} onClick={onBack} size="small" sx={{ color: "#8fa3c0" }}>
          Back
        </Button>
        <Typography variant="subtitle1" sx={{ color: "#e8edf5", fontWeight: 600, flex: 1 }}>
          Review Frames — {keptCount} kept / {captures.length} total
        </Typography>

        <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleCustomUpload} />
        <Button
          startIcon={uploading ? <CircularProgress size={16} /> : <AddPhotoAlternateIcon />}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          size="small"
          variant="outlined"
          sx={{ borderColor: "rgba(242,101,34,0.5)", color: "#F26522" }}
        >
          Add Screenshot
        </Button>

        <Button
          startIcon={<VideocamIcon />}
          onClick={openVideoDialog}
          size="small"
          variant="outlined"
          sx={{ borderColor: "rgba(31,56,100,0.45)", color: "#1F3864", bgcolor: "#fff" }}
        >
          Capture From Video
        </Button>

        <Button
          variant="contained"
          endIcon={<NavigateNextIcon />}
          onClick={onNext}
          disabled={keptCount === 0 || keptMissingDescCount > 0}
          title={
            keptMissingDescCount > 0
              ? `Generate AI descriptions for ${keptMissingDescCount} kept frame(s) first.`
              : undefined
          }
          size="small"
          sx={{ background: "linear-gradient(135deg, #F26522 0%, #e55a1b 100%)", fontWeight: 600 }}
        >
          Proceed to Document Editor
        </Button>
      </Box>

      {/* Frame Grid with DnD */}
      <Box sx={{ flex: 1, overflowY: "auto", p: 3 }}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={captureIds} strategy={rectSortingStrategy}>
            <Grid container spacing={2}>
              {captures.map((cap, idx) => (
                <SortableFrame
                  key={cap.id}
                  cap={cap}
                  idx={idx}
                  apiBase={apiBase}
                  onEdit={openEdit}
                  onToggleKeep={handleToggleKeep}
                  onDelete={handleDeleteCapture}
                  onCrop={(c) => setImageEditorCap(c)}
                  onPreview={setPreviewImage}
                  onGenerateDescription={generateDescriptionForCapture}
                  isDescribing={!!describingCaptureIds[cap.id]}
                />
              ))}
            </Grid>
          </SortableContext>
        </DndContext>
      </Box>

      {/* Edit Dialog */}
      <Dialog
        open={!!editingCapture}
        onClose={() => setEditingCapture(null)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { bgcolor: "#112240", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 3 } }}
      >
        <DialogTitle sx={{ color: "#e8edf5", fontFamily: "'Syne', sans-serif" }}>
          Edit Frame Details
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", gap: 3, mt: 1 }}>
            {editingCapture?.image_url && (
              <Box sx={{ flex: "0 0 280px" }}>
                <img
                  src={`${apiBase}${editingCapture.image_url}`}
                  alt="Preview"
                  style={{ width: "100%", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)" }}
                />
              </Box>
            )}
            <Box sx={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
              <TextField label="Label" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} fullWidth size="small" />
              <TextField label="Description" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} multiline rows={4} fullWidth size="small" />
              <TextField label="OCR Text" value={editOcr} onChange={(e) => setEditOcr(e.target.value)} multiline rows={4} fullWidth size="small" placeholder="Visible text on screen..." />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditingCapture(null)} sx={{ color: "#8fa3c0" }}>Cancel</Button>
          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
            onClick={saveEdit}
            disabled={saving}
            sx={{ background: "linear-gradient(135deg, #F26522 0%, #e55a1b 100%)" }}
          >
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Image Editor (Crop & Annotate) */}
      {imageEditorCap && (
        <ImageEditor
          open={!!imageEditorCap}
          onClose={() => setImageEditorCap(null)}
          imageSrc={`${apiBase}${imageEditorCap.image_url}`}
          captureId={imageEditorCap.id}
          apiBase={apiBase}
          token={token}
          onSaved={() => {
            setImageEditorCap(null);
            refreshCaptures();
          }}
        />
      )}

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

      {/* Popup Video Player for Manual Capture */}
      <Dialog open={videoDialogOpen} onClose={() => setVideoDialogOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>Capture Additional Frame From Uploaded Video</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {captureError && <Alert severity="error" sx={{ mb: 2 }}>{captureError}</Alert>}
          <Box sx={{ display: "flex", gap: 2, alignItems: "center", mb: 2 }}>
            <FormControl size="small" sx={{ minWidth: 320 }}>
              <InputLabel id="video-select-label">Select Video Asset</InputLabel>
              <Select
                labelId="video-select-label"
                value={selectedVideoId}
                label="Select Video Asset"
                onChange={(e) => handleVideoSelection(e.target.value)}
              >
                {projectVideos.map((v) => (
                  <MenuItem key={v.id} value={v.id}>
                    {v.filename} ({v.status})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Move to desired timestamp and click Capture Current Frame.
            </Typography>
          </Box>
          <Box sx={{ bgcolor: "#000", borderRadius: 1, overflow: "hidden" }}>
            {selectedVideoUrl ? (
              <video
                ref={videoRef}
                src={selectedVideoUrl}
                controls
                style={{ width: "100%", maxHeight: "62vh", display: "block" }}
                onTimeUpdate={(e) => setCaptureAtTime(e.currentTarget.currentTime || 0)}
              />
            ) : (
              <Box sx={{ p: 4, textAlign: "center", color: "#fff" }}>No video selected.</Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVideoDialogOpen(false)}>Close</Button>
          <Button variant="contained" onClick={captureCurrentFrame} disabled={!selectedVideoUrl}>
            Capture Current Frame
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Captured Frame */}
      <Dialog open={captureConfirmOpen} onClose={() => setCaptureConfirmOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Captured Frame?</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 1.5 }}>
            Timestamp: <strong>{Math.round(captureAtTime)}s</strong>. This frame will be added (cropped/sanitized). AI description will be generated only when you click <strong>Generate</strong> on the image.
          </Typography>
          {capturedFramePreview && (
            <img src={capturedFramePreview} alt="Captured preview" style={{ width: "100%", borderRadius: 8 }} />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCaptureConfirmOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={confirmCapturedFrame}>Yes, Add Frame</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
