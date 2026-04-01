/**
 * ProjectListPanel — Multi-project sidebar within BRD Studio
 * ────────────────────────────────────────────────────────────
 * Lists all user's BRD projects with status badges.
 * Allows creating new projects and switching between them.
 * Supported collapsed state to save horizontal space.
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  Button,
  IconButton,
  Tooltip,
  Chip,
  TextField,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import RefreshIcon from "@mui/icons-material/Refresh";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

const STATUS_CONFIG = {
  draft: { label: "Draft", color: "#8fa3c0", bg: "rgba(143,163,192,0.12)" },
  generating: { label: "Generating...", color: "#F26522", bg: "rgba(242,101,34,0.12)" },
  review: { label: "In Review", color: "#ffc107", bg: "rgba(255,193,7,0.12)" },
  exported: { label: "Exported", color: "#4caf50", bg: "rgba(76,175,80,0.12)" },
  error: { label: "Error", color: "#f44336", bg: "rgba(244,67,54,0.12)" },
};

export default function ProjectListPanel({ onSelectProject, activeProjectId, token, apiBase }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [createDialog, setCreateDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [newClient, setNewClient] = useState("");
  const [newProcess, setNewProcess] = useState("");
  const [creating, setCreating] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/brd/projects`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setProjects(await res.json());
    } catch (err) {
      console.error("Failed to fetch projects:", err);
    } finally {
      setLoading(false);
    }
  }, [apiBase, token]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Handle collapsing when a project is selected (per user request)
  useEffect(() => {
    if (activeProjectId && projects.length > 0) {
      setCollapsed(true);
    }
  }, [activeProjectId, projects.length]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`${apiBase}/api/brd/projects`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: newName, client_name: newClient, process_name: newProcess }),
      });
      if (res.ok) {
        const project = await res.json();
        onSelectProject(project.id);
        await fetchProjects();
        setCreateDialog(false);
        setNewName("");
        setNewClient("");
        setNewProcess("");
      }
    } catch (err) {
      console.error("Create failed:", err);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (e, projectId) => {
    e.stopPropagation();
    if (!window.confirm("Delete this project and all its data?")) return;
    try {
      await fetch(`${apiBase}/api/brd/projects/${projectId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchProjects();
      if (activeProjectId === projectId) onSelectProject(null);
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const formatDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <Box
      sx={{
        width: collapsed ? 64 : 260,
        height: "100%",
        flexShrink: 0,
        borderRight: "1px solid var(--ae-border)",
        display: "flex",
        flexDirection: "column",
        bgcolor: "var(--ae-glass)",
        backdropFilter: "blur(10px)",
        transition: "width 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <Box sx={{ 
        px: collapsed ? 1 : 2, 
        py: 1.5, 
        display: "flex", 
        alignItems: "center", 
        justifyContent: collapsed ? "center" : "space-between",
        gap: 1, 
        borderBottom: "1px solid var(--ae-border)",
        flexShrink: 0
      }}>
        {!collapsed && (
          <>
            <FolderOpenIcon sx={{ color: "var(--ae-orange)", fontSize: 18 }} />
            <Typography variant="subtitle2" sx={{ color: "text.primary", fontWeight: 700, flex: 1, fontSize: 13 }}>
              Projects
            </Typography>
          </>
        )}
        <Box sx={{ display: "flex", alignItems: "center" }}>
          {!collapsed && (
            <>
              <Tooltip title="Refresh">
                <IconButton size="small" onClick={fetchProjects} sx={{ color: "text.secondary", mr: 0.5 }}>
                  <RefreshIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="New Project">
                <IconButton size="small" onClick={() => setCreateDialog(true)} sx={{ color: "#F26522", mr: 0.5 }}>
                  <AddIcon sx={{ fontSize: 20 }} />
                </IconButton>
              </Tooltip>
            </>
          )}
          <IconButton size="small" onClick={() => setCollapsed(!collapsed)} sx={{ color: "#8fa3c0" }}>
            {collapsed ? <ChevronRightIcon fontSize="small" /> : <ChevronLeftIcon fontSize="small" />}
          </IconButton>
        </Box>
      </Box>

      {/* Project List */}
      <Box sx={{ flex: 1, overflowY: "auto", p: collapsed ? 0.5 : 1.5 }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={20} color="inherit" sx={{ color: "var(--ae-orange)" }} />
          </Box>
        ) : projects.length === 0 ? (
          !collapsed && <Typography sx={{ color: "text.secondary", fontSize: 12, textAlign: "center", mt: 4 }}>No projects active</Typography>
        ) : (
          projects.map((p) => {
            const isActive = p.id === activeProjectId;
            const cfg = STATUS_CONFIG[p.status || "draft"] || STATUS_CONFIG.draft;

            return (
              <Box
                key={p.id}
                onClick={() => onSelectProject(p.id)}
                sx={{
                  p: collapsed ? 1.5 : 2,
                  mb: 1,
                  borderRadius: 2,
                  cursor: "pointer",
                  bgcolor: isActive ? "rgba(242,101,34,0.08)" : "transparent",
                  border: "1px solid",
                  borderColor: isActive ? "rgba(242,101,34,0.3)" : "transparent",
                  textAlign: collapsed ? "center" : "left",
                  transition: "all 0.2s",
                  "&:hover": {
                    bgcolor: isActive ? "rgba(242,101,34,0.12)" : "rgba(0,0,0,0.04)",
                    borderColor: isActive ? "rgba(242,101,34,0.4)" : "var(--ae-border)",
                  },
                }}
              >
                {!collapsed ? (
                  <>
                    <Box sx={{ display: "flex", alignItems: "center", mb: 0.8 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          color: isActive ? "var(--ae-orange)" : "text.primary",
                          fontWeight: isActive ? 700 : 500,
                          flex: 1,
                          fontSize: 13,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p.name}
                      </Typography>
                      <IconButton
                        size="small"
                        onClick={(e) => handleDelete(e, p.id)}
                        sx={{ color: "text.secondary", "&:hover": { color: "error.main" } }}
                      >
                        <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Box>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Chip
                        label={cfg.label}
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: 9,
                          fontWeight: 700,
                          bgcolor: cfg.bg,
                          color: cfg.color,
                        }}
                      />
                      <Typography sx={{ color: "text.secondary", fontSize: 10, ml: "auto" }}>
                        {formatDate(p.updated_at)}
                      </Typography>
                    </Box>
                  </>
                ) : (
                  <Tooltip title={p.name} placement="right">
                    <FolderOpenIcon sx={{ color: isActive ? "#F26522" : "#89a1c0", fontSize: 20 }} />
                  </Tooltip>
                )}
              </Box>
            );
          })
        )}
      </Box>

      {/* Creation Dialog */}
      <Dialog
        open={createDialog}
        onClose={() => setCreateDialog(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { bgcolor: "background.paper", border: "1px solid var(--ae-border)", borderRadius: 3 } }}
      >
        <DialogTitle sx={{ color: "text.primary", fontWeight: 700 }}>New Project</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            <TextField
              label="Project Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              fullWidth
              autoFocus
            />
            <TextField
              label="Client Name"
              value={newClient}
              onChange={(e) => setNewClient(e.target.value)}
              fullWidth
            />
            <TextField
              label="Process Area"
              value={newProcess}
              onChange={(e) => setNewProcess(e.target.value)}
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setCreateDialog(false)} sx={{ color: "#8fa3c0" }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            sx={{
              background: "linear-gradient(135deg, #F26522 0%, #e55a1b 100%)",
              fontWeight: 700,
            }}
          >
            {creating ? <CircularProgress size={20} /> : "Create Project"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
