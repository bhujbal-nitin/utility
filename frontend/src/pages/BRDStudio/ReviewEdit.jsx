/**
 * Step 2: Review & Edit (with Drag-and-Drop + Image Editor)
 * ──────────────────────────────────────────────────────────
 * - Sortable frame gallery with @dnd-kit
 * - Image editor (crop, annotate) via ImageEditor component
 * - Keep/skip toggles, inline description editing
 * - Custom capture upload with LLM processing gate
 */

import React, { useState, useRef, useMemo, useCallback } from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  Grid,
  Card,
  CardMedia,
  CardContent,
  IconButton,
  Tooltip,
  Switch,
  FormControlLabel,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Divider,
} from "@mui/material";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import AddPhotoAlternateIcon from "@mui/icons-material/AddPhotoAlternate";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import SaveIcon from "@mui/icons-material/Save";
import CropIcon from "@mui/icons-material/Crop";
import ImageEditor from "./ImageEditor";

function SortableFrame({ cap, idx, onCrop, onEdit, onDelete, onToggleKeep, onPreview, apiBase }) {
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
    <Grid item xs={6} sm={4} md={3} ref={setNodeRef} style={style}>
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
        <Box sx={{ position: "relative", width: "100%", pt: "56.25%", bgcolor: "#f0f2f5", cursor: "pointer" }} onClick={() => onPreview(imageUrl)}>
          {imageUrl && (
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
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 1 }}>
             <Typography variant="caption" sx={{ color: "#4caf50", fontWeight: 700, fontSize: '10px' }}>
               ✓ Described
             </Typography>
             <IconButton size="small" onClick={() => onEdit(cap)} sx={{ ml: "auto", color: "#8fa3c0", p: 0.3 }}>
                <EditIcon sx={{ fontSize: 14 }} />
             </IconButton>
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
            {cap.description || "No description. Click edit to add."}
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
              <Tooltip title="Crop/Annotate"><IconButton size="small" onClick={() => onCrop(cap)} sx={{ color: "#F26522", p: 0.4 }}><CropIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
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
  const fileInputRef = useRef(null);

  const headers = { Authorization: `Bearer ${token}` };
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

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
        headers: { ...headers, "Content-Type": "application/json" },
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
        headers: { ...headers, "Content-Type": "application/json" },
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
      await fetch(`${apiBase}/api/brd/captures/${capId}`, { method: "DELETE", headers });
      await refreshCaptures();
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  // Drag-and-drop reorder
  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = captures.findIndex((c) => c.id === active.id);
    const newIndex = captures.findIndex((c) => c.id === over.id);
    const reordered = arrayMove(captures, oldIndex, newIndex);

    // Update order on backend
    try {
      await Promise.all(
        reordered.map((cap, idx) =>
          fetch(`${apiBase}/api/brd/captures/${cap.id}`, {
            method: "PUT",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ order: idx + 1 }),
          })
        )
      );
      await refreshCaptures();
    } catch (err) {
      console.error("Reorder failed:", err);
    }
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

  const keptCount = captures.filter((c) => c.is_kept).length;

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
          variant="contained"
          endIcon={<NavigateNextIcon />}
          onClick={onNext}
          disabled={keptCount === 0}
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
    </Box>
  );
}
