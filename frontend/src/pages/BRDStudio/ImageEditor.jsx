/**
 * Full-Service Universal Frame Editor (V4 - Side-Arrow Navigation)
 * ──────────────────────────────────────────────────────────────
 * - Large floating Side-Arrow navigation (Prev/Next)
 * - Professional Zoom & Pan (Touchpad Pinch support, Scroll zoom)
 * - Intelligent Native Scrollbars (no excessive black space)
 * - Precise Annotation Engine (Live preview, Undo/Clear)
 * - Full Metadata Integration (Label, Description, OCR)
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
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
  TextField,
  Divider,
} from "@mui/material";
import BrushIcon from "@mui/icons-material/Brush";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import RectangleOutlinedIcon from "@mui/icons-material/RectangleOutlined";
import UndoIcon from "@mui/icons-material/Undo";
import SaveIcon from "@mui/icons-material/Save";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import PanToolIcon from "@mui/icons-material/PanTool";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

export default function UniversalImageEditor({
  open,
  capture,
  allCaptures,
  onSwitchCapture,
  onClose,
  apiBase,
  token,
  onSaved,
}) {
  const [mode, setMode] = useState("pan"); 
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });

  // Drawing state
  const [annotations, setAnnotations] = useState([]); 
  const [activeAnn, setActiveAnn] = useState(null); 
  const [brushColor, setBrushColor] = useState("#F26522");
  const [brushSize, setBrushSize] = useState(4);

  // Metadata
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [ocr, setOcr] = useState("");

  const [saving, setSaving] = useState(false);
  const imgRef = useRef(null);
  const canvasRef = useRef(null);
  const viewerRef = useRef(null);

  const currentIndex = allCaptures?.findIndex(c => c.id === capture?.id) ?? -1;
  const hasPrev = currentIndex > 0;
  const hasNext = allCaptures && currentIndex < allCaptures.length - 1;

  useEffect(() => {
    if (capture) {
      setLabel(capture.label || "");
      setDescription(capture.description || "");
      setOcr(capture.ocr_text || "");
      setAnnotations([]);
      setZoom(1);
      if(viewerRef.current){ viewerRef.current.scrollLeft = 0; viewerRef.current.scrollTop = 0; }
    }
  }, [capture]);

  // Main Canvas Rendering
  const drawRepo = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const allAnns = [...annotations, ...(activeAnn ? [activeAnn] : [])];
    allAnns.forEach((ann) => {
      ctx.strokeStyle = ann.color;
      ctx.fillStyle = ann.color;
      ctx.lineWidth = ann.size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (ann.type === "path") {
        ctx.beginPath();
        if (ann.points?.length > 0) {
          ctx.moveTo(ann.points[0].x, ann.points[0].y);
          ann.points.forEach(p => ctx.lineTo(p.x, p.y));
        }
        ctx.stroke();
      } else if (ann.type === "rect") {
        if (ann === activeAnn) ctx.setLineDash([5, 5]);
        ctx.strokeRect(ann.x, ann.y, ann.w, ann.h);
        ctx.setLineDash([]);
      } else if (ann.type === "text") {
        ctx.font = `bold ${24 * (ann.size / 4)}px 'Inter', sans-serif`;
        ctx.fillText(ann.text, ann.x, ann.y);
      }
    });
  }, [annotations, activeAnn]);

  useEffect(() => { drawRepo(); }, [drawRepo]);

  const toImageCoord = (clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const handleWheel = (e) => {
    if (mode === "pan" && e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.95 : 1.05;
        setZoom(z => Math.min(Math.max(z * delta, 0.25), 4));
    }
  };

  const handleDoubleClick = (e) => { if (mode === "pan") setZoom(prev => (prev > 1.2 ? 1 : 2.5)); };

  const handleMouseDown = (e) => {
    if (mode === "pan") { setIsDragging(true); setLastPos({ x: e.clientX, y: e.clientY }); return; }
    const pos = toImageCoord(e.clientX, e.clientY);
    setIsDragging(true);
    if (mode === "draw") { setActiveAnn({ type: "path", points: [pos], color: brushColor, size: brushSize }); } 
    else if (mode === "rect") { setActiveAnn({ type: "rect", x: pos.x, y: pos.y, w: 0, h: 0, color: brushColor, size: brushSize }); } 
    else if (mode === "text") { 
      const txt = prompt("Annotation Text:");
      if (txt) setAnnotations(prev => [...prev, { type: "text", x: pos.x, y: pos.y, text: txt, color: brushColor, size: brushSize }]);
      setIsDragging(false);
    }
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    if (mode === "pan") {
      const v = viewerRef.current;
      if (v) { v.scrollLeft -= (e.clientX - lastPos.x); v.scrollTop -= (e.clientY - lastPos.y); }
      setLastPos({ x: e.clientX, y: e.clientY });
      return;
    }
    const pos = toImageCoord(e.clientX, e.clientY);
    if (mode === "draw" && activeAnn) { setActiveAnn(prev => ({ ...prev, points: [...prev.points, pos] })); } 
    else if (mode === "rect" && activeAnn) { setActiveAnn(prev => ({ ...prev, w: pos.x - prev.x, h: pos.y - prev.y })); }
  };

  const handleMouseUp = () => { setIsDragging(false); if (activeAnn) { setAnnotations(prev => [...prev, activeAnn]); setActiveAnn(null); } };

  const handleSave = async () => {
    setSaving(true);
    try {
      const img = imgRef.current; if (!img) return;
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d"); ctx.drawImage(img, 0, 0);
      if (canvasRef.current) ctx.drawImage(canvasRef.current, 0, 0);
      const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
      if (blob) {
        const formData = new FormData();
        formData.append("preview", blob, "preview.png");
        await fetch(`${apiBase}/api/brd/captures/${capture.id}/preview`, { 
          method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData 
        });
      }
      await fetch(`${apiBase}/api/brd/captures/${capture.id}`, {
        method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ label, description, ocr_text: ocr }),
      });
      onSaved?.(); onClose();
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };



  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth 
      PaperProps={{ sx: { bgcolor: "#050a14", borderRadius: 4, height: "95vh", display: "flex", flexDirection: "column", m: 1, overflow: "hidden" } }}>
      
      <style>
        {`
          .custom-scrollbar::-webkit-scrollbar { width: 14px; height: 14px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: #050a14; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 6px; border: 3px solid #050a14; }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #F26522; }
        `}
      </style>

      {/* TOOLBAR */}
      <DialogTitle sx={{ bgcolor: "#0f172a", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: 2, py: 1.2 }}>
        <Typography sx={{ color: "#e8edf5", fontWeight: 800, fontSize: "0.8rem", letterSpacing: "0.1em" }}>UNIVERSAL EDITOR</Typography>
        <Divider orientation="vertical" flexItem sx={{ opacity: 0.1 }} />
        
        <ToggleButtonGroup value={mode} exclusive onChange={(e, val) => val && setMode(val)} size="small" sx={{ bgcolor: "rgba(255,255,255,0.02)", borderRadius: 2 }}>
          <ToggleButton value="pan" sx={{ color: "#8fa3c0", border: 'none', "&.Mui-selected": { color: "#F26522", bgcolor: "rgba(242,101,34,0.08)" } }}><Tooltip title="Hand (Pan)"><PanToolIcon fontSize="small" /></Tooltip></ToggleButton>
          <ToggleButton value="draw" sx={{ color: "#8fa3c0", border: 'none', "&.Mui-selected": { color: "#F26522", bgcolor: "rgba(242,101,34,0.08)" } }}><Tooltip title="Brush"><BrushIcon fontSize="small" /></Tooltip></ToggleButton>
          <ToggleButton value="rect" sx={{ color: "#8fa3c0", border: 'none', "&.Mui-selected": { color: "#F26522", bgcolor: "rgba(242,101,34,0.08)" } }}><Tooltip title="Rectangle"><RectangleOutlinedIcon fontSize="small" /></Tooltip></ToggleButton>
          <ToggleButton value="text" sx={{ color: "#8fa3c0", border: 'none', "&.Mui-selected": { color: "#F26522", bgcolor: "rgba(242,101,34,0.08)" } }}><Tooltip title="Text"><TextFieldsIcon fontSize="small" /></Tooltip></ToggleButton>
        </ToggleButtonGroup>

        {(mode === "draw" || mode === "rect") && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, ml: 1 }}>
            <input type="color" value={brushColor} onChange={e => setBrushColor(e.target.value)} style={{ width: 22, height: 22, border: "none", cursor: "pointer", borderRadius: 4, background: 'none' }} />
            <Slider value={brushSize} onChange={(e, v) => setBrushSize(v)} min={1} max={25} sx={{ width: 60, color: "#F26522" }} size="small" />
          </Box>
        )}

        <Box sx={{ flex: 1 }} />
        
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, bgcolor: "rgba(255,255,255,0.02)", px: 1.5, py: 0.5, borderRadius: 2 }}>
          <IconButton size="small" onClick={() => setZoom(z => Math.min(z + 0.25, 4))} sx={{ color: "#8fa3c0" }}><ZoomInIcon fontSize="small" /></IconButton>
          <Typography sx={{ color: "#fff", fontSize: '12px', fontWeight: 700, width: 45, textAlign: 'center' }}>{Math.round(zoom * 100)}%</Typography>
          <IconButton size="small" onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))} sx={{ color: "#8fa3c0" }}><ZoomOutIcon fontSize="small" /></IconButton>
          <Tooltip title="Reset View"><IconButton size="small" onClick={() => { setZoom(1); if(viewerRef.current){ viewerRef.current.scrollLeft = 0; viewerRef.current.scrollTop = 0; } }} sx={{ color: "#F26522" }}><RestartAltIcon fontSize="small" /></IconButton></Tooltip>
        </Box>

        <Divider orientation="vertical" flexItem sx={{ opacity: 0.1, mx: 1 }} />
        <IconButton onClick={() => setAnnotations(a => a.slice(0, -1))} size="small" sx={{ color: "#8fa3c0" }}><UndoIcon fontSize="small" /></IconButton>
        <IconButton onClick={() => window.confirm("Reset all drawings?") && setAnnotations([])} size="small" sx={{ color: "#ef4444" }}><DeleteOutlineIcon fontSize="small" /></IconButton>
      </DialogTitle>

      <Box sx={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* SIDEBAR */}
        <Box sx={{ width: 320, bgcolor: "rgba(15,23,42,0.6)", borderRight: "1px solid rgba(255,255,255,0.05)", p: 3, display: "flex", flexDirection: "column", gap: 3, overflowY: "auto" }} className="custom-scrollbar">
          <Typography sx={{ color: "#8fa3c0", fontSize: '11px', fontWeight: 900, mb: -1 }}>PROPERTIES</Typography>
          <TextField label="Label" value={label} onChange={e => setLabel(e.target.value)} fullWidth size="small" />
          <TextField label="Description" value={description} onChange={e => setDescription(e.target.value)} multiline rows={12} fullWidth size="small" />
          <TextField label="Detected Text" value={ocr} onChange={e => setOcr(e.target.value)} multiline rows={8} fullWidth size="small" sx={{ "& .MuiInputBase-root": { fontSize: '0.8rem' } }} />
          
          <Box sx={{ mt: 'auto', textAlign: 'center', opacity: 0.5 }}>
             <Typography variant="caption" sx={{ color: '#8fa3c0' }}>Frame {currentIndex + 1} of {allCaptures?.length}</Typography>
          </Box>
        </Box>

        {/* WORKSPACE with Floating side arrows */}
        <Box sx={{ flex: 1, position: "relative", bgcolor: "#020617", display: "flex", overflow: "hidden" }}>
          
          {/* Previous Arrow */}
          <Box sx={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 60, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
            {hasPrev && (
              <IconButton 
                onClick={() => onSwitchCapture(allCaptures[currentIndex - 1])}
                sx={{ bgcolor: "rgba(15,23,42,0.6)", color: "#fff", '&:hover': { bgcolor: "rgba(242,101,34,0.8)" } }}
              >
                <ChevronLeftIcon fontSize="large" />
              </IconButton>
            )}
          </Box>

          <Box 
            ref={viewerRef}
            onWheel={handleWheel}
            onDoubleClick={handleDoubleClick}
            className="custom-scrollbar"
            sx={{ flex: 1, overflow: "auto", position: "relative", display: 'grid', placeItems: zoom > 0.8 ? 'start' : 'center', p: zoom > 0.8 ? 0 : 4 }}
          >
            <Box
              onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
              sx={{
                position: "relative",
                width: imgRef.current ? `${(imgRef.current.naturalWidth * 0.8) * zoom}px` : 'auto',
                minWidth: '100%', minHeight: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: isDragging ? 'none' : 'width 0.2s ease-out',
              }}
            >
              <Box sx={{ position: 'relative', transform: `scale(${zoom})`, transformOrigin: 'center center' }}>
                <img 
                  ref={imgRef} 
                  src={`${apiBase.replace(/\/$/, '')}${capture?.image_url}`} 
                  alt="Capture" 
                  crossOrigin="anonymous"
                  onLoad={() => drawRepo()}
                  style={{ display: "block", width: "100%", maxWidth: "1100px", height: "auto", pointerEvents: "none", userSelect: 'none', boxShadow: '0 0 60px rgba(0,0,0,0.9)' }}
                />
                <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: mode === 'pan' ? 'none' : 'auto' }} />
              </Box>
            </Box>
          </Box>

          {/* Next Arrow */}
          <Box sx={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 60, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
            {hasNext && (
              <IconButton 
                onClick={() => onSwitchCapture(allCaptures[currentIndex + 1])}
                sx={{ bgcolor: "rgba(15,23,42,0.6)", color: "#fff", '&:hover': { bgcolor: "rgba(242,101,34,0.8)" } }}
              >
                <ChevronRightIcon fontSize="large" />
              </IconButton>
            )}
          </Box>
        </Box>
      </Box>

      {/* FOOTER */}
      <DialogActions sx={{ px: 4, py: 2, bgcolor: "#0f172a", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <Typography variant="caption" sx={{ color: '#8fa3c0', mr: 'auto', fontWeight: 700 }}>ZOOM: {Math.round(zoom * 100)}% • PINCH TO ZOOM • SPACE/HAND TO PAN</Typography>
        <Button onClick={onClose} sx={{ color: "#8fa3c0", fontWeight: 700 }}>Close</Button>
        <Button 
          variant="contained" onClick={handleSave} disabled={saving} 
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
          sx={{ background: "linear-gradient(135deg, #F26522 0%, #e55a1b 100%)", fontWeight: 800, px: 5, borderRadius: 2 }}
        >
          {saving ? "Saving..." : "Commit Frame Changes"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
