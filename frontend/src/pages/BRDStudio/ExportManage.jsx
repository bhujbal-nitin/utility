/**
 * Step 4: Export & Manage
 * ───────────────────────
 * - Export as DOCX/PDF
 * - Regenerate with instructions
 * - Project management
 */

import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  Paper,
  Grid,
  CircularProgress,
  Chip,
  Alert,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import DescriptionIcon from "@mui/icons-material/Description";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";

export default function ExportManage({
  projectId,
  sections,
  onBack,
  token,
  apiBase,
}) {
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState(null);
  const [regenInstruction, setRegenInstruction] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [regenSuccess, setRegenSuccess] = useState(false);
  const pollRef = useRef(null);

  const headers = { Authorization: `Bearer ${token}` };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Export BRD
  const handleExport = async (format) => {
    setExporting(true);
    setExportFormat(format);
    try {
      const formData = new FormData();
      formData.append("format", format);
      const res = await fetch(`${apiBase}/api/brd/projects/${projectId}/export`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        // Trigger file download
        const downloadUrl = `${apiBase}${data.download_url}`;
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = data.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        console.log("Export started:", data);
      }
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
      setExportFormat(null);
    }
  };

  // Regenerate BRD (Iterative Update)
  const handleRegenerate = async (sectionsToRegen = null) => {
    setRegenerating(true);
    try {
      // Button onClick passes a click event by default; only allow an explicit array payload.
      const normalizedSections = Array.isArray(sectionsToRegen) ? sectionsToRegen : null;
      const body = { 
        sections: normalizedSections,
        instruction: regenInstruction.trim() || undefined
      };
      
      const res = await fetch(`${apiBase}/api/brd/projects/${projectId}/regenerate`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
          try {
            const statusRes = await fetch(`${apiBase}/api/brd/projects/${projectId}/status`, { headers });
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              if (statusData.status !== "generating") {
                clearInterval(pollRef.current);
                pollRef.current = null;
                setRegenerating(false);
                setRegenInstruction("");
                setRegenSuccess(true);
                setTimeout(() => setRegenSuccess(false), 5000);
              }
            }
          } catch (err) {
            console.error("Polling failed:", err);
            clearInterval(pollRef.current);
            pollRef.current = null;
            setRegenerating(false);
          }
        }, 3000);
      } else {
        setRegenerating(false);
      }
    } catch (err) {
      console.error("Regenerate failed:", err);
      setRegenerating(false);
    }
  };

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", bgcolor: 'background.default', color: 'text.primary' }}>
      {/* Toolbar */}
      <Box
        sx={{
          px: 3,
          py: 1.5,
          display: "flex",
          alignItems: "center",
          gap: 2,
          borderBottom: "1px solid var(--ae-border)",
          flexShrink: 0,
        }}
      >
        <Button startIcon={<ArrowBackIcon />} onClick={onBack} size="small" sx={{ color: "text.secondary" }}>
          Back to Editor
        </Button>
        <Typography variant="subtitle1" sx={{ color: "text.primary", fontWeight: 600, flex: 1 }}>
          Export & Manage
        </Typography>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflowY: "auto", p: 4, display: "flex", justifyContent: "center" }}>
        <Box sx={{ maxWidth: 700, width: "100%" }}>
          {regenSuccess && (
            <Alert severity="success" onClose={() => setRegenSuccess(false)} sx={{ mb: 3, borderRadius: 2 }}>
              BRD regenerated successfully. Go back to the editor to see changes.
            </Alert>
          )}
          {/* Export Section */}
          <Paper
            sx={{
              p: 3,
              bgcolor: "var(--ae-surface)",
              border: "1px solid var(--ae-border)",
              borderRadius: 3,
              mb: 3,
            }}
          >
            <Typography
              variant="h6"
              sx={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, color: "text.primary", mb: 0.5 }}
            >
              Export BRD
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", mb: 3 }}>
              Download your BRD with {sections.length} sections, all images, and flow diagrams.
            </Typography>

            <Grid container spacing={2}>
              <Grid item xs={6}>
                <Button
                  variant="outlined"
                  fullWidth
                  startIcon={exporting && exportFormat === "docx" ? <CircularProgress size={18} /> : <DescriptionIcon />}
                  onClick={() => handleExport("docx")}
                  disabled={exporting}
                  sx={{
                    py: 2,
                    borderColor: "rgba(242,101,34,0.4)",
                    color: "text.primary",
                    borderRadius: 2,
                    "&:hover": { borderColor: "#F26522", bgcolor: "rgba(242,101,34,0.05)" },
                  }}
                >
                  <Box sx={{ textAlign: "left", ml: 1 }}>
                    <Typography sx={{ fontWeight: 600, fontSize: 14 }}>DOCX</Typography>
                    <Typography sx={{ fontSize: 11, color: "text.secondary" }}>Microsoft Word format</Typography>
                  </Box>
                </Button>
              </Grid>
              <Grid item xs={6}>
                <Button
                  variant="outlined"
                  fullWidth
                  startIcon={exporting && exportFormat === "pdf" ? <CircularProgress size={18} /> : <PictureAsPdfIcon />}
                  onClick={() => handleExport("pdf")}
                  disabled={exporting}
                  sx={{
                    py: 2,
                    borderColor: "var(--ae-border)",
                    color: "text.primary",
                    borderRadius: 2,
                    "&:hover": { borderColor: "text.secondary", bgcolor: "var(--ae-surface)" },
                  }}
                >
                  <Box sx={{ textAlign: "left", ml: 1 }}>
                    <Typography sx={{ fontWeight: 600, fontSize: 14 }}>PDF</Typography>
                    <Typography sx={{ fontSize: 11, color: "text.secondary" }}>Portable document</Typography>
                  </Box>
                </Button>
              </Grid>
            </Grid>
          </Paper>

          {/* Regenerate Section */}
          <Paper
            sx={{
              p: 3,
              bgcolor: "var(--ae-surface)",
              border: "1px solid var(--ae-border)",
              borderRadius: 3,
              mb: 3,
            }}
          >
            <Typography
              variant="h6"
              sx={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, color: "text.primary", mb: 0.5 }}
            >
              Regenerate BRD
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
              Regenerate with specific changes or instructions. Manually-edited sections will be preserved.
            </Typography>

            <TextField
              label="Instructions (optional)"
              value={regenInstruction}
              onChange={(e) => setRegenInstruction(e.target.value)}
              multiline
              rows={3}
              fullWidth
              size="small"
              placeholder="e.g., Focus more on exception handling scenarios, add SAP-specific terminology..."
              sx={{ mb: 2 }}
            />

            <Button
              variant="contained"
              startIcon={regenerating ? <CircularProgress size={16} /> : <AutoFixHighIcon />}
              onClick={handleRegenerate}
              disabled={regenerating}
              sx={{
                background: "linear-gradient(135deg, #F26522 0%, #e55a1b 100%)",
                fontWeight: 600,
              }}
            >
              {regenerating ? "Regenerating..." : "Regenerate BRD"}
            </Button>
          </Paper>

          {/* BRD Summary */}
          <Paper
            sx={{
              p: 3,
              bgcolor: "var(--ae-surface)",
              border: "1px solid var(--ae-border)",
              borderRadius: 3,
            }}
          >
            <Typography
              variant="h6"
              sx={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, color: "text.primary", mb: 2 }}
            >
              BRD Summary
            </Typography>
            <Grid container spacing={1}>
              {sections.map((sec) => (
                <Grid item xs={12} key={sec.id}>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      py: 0.5,
                      borderBottom: "1px solid var(--ae-border)",
                    }}
                  >
                    <Typography sx={{ fontSize: 13, color: "text.primary", flex: 1 }}>
                      {sec.title}
                    </Typography>
                    <Chip
                      label={`v${sec.version}`}
                      size="small"
                      sx={{ height: 18, fontSize: 10, bgcolor: "var(--ae-surface)", color: "text.secondary" }}
                    />
                    {sec.is_manual_override && (
                      <Chip
                        label="Edited"
                        size="small"
                        sx={{ height: 18, fontSize: 10, bgcolor: "rgba(242,101,34,0.1)", color: "#F26522" }}
                      />
                    )}
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Box>
      </Box>
    </Box>
  );
}
