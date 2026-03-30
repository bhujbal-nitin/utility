/**
 * BRD Studio — Main Container (with Multi-Project Panel)
 * ──────────────────────────────────────────────────────
 * 4-step stepper: Upload & Capture → Review & Edit → Generate & Edit BRD → Export
 * Supports iterative updates: add more videos/calls and re-run pipeline.
 * Matches AE dark theme (#F26522, #0a1628, DM Sans / Syne)
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Stepper,
  Step,
  StepLabel,
  StepConnector,
  Typography,
  IconButton,
  Tooltip,
  Alert,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import ImageSearchIcon from "@mui/icons-material/ImageSearch";
import DescriptionIcon from "@mui/icons-material/Description";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import UploadCapture from "./UploadCapture";
import ReviewEdit from "./ReviewEdit";
import DocumentEditor from "./DocumentEditor";
import ExportManage from "./ExportManage";
import ProjectListPanel from "./ProjectListPanel";
import { useAuth } from "../../context/AuthContext";

const STEPS = [
  { label: "Upload & Capture", icon: <CloudUploadIcon />, hint: "Video + intelligent frame capture" },
  { label: "Review & Edit", icon: <ImageSearchIcon />, hint: "Edit frames, descriptions, add captures" },
  { label: "Generate & Edit BRD", icon: <DescriptionIcon />, hint: "AI-generated BRD with direct editing" },
  { label: "Export & Manage", icon: <FileDownloadIcon />, hint: "DOCX/PDF export, version history" },
];

// Custom step connector
const AEConnector = styled(StepConnector)(() => ({
  "& .MuiStepConnector-line": {
    borderColor: "rgba(242, 101, 34, 0.3)",
    borderTopWidth: 2,
  },
  "&.Mui-active .MuiStepConnector-line, &.Mui-completed .MuiStepConnector-line": {
    borderColor: "#F26522",
  },
}));

// Custom step icon
function AEStepIcon({ active, completed, stepIcon }) {
  return (
    <Box
      sx={{
        width: 36,
        height: 36,
        borderRadius: "10px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: completed ? "#F26522" : active ? "rgba(242,101,34,0.15)" : "rgba(255,255,255,0.05)",
        border: active ? "2px solid #F26522" : "2px solid transparent",
        color: completed ? "#fff" : active ? "#F26522" : "#8fa3c0",
        transition: "all 0.3s ease",
        "& svg": { fontSize: 18 },
      }}
    >
      {stepIcon}
    </Box>
  );
}

const API_BASE =
  process.env.REACT_APP_BRD_API_BASE ||
  (process.env.NODE_ENV === "development" ? "http://localhost:8001" : "");

export default function BRDStudio({ onBack }) {
  const { token } = useAuth();
  const [activeStep, setActiveStep] = useState(0);
  const [projectId, setProjectId] = useState(null);
  const [projectData, setProjectData] = useState(null);
  const [captures, setCaptures] = useState([]);
  const [sections, setSections] = useState([]);
  const [error, setError] = useState(null);
  const [step1Busy, setStep1Busy] = useState(false);

  // Fetch project data when projectId or token changes
  const fetchProject = useCallback(async () => {
    if (!projectId || !token) return;
    try {
      const res = await fetch(`${API_BASE}/api/brd/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProjectData(data);
        setCaptures(data.captures || []);
        setSections(data.sections || []);

        // Keep the user on the step they explicitly selected.
        // Do not auto-jump; users can always add more videos/assets in Step 1.
      }
    } catch (err) {
      console.error("Failed to fetch project:", err);
    }
  }, [projectId, token]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  // When project is reset (e.g., Stop & Revert), clear local state so UI never shows stale data.
  useEffect(() => {
    if (!projectId) {
      setProjectData(null);
      setCaptures([]);
      setSections([]);
    }
  }, [projectId]);

  // Refresh captures
  const refreshCaptures = useCallback(async () => {
    if (!projectId || !token) return;
    try {
      const res = await fetch(`${API_BASE}/api/brd/projects/${projectId}/captures`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setCaptures(await res.json());
      }
    } catch (err) {
      console.error("Refresh captures failed:", err);
    }
  }, [projectId, token]);

  // Handle project selection from sidebar
  const handleSelectProject = (pid) => {
    if (pid === projectId) return;
    setProjectId(pid);
    setActiveStep(0);
    setProjectData(null);
    setCaptures([]);
    setSections([]);
  };

  // Navigate steps — Step 1 is always accessible to add more videos (iterative)
  const handleNext = () => setActiveStep((prev) => Math.min(prev + 1, STEPS.length - 1));
  const handleBack = () => setActiveStep((prev) => Math.max(prev - 1, 0));

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <Box
        sx={{
          px: 3,
          py: 1.5,
          display: "flex",
          alignItems: "center",
          gap: 2,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "linear-gradient(180deg, rgba(17,34,64,0.95) 0%, rgba(10,22,40,0.95) 100%)",
          backdropFilter: "blur(12px)",
          flexShrink: 0,
        }}
      >
        <Tooltip title="Back to tools">
          <IconButton onClick={onBack} sx={{ color: "#8fa3c0" }}>
            <ArrowBackIcon />
          </IconButton>
        </Tooltip>
        <Box>
          <Typography
            variant="h6"
            sx={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, color: "#e8edf5", fontSize: 18 }}
          >
            BRD Studio
          </Typography>
          <Typography variant="caption" sx={{ color: "#8fa3c0", fontSize: 11 }}>
            {projectData?.name || "Select or create a project"}
          </Typography>
        </Box>
        <Box sx={{ flex: 1 }} />

        {/* Stepper */}
        <Stepper
          activeStep={activeStep}
          connector={<AEConnector />}
          sx={{ flex: "0 0 auto", maxWidth: 640 }}
        >
          {STEPS.map((step, idx) => (
            <Step key={step.label} completed={activeStep > idx}>
              <StepLabel
                StepIconComponent={(props) => (
                  <AEStepIcon {...props} stepIcon={step.icon} />
                )}
                onClick={() => {
                  if (step1Busy) return; // block navigation during Step 1 processing
                  // Allow going back to Step 1 anytime for iterative updates
                  if (idx <= activeStep || (idx === 0 && projectId)) {
                    setActiveStep(idx);
                  }
                }}
                sx={{
                  cursor: (idx <= activeStep || (idx === 0 && projectId)) ? "pointer" : "default",
                  "& .MuiStepLabel-label": {
                    color: idx === activeStep ? "#F26522" : idx < activeStep ? "#e8edf5" : "#8fa3c0",
                    fontSize: 12,
                    fontWeight: idx === activeStep ? 700 : 500,
                    transition: "all 0.2s",
                  },
                }}
              >
                {step.label}
              </StepLabel>
            </Step>
          ))}
        </Stepper>
      </Box>

      {/* Error display */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mx: 2, mt: 1, borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      {/* Main content area: Project sidebar + Step content */}
      <Box sx={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Multi-project sidebar */}
        <Box sx={{ pointerEvents: step1Busy ? "none" : "auto", opacity: step1Busy ? 0.6 : 1 }}>
          <ProjectListPanel
            activeProjectId={projectId}
            onSelectProject={(pid) => {
              if (step1Busy) return;
              handleSelectProject(pid);
            }}
            token={token}
            apiBase={API_BASE}
          />
        </Box>

        {/* Step Content */}
        <Box sx={{ flex: 1, overflow: "hidden" }}>
          {activeStep === 0 && (
            <UploadCapture
              projectId={projectId}
              setProjectId={setProjectId}
              captures={captures}
              refreshCaptures={refreshCaptures}
              onNext={handleNext}
              token={token}
              apiBase={API_BASE}
              onBusyChange={setStep1Busy}
            />
          )}
          {activeStep === 1 && (
            <ReviewEdit
              projectId={projectId}
              captures={captures}
              refreshCaptures={refreshCaptures}
              onNext={handleNext}
              onBack={handleBack}
              token={token}
              apiBase={API_BASE}
            />
          )}
          {activeStep === 2 && (
            <DocumentEditor
              projectId={projectId}
              sections={sections}
              setSections={setSections}
              captures={captures}
              onNext={handleNext}
              onBack={handleBack}
              token={token}
              apiBase={API_BASE}
              projectData={projectData}
            />
          )}
          {activeStep === 3 && (
            <ExportManage
              projectId={projectId}
              sections={sections}
              onBack={handleBack}
              token={token}
              apiBase={API_BASE}
            />
          )}
        </Box>
      </Box>
    </Box>
  );
}
