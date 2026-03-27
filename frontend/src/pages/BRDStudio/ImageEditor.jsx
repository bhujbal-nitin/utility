/**
 * ImageEditor — Crop & Annotate component
 * ────────────────────────────────────────
 * Uses react-image-crop for cropping + canvas overlay for annotations.
 * Saves crop region and preview image back to backend.
 */

import React, { useState, useRef, useCallback, useEffect } from "react";
import ReactCrop from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import {
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton,
  Slider,
  Typography,
  CircularProgress,
} from "@mui/material";
import CropIcon from "@mui/icons-material/Crop";
import BrushIcon from "@mui/icons-material/Brush";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import RectangleOutlinedIcon from "@mui/icons-material/RectangleOutlined";
import UndoIcon from "@mui/icons-material/Undo";
import SaveIcon from "@mui/icons-material/Save";
import RestartAltIcon from "@mui/icons-material/RestartAlt";

export default function ImageEditor({ open, onClose, imageSrc, captureId, apiBase, token, onSaved }) {
  const [crop, setCrop] = useState(null);
  const [completedCrop, setCompletedCrop] = useState(null);
  const [mode, setMode] = useState("crop"); // crop | draw | text | rect
  const [brushColor, setBrushColor] = useState("#F26522");
  const [brushSize, setBrushSize] = useState(3);
  const [annotations, setAnnotations] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState([]);
  const [saving, setSaving] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);
  const imgRef = useRef(null);
  const canvasRef = useRef(null);

  // Draw annotations on canvas overlay
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgRef.current) return;

    const img = imgRef.current;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.style.width = `${img.width}px`;
    canvas.style.height = `${img.height}px`;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Scale factor
    const sx = img.naturalWidth / img.width;
    const sy = img.naturalHeight / img.height;

    annotations.forEach((ann) => {
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = ann.size * sx;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (ann.type === "path" && ann.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(ann.points[0].x * sx, ann.points[0].y * sy);
        for (let i = 1; i < ann.points.length; i++) {
          ctx.lineTo(ann.points[i].x * sx, ann.points[i].y * sy);
        }
        ctx.stroke();
      } else if (ann.type === "rect") {
        ctx.strokeRect(
          ann.x * sx, ann.y * sy,
          ann.w * sx, ann.h * sy
        );
      } else if (ann.type === "text") {
        ctx.font = `${16 * sx}px Calibri`;
        ctx.fillStyle = ann.color;
        ctx.fillText(ann.text, ann.x * sx, ann.y * sy);
      }
    });

    // Draw current path while drawing
    if (isDrawing && currentPath.length > 1) {
      ctx.strokeStyle = brushColor;
      ctx.lineWidth = brushSize * sx;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(currentPath[0].x * sx, currentPath[0].y * sy);
      for (let i = 1; i < currentPath.length; i++) {
        ctx.lineTo(currentPath[i].x * sx, currentPath[i].y * sy);
      }
      ctx.stroke();
    }
  }, [annotations, isDrawing, currentPath, brushColor, brushSize]);

  const getMousePos = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleMouseDown = (e) => {
    if (mode === "crop") return;
    const pos = getMousePos(e);
    setIsDrawing(true);

    if (mode === "draw") {
      setCurrentPath([pos]);
    } else if (mode === "rect") {
      setCurrentPath([pos]);
    } else if (mode === "text") {
      const text = prompt("Enter annotation text:");
      if (text) {
        setAnnotations((prev) => [...prev, { type: "text", x: pos.x, y: pos.y, color: brushColor, text }]);
      }
      setIsDrawing(false);
    }
  };

  const handleMouseMove = (e) => {
    if (!isDrawing || mode === "crop") return;
    const pos = getMousePos(e);
    setCurrentPath((prev) => [...prev, pos]);
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (mode === "draw" && currentPath.length > 1) {
      setAnnotations((prev) => [
        ...prev,
        { type: "path", points: currentPath, color: brushColor, size: brushSize },
      ]);
    } else if (mode === "rect" && currentPath.length >= 2) {
      const start = currentPath[0];
      const end = currentPath[currentPath.length - 1];
      setAnnotations((prev) => [
        ...prev,
        {
          type: "rect",
          x: Math.min(start.x, end.x),
          y: Math.min(start.y, end.y),
          w: Math.abs(end.x - start.x),
          h: Math.abs(end.y - start.y),
          color: brushColor,
          size: brushSize,
        },
      ]);
    }
    setCurrentPath([]);
  };

  const undo = () => setAnnotations((prev) => prev.slice(0, -1));
  const reset = () => {
    setAnnotations([]);
    setCrop(null);
    setCompletedCrop(null);
  };

  // Save: compose preview image with annotations + crop baked in
  const handleSave = async () => {
    setSaving(true);
    try {
      const img = imgRef.current;
      if (!img) {
        console.error("Image editor: source image not available.");
        return;
      }
      const canvas = document.createElement("canvas");

      let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;

      // Apply crop
      if (completedCrop) {
        const scaleX = img.naturalWidth / img.width;
        const scaleY = img.naturalHeight / img.height;
        sx = completedCrop.x * scaleX;
        sy = completedCrop.y * scaleY;
        sw = completedCrop.width * scaleX;
        sh = completedCrop.height * scaleY;
      }

      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d");

      // Draw cropped image
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

      // Draw annotations (adjusted for crop offset)
      const annCanvas = canvasRef.current;
      if (annCanvas) {
        ctx.drawImage(annCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
      }

      // Convert to blob
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) {
        console.error("Failed to create image blob from canvas");
        return;
      }

      // Upload preview
      const formData = new FormData();
      formData.append("preview", blob, "preview.png");
      if (completedCrop) {
        formData.append("crop_region", JSON.stringify({
          x: sx, y: sy, width: sw, height: sh,
        }));
      }

      const res = await fetch(`${apiBase}/api/brd/captures/${captureId}/preview`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (res.ok) {
        onSaved?.();
        onClose();
      } else {
        console.error("Save preview failed with status:", res.status);
      }
    } catch (err) {
      console.error("Save preview failed:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: "#0a1628",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 3,
          height: "85vh",
        },
      }}
    >
      <DialogTitle
        sx={{
          color: "#e8edf5",
          fontFamily: "'Syne', sans-serif",
          display: "flex",
          alignItems: "center",
          gap: 2,
        }}
      >
        Edit Image
        <Box sx={{ flex: 1 }} />

        {/* Tool Selector */}
        <ToggleButtonGroup
          value={mode}
          exclusive
          onChange={(e, val) => val && setMode(val)}
          size="small"
        >
          <ToggleButton value="crop" sx={{ color: "#8fa3c0", "&.Mui-selected": { color: "#F26522", bgcolor: "rgba(242,101,34,0.1)" } }}>
            <Tooltip title="Crop"><CropIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="draw" sx={{ color: "#8fa3c0", "&.Mui-selected": { color: "#F26522", bgcolor: "rgba(242,101,34,0.1)" } }}>
            <Tooltip title="Draw"><BrushIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="rect" sx={{ color: "#8fa3c0", "&.Mui-selected": { color: "#F26522", bgcolor: "rgba(242,101,34,0.1)" } }}>
            <Tooltip title="Rectangle"><RectangleOutlinedIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="text" sx={{ color: "#8fa3c0", "&.Mui-selected": { color: "#F26522", bgcolor: "rgba(242,101,34,0.1)" } }}>
            <Tooltip title="Text"><TextFieldsIcon fontSize="small" /></Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>

        {/* Brush controls */}
        {(mode === "draw" || mode === "rect") && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, ml: 2 }}>
            <input
              type="color"
              value={brushColor}
              onChange={(e) => setBrushColor(e.target.value)}
              style={{ width: 28, height: 28, border: "none", cursor: "pointer", borderRadius: 4 }}
            />
            <Slider
              value={brushSize}
              onChange={(e, val) => setBrushSize(val)}
              min={1}
              max={10}
              sx={{ width: 80, color: "#F26522" }}
              size="small"
            />
          </Box>
        )}

        <Tooltip title="Undo">
          <IconButton onClick={undo} size="small" sx={{ color: "#8fa3c0" }}>
            <UndoIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Reset All">
          <IconButton onClick={reset} size="small" sx={{ color: "#8fa3c0" }}>
            <RestartAltIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </DialogTitle>

      <DialogContent sx={{ display: "flex", justifyContent: "center", alignItems: "center", position: "relative", overflow: "auto" }}>
        {imageLoadError && (
          <Box sx={{ position: "absolute", top: 16, left: 16, right: 16, zIndex: 2 }}>
            <Typography sx={{ color: "#ef5350", fontSize: 12 }}>
              Failed to load image for editing. Please refresh captures and retry.
            </Typography>
          </Box>
        )}
        <Box sx={{ position: "relative", display: "inline-block" }}>
          {mode === "crop" ? (
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setCompletedCrop(c)}
            >
              <img
                ref={imgRef}
                src={imageSrc}
                alt="Edit"
                style={{ maxWidth: "100%", maxHeight: "70vh" }}
                crossOrigin="anonymous"
                onLoad={() => setImageLoadError(false)}
                onError={() => setImageLoadError(true)}
              />
            </ReactCrop>
          ) : (
            <>
              <img
                ref={imgRef}
                src={imageSrc}
                alt="Edit"
                style={{ maxWidth: "100%", maxHeight: "70vh", display: "block" }}
                crossOrigin="anonymous"
                onLoad={() => setImageLoadError(false)}
                onError={() => setImageLoadError(true)}
              />
              <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  cursor: mode === "text" ? "text" : "crosshair",
                }}
              />
            </>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ color: "#8fa3c0" }}>Cancel</Button>
        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
          onClick={handleSave}
          disabled={saving || imageLoadError}
          sx={{ background: "linear-gradient(135deg, #F26522 0%, #e55a1b 100%)" }}
        >
          Save Preview
        </Button>
      </DialogActions>
    </Dialog>
  );
}
