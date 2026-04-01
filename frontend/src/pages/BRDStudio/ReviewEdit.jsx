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
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import DescriptionIcon from "@mui/icons-material/Description";
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
              <Typography variant="caption" sx={{ color: "text.secondary" }}>Preview unavailable</Typography>
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

        <CardContent sx={{ p: 1.5, bgcolor: "background.paper", "&:last-child": { pb: 1.5 } }}>
          <Typography noWrap sx={{ color: "text.primary", fontWeight: 700, fontSize: 12, mb: 0.6 }}>
            {cap.label || `Frame ${idx + 1}`}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 1 }}>
            <Typography
              variant="caption"
              sx={{
                color:
                  cap.llm_status === "done"
                    ? "success.main"
                    : cap.llm_status === "processing"
                      ? "var(--ae-orange)"
                      : "text.secondary",
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
                  borderColor: "var(--ae-border-active)",
                  color: "var(--ae-orange)",
                  fontSize: "10px",
                  fontWeight: 800,
                  textTransform: "none",
                }}
              >
                {isDescribing || cap.llm_status === "processing" ? <CircularProgress size={12} /> : "Generate"}
              </Button>

              {/* Single Edit Button handles both image and metadata now */}
            </Box>
          </Box>
          
          <Typography 
            variant="body2" 
            sx={{ 
              color: "text.secondary", 
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
              sx={{ "& .MuiFormControlLabel-label": { fontSize: '10px', fontWeight: 600, color: cap.is_kept ? "var(--ae-orange)" : "text.secondary" } }}
            />
            
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button
                variant="contained"
                size="small"
                startIcon={<EditIcon sx={{ fontSize: 14 }} />}
                onClick={() => onEdit(cap)}
                disabled={!imageUrl}
                sx={{ 
                  bgcolor: "var(--ae-surface)", 
                  color: "var(--ae-orange)", 
                  fontSize: '10px', 
                  fontWeight: 800,
                  boxShadow: 'none',
                  '&:hover': { bgcolor: "rgba(242,101,34,0.2)", boxShadow: 'none' }
                }}
              >
                Edit
              </Button>
              <Tooltip title="Delete Frame">
                <IconButton 
                  size="small" 
                  onClick={() => onDelete(cap.id)} 
                  sx={{ color: "#ef4444", p: 0.5, border: '1px solid rgba(239,68,68,0.2)', borderRadius: 1.5 }}
                >
                  <DeleteIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
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
  sections = [],
  refreshSections,
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

  // Generation Logic
  const [genDialogOpen, setGenDialogOpen] = useState(false);
  const [genInstructions, setGenInstructions] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const hasDoc = sections && sections.length > 0;

  const authHeaders = { Authorization: `Bearer ${token}` };
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // Strictly sort captures by timestamp for sequential display and generation
  const sortedCaptures = useMemo(() => {
    return [...(captures || [])].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  }, [captures]);

  useEffect(() => {
    capturesRef.current = sortedCaptures;
  }, [sortedCaptures]);

  // Ordered IDs for sortable
  const captureIds = useMemo(() => sortedCaptures.map((c) => c.id), [sortedCaptures]);

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
      const current = (capturesRef.current || []).find((c) => c.id === capId);
      if (current && (current.llm_status === "done" || current.llm_status === "error")) return;
    }
  };

  const generateDescriptionForCapture = async (capId) => {
    if (!capId || !projectId) return;
    const currently = (capturesRef.current || []).find((c) => c.id === capId);
    if (!currently || !currently.image_url) return;
    if (currently.llm_status === "processing") return;

    setDescribingCaptureIds((prev) => ({ ...prev, [capId]: true }));
    try {
      const res = await fetch(`${apiBase}/api/brd/captures/${capId}/describe`, {
        method: "POST",
        headers: authHeaders,
      });
      if (!res.ok) throw new Error("Failed to start description");
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

  const [batchDescrLoading, setBatchDescrLoading] = useState(false);
  const generateAllDescriptions = async () => {
    if (!projectId || batchDescrLoading) return;
    setBatchDescrLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/brd/projects/${projectId}/captures/describe-all`, {
        method: "POST",
        headers: authHeaders,
      });
      if (!res.ok) throw new Error("Batch description failed");
      
      // Poll until all kept captures are done/error
      let attempts = 45; // ~1.5 mins
      while (attempts > 0) {
        await refreshCaptures();
        const pending = (capturesRef.current || []).filter(c => c.is_kept && (c.llm_status === "pending" || c.llm_status === "processing")).length;
        if (pending === 0) break;
        await new Promise(r => setTimeout(r, 2500));
        attempts--;
      }
    } catch (err) {
      console.error("Batch generate failed:", err);
    } finally {
      setBatchDescrLoading(false);
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

  // Handle Generation
  const triggerGenerate = async () => {
    setIsGenerating(true);
    setGenDialogOpen(false);
    try {
      const endpoint = hasDoc ? "regenerate" : "generate";
      // Construct payload mimicking DocumentEditor's logic
      const payload = hasDoc 
        ? { sections: null, instruction: genInstructions } // Regenerate all with context
        : { mode: "default", instruction: genInstructions };

      const res = await fetch(`${apiBase}/api/brd/projects/${projectId}/${endpoint}`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Generation failed to start");

      // Poll for status
      const poll = setInterval(async () => {
        const sRes = await fetch(`${apiBase}/api/brd/projects/${projectId}/status`, { headers: authHeaders });
        if (sRes.ok) {
          const s = await sRes.json();
          if (s.status !== "generating") {
            clearInterval(poll);
            await refreshSections?.();
            setIsGenerating(false);
            onNext(); // Auto-proceed once done
          }
        }
      }, 3000);
    } catch (err) {
      console.error("BRD Generation failed", err);
      setIsGenerating(false);
    }
  };

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", bgcolor: "background.default", color: "text.primary" }}>
      {/* Toolbar */}
      <Box
        sx={{
          px: 3, py: 1.5,
          display: "flex", alignItems: "center", gap: 2,
          borderBottom: "1px solid var(--ae-border)",
          flexShrink: 0,
        }}
      >
        <Button startIcon={<ArrowBackIcon />} onClick={onBack} size="small" sx={{ color: "text.secondary" }}>
          Back
        </Button>
        <Typography variant="subtitle1" sx={{ color: "text.primary !important", fontWeight: 700, flex: 1 }}>
          Review Frames — {keptCount} kept / {captures.length} total
        </Typography>

        <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleCustomUpload} />
        <Button
          startIcon={uploading ? <CircularProgress size={16} /> : <AddPhotoAlternateIcon />}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          size="small"
          variant="outlined"
          sx={{ borderColor: "var(--ae-orange)", color: "var(--ae-orange)" }}
        >
          Add Screenshot
        </Button>

        <Button
          startIcon={<VideocamIcon />}
          onClick={openVideoDialog}
          size="small"
          variant="outlined"
          sx={{ borderColor: "var(--ae-border)", color: "text.primary", bgcolor: "var(--ae-surface)" }}
        >
          Capture From Video
        </Button>

        {keptCount > 0 && keptMissingDescCount > 0 && (
          <Button
            variant="contained"
            color="success"
            onClick={generateAllDescriptions}
            disabled={batchDescrLoading || isGenerating}
            size="small"
            sx={{ fontWeight: 600, bgcolor: "success.main", "&:hover": { bgcolor: "success.dark" } }}
            startIcon={batchDescrLoading ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {batchDescrLoading ? `Generating (${keptMissingDescCount})...` : "Generate All Descriptions"}
          </Button>
        )}

        <Button
          variant="contained"
          endIcon={isGenerating ? <CircularProgress size={16} color="inherit" /> : hasDoc ? <NavigateNextIcon /> : <AutoFixHighIcon />}
          onClick={hasDoc ? onNext : () => setGenDialogOpen(true)}
          disabled={keptCount === 0 || keptMissingDescCount > 0 || isGenerating}
          title={
            keptMissingDescCount > 0
              ? `Generate AI descriptions for ${keptMissingDescCount} kept frame(s) first.`
              : undefined
          }
          size="small"
          sx={{ 
            background: hasDoc 
              ? "linear-gradient(135deg, #1F3864 0%, #172a4d 100%)" 
              : "linear-gradient(135deg, #F26522 0%, #e55a1b 100%)", 
            fontWeight: 700,
            textTransform: 'none',
            px: 3
          }}
        >
          {isGenerating 
             ? "Generating BRD..." 
             : hasDoc 
                ? "Proceed to Document Editor" 
                : "Generate BRD"}
        </Button>

        {hasDoc && (
          <Button
            variant="outlined"
            onClick={() => setGenDialogOpen(true)}
            disabled={isGenerating || keptMissingDescCount > 0}
            size="small"
            startIcon={<DescriptionIcon />}
            sx={{ borderColor: "rgba(242,101,34,0.4)", color: "#F26522", fontWeight: 600 }}
          >
            Regenerate BRD
          </Button>
        )}
      </Box>

      {/* Frame Grid with DnD */}
      <Box sx={{ flex: 1, overflowY: "auto", p: 3 }}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={captureIds} strategy={rectSortingStrategy}>
            <Grid container spacing={2}>
              {sortedCaptures.map((cap, idx) => (
                <SortableFrame
                  key={cap.id}
                  cap={cap}
                  idx={idx}
                  apiBase={apiBase}
                  onEdit={(c) => setImageEditorCap(c)}
                  onToggleKeep={handleToggleKeep}
                  onDelete={handleDeleteCapture}
                  onCrop={(c) => setImageEditorCap(c)}
                  onPreview={(url) => setImageEditorCap(sortedCaptures.find(c => `${apiBase}${c.image_url}` === url))}
                  onGenerateDescription={generateDescriptionForCapture}
                  isDescribing={!!describingCaptureIds[cap.id]}
                />
              ))}
            </Grid>
          </SortableContext>
        </DndContext>
      </Box>

      {/* Universal Editor (Preview + Edit + Annotate) */}
      {imageEditorCap && (
        <ImageEditor
          open={!!imageEditorCap}
          onClose={() => setImageEditorCap(null)}
          capture={imageEditorCap}
          allCaptures={sortedCaptures}
          onSwitchCapture={(newCap) => setImageEditorCap(newCap)}
          apiBase={apiBase}
          token={token}
          onSaved={() => {
            setImageEditorCap(null);
            refreshCaptures();
          }}
        />
      )}

      {/* Lightbox Preview removed in favor of Universal Editor */}

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

      {/* BRD Generation Prompt Dialog */}
      <Dialog open={genDialogOpen} onClose={() => !isGenerating && setGenDialogOpen(false)} maxWidth="sm" fullWidth
         PaperProps={{ sx: { bgcolor: "background.paper", border: '1px solid var(--ae-border)', borderRadius: 3 } }}>
        <DialogTitle sx={{ color: "text.primary", display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
           <AutoFixHighIcon sx={{ color: '#F26522' }} />
           {hasDoc ? "Regenerate BRD Document" : "Generate BRD Document"}
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
           <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
              Add high-level instructions for the AI (e.g. tone, detail level, or specific focus).
           </Typography>
           
           <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
              <Button 
                variant="outlined" size="small" 
                onClick={() => setGenInstructions(prev => (prev ? prev + " " : "") + "Elaborate the process steps and descriptions in extensive detail.")}
                sx={{ fontSize: '10px', color: 'text.secondary', borderColor: 'var(--ae-border)' }}
              >
                Elaborate
              </Button>
              <Button 
                variant="outlined" size="small" 
                onClick={() => setGenInstructions(prev => (prev ? prev + " " : "") + "Keep the BRD content very concise and professional.")}
                sx={{ fontSize: '10px', color: 'text.secondary', borderColor: 'var(--ae-border)' }}
              >
                Shorten
              </Button>
           </Box>

           <TextField
             fullWidth
             multiline rows={5}
             placeholder="e.g. Focus on technical validations and detailed application details..."
             value={genInstructions}
             onChange={(e) => setGenInstructions(e.target.value)}
             sx={{ 
               '& .MuiInputBase-root': { color: '#fff', bgcolor: 'rgba(255,255,255,0.03)' },
               '& .MuiInputLabel-root': { color: '#8fa3c0' }
             }}
           />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
           <Button onClick={() => setGenDialogOpen(false)} disabled={isGenerating} sx={{ color: "#8fa3c0" }}>Cancel</Button>
           <Button 
             variant="contained" 
             onClick={triggerGenerate} 
             disabled={isGenerating}
             sx={{ 
               background: "linear-gradient(135deg, #F26522 0%, #e55a1b 100%)",
               fontWeight: 700,
               px: 4
             }}
           >
              {isGenerating ? "Processing..." : hasDoc ? "Start Regeneration" : "Generate BRD Now"}
           </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
