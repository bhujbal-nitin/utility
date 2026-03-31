/**
 * Step 3: Document Editor (Unified Document-First View)
 * ───────────────────────────────────────────────────
 * - Renders the entire BRD as a single, branded scrollable document.
 * - Branded cover page + headers/footers mockup.
 * - Each section is editable inline with auto-save.
 * - Markdown rendering for tables and lists (matches DOCX export parity).
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm"; // For tables
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Paper,
  IconButton,
  Tooltip,
  Divider,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  Chip,
  Grid,
  Alert,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import HistoryIcon from "@mui/icons-material/History";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RefreshIcon from "@mui/icons-material/Refresh";
import FileDownloadIcon from "@mui/icons-material/FileDownload";

import { 
  MDXEditor, 
  headingsPlugin, 
  listsPlugin, 
  quotePlugin, 
  thematicBreakPlugin, 
  markdownShortcutPlugin,
  tablePlugin,
  toolbarPlugin,
  UndoRedo,
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  ListsToggle,
  InsertTable,
  CreateLink,
  Separator
} from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';

// Section mapping to match template numbering exactly
const SECTION_CONFIG = [
  { key: "process_summary", label: "Section 1: Process Summary" },
  { key: "applications_involved", label: "Section 4: Details of Applications Involved" },
  { key: "feasibility_observations", label: "Section 5: Automation Feasibility Observations" },
  { key: "io_details", label: "Section 6: Input, Output Formats and Details" },
  { key: "flow_existing", label: "Section 7: Existing Process Flow Diagram (As-Is)" },
  { key: "flow_proposed", label: "Section 8: Proposed Automation Process Flow (To-Be)" },
  { key: "process_detail", label: "Section 9: Business Process Detailed Description" },
  { key: "validations", label: "Section 10: Validations" },
  { key: "exceptions", label: "Section 11: Exceptions" },
  { key: "rules", label: "Section 12: Business Rules" },
  { key: "func_req", label: "Section 13: Functional Requirements" },
  { key: "nonfunc_req", label: "Non-Functional Requirements" },
  { key: "recommendations", label: "Process Re-engineering Recommendations" },
];

const SECTION_ORDER = SECTION_CONFIG.map(c => c.key);

/**
 * Robust image reference renderer for all Markdown node types
 */
const renderImageRefs = (text, captures, apiBase) => {
  if (typeof text !== 'string' || !text.includes('[IMAGE_REF')) return text;

  // Supports [IMAGE_REF:id], [IMAGE_REF: id], or [IMAGE_REF id]
  const parts = text.split(/(\[IMAGE_REF:?\s*[^\]\s]+\])/g);
  
  return parts.map((part, i) => {
    const match = part.match(/\[IMAGE_REF:?\s*([^\]\s]+)\]/);
    if (match) {
      const capId = match[1].trim();
      const cap = captures.find(c => c.id === capId);
      
      if (cap && (cap.image_url || cap.image_path)) {
        const cleanApiBase = apiBase ? apiBase.replace(/\/$/, '') : '';
        const src = `${cleanApiBase}${cap.image_url}`;
        
        return (
          <Box 
            key={i} 
            sx={{ 
              my: 4, 
              mx: 'auto', 
              textAlign: 'center', 
              maxWidth: '850px', // Standard width for document view
              width: '100%',
              bgcolor: 'rgba(0,0,0,0.15)', 
              p: 2, 
              borderRadius: 2,
              border: '1px solid rgba(255,255,255,0.05)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
            }}
          >
            <img 
              src={src} 
              alt={cap.label || "Process Capture"} 
              style={{ 
                maxWidth: '100%', 
                height: 'auto', 
                borderRadius: '6px', 
                border: '1px solid rgba(255,255,255,0.1)', 
                display: 'block', 
                margin: '0 auto',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
              }} 
              onError={(e) => {
                e.target.onerror = null;
                // If absolute fails, try relative
                if (src.includes('http')) e.target.src = cap.image_url;
              }}
            />
            <Typography 
              variant="caption" 
              sx={{ 
                display: 'block', 
                color: '#8fa3c0', 
                mt: 1.5, 
                fontStyle: 'italic', 
                fontWeight: 600,
                fontSize: '0.75rem',
                letterSpacing: '0.02em'
              }}
            >
              Step: {cap.label || "System Screenshot"}
            </Typography>
          </Box>
        );
      }
      return (
        <Box key={i} sx={{ my: 1, p: 1, bgcolor: 'rgba(242,101,34,0.1)', borderRadius: 1, border: '1px dashed #F26522', textAlign: 'center' }}>
          <Typography variant="caption" sx={{ color: '#F26522', fontWeight: 800 }}>
            [Screenshot Reference: {capId} - Asset syncing or missing]
          </Typography>
        </Box>
      );
    }
    return part;
  });
};

/**
 * Custom Markdown Components to handle AE specifics (Images, Tables, etc.)
 */
const useMarkdownComponents = (captures, apiBase) => useMemo(() => ({
  p: ({ children }) => {
    const flattenText = (node) => {
      if (typeof node === 'string') return node;
      if (Array.isArray(node)) return node.map(flattenText).join('');
      if (node?.props?.children) return flattenText(node.props.children);
      return '';
    };
    const fullText = flattenText(children);
    return (
      <Typography sx={{ mb: 2, lineHeight: 1.6, fontSize: '10.5pt', color: '#e8edf5' }}>
        {renderImageRefs(fullText, captures, apiBase)}
      </Typography>
    );
  },
  li: ({ children }) => (
    <li style={{ color: '#e8edf5', fontSize: '10.5pt', marginBottom: '8px' }}>
      {typeof children === 'string' ? renderImageRefs(children, captures, apiBase) : children}
    </li>
  ),
  h3: ({ children }) => (
    <Typography variant="h6" sx={{ color: '#F26522', fontWeight: 700, mt: 3, mb: 1.5 }}>
      {typeof children === 'string' ? renderImageRefs(children, captures, apiBase) : children}
    </Typography>
  ),
  table: ({ children }) => (
    <Box sx={{ overflowX: 'auto', my: 2, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 1, maxWidth: '100%' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', color: '#e8edf5', fontSize: '9.5pt', tableLayout: 'fixed' }}>{children}</table>
    </Box>
  ),
  thead: ({ children }) => <thead style={{ backgroundColor: '#1F3864', color: '#fff' }}>{children}</thead>,
  th: ({ children }) => <th style={{ padding: '8px 10px', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'left', fontWeight: 600, wordBreak: 'break-word', overflow: 'hidden' }}>{children}</th>,
  td: ({ children }) => <td style={{ padding: '8px 10px', border: '1px solid rgba(255,255,255,0.1)', color: '#8fa3c0', wordBreak: 'break-word', verticalAlign: 'top', overflow: 'hidden' }}>{children}</td>,
  pre: ({ children }) => {
    // Unwrap <pre><code className="language-mermaid">...</code></pre> so the
    // Mermaid code component renders as a block-level element directly.
    const child = React.Children.toArray(children)[0];
    if (child?.props?.className === 'language-mermaid') {
      return <>{children}</>;
    }
    return <pre style={{ overflowX: 'auto', background: '#f6f8fa', padding: '12px', borderRadius: '6px', fontSize: '9.5pt' }}>{children}</pre>;
  },
  code: ({ children, className }) => {
    const isMermaid = className === 'language-mermaid';
    if (isMermaid) {
      const code = String(children).replace(/\n$/, '');
      const encoded = b64EncodeUnicode(code);
      return (
        <Box sx={{ my: 3, textAlign: 'center', p: 2, bgcolor: '#f8f9fa', borderRadius: 1 }}>
          <img 
            src={`https://mermaid.ink/img/${encoded}`} 
            alt="Process Diagram" 
            style={{ maxWidth: '100%' }}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        </Box>
      );
    }
    if (className) {
      return <code style={{ background: '#f6f8fa', padding: '2px 4px', borderRadius: '3px', fontSize: '9pt' }} className={className}>{children}</code>;
    }
    return <code style={{ background: '#f0f2f5', padding: '1px 4px', borderRadius: '3px', fontSize: '9.5pt', color: '#c7254e' }}>{children}</code>;
  }
}), [captures, apiBase]);

function b64EncodeUnicode(str) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function(match, p1) {
    return String.fromCharCode('0x' + p1);
  }));
}

/**
 * Individual Section Editor Component
 */
const SectionBlock = ({ section, index, apiBase, token, onRefine, onHistory, captures }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [localContent, setLocalContent] = useState(section?.content || "");
  const [saveStatus, setSaveStatus] = useState("idle");
  const timerRef = useRef(null);
  const lastSavedRef = useRef(section?.content);
  const components = useMarkdownComponents(captures, apiBase);

  useEffect(() => {
    setLocalContent(section?.content || "");
    lastSavedRef.current = section?.content;
  }, [section]);

  // Clean the content for preview: Remove "```markdown" wrappers and other AI garbage
  const sanitizeContent = (text) => {
    if (!text) return "";
    let cleaned = text.trim();
    // Remove markdown code blocks
    cleaned = cleaned.replace(/^```markdown\n?/gi, "");
    cleaned = cleaned.replace(/\n?```$/gi, "");
    return cleaned;
  };

  const displayContent = sanitizeContent(localContent);

  useEffect(() => {
    if (localContent === lastSavedRef.current) return;
    setSaveStatus("saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${apiBase}/api/brd/sections/${section.id}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ content: localContent }),
        });
        if (res.ok) {
          lastSavedRef.current = localContent;
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 2000);
        } else { setSaveStatus("error"); }
      } catch { setSaveStatus("error"); }
    }, 1200);
    return () => clearTimeout(timerRef.current);
  }, [localContent, section.id, apiBase, token]);

  const toggleEdit = () => setIsEditing(true);
  const stopEdit = () => setIsEditing(false);

  const config = SECTION_CONFIG.find(c => c.key === section.section_key);
  const headerLabel = config ? config.label : section.title;

  return (
    <Box sx={{ mb: 6, position: "relative", "&:hover .section-tools": { opacity: 1 } }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1.5 }}>
        <Typography variant="h6" sx={{ color: "#1F3864", fontWeight: 800, fontSize: "1.05rem", letterSpacing: '0.02em' }}>
          {headerLabel.toUpperCase()}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Chip label={`v${section.version}`} size="small" sx={{ height: 16, fontSize: '9px', bgcolor: '#f4f7f9' }} />
          {saveStatus === "saving" && <CircularProgress size={10} sx={{ color: "#F26522" }} />}
          {saveStatus === "saved" && <CheckCircleIcon sx={{ fontSize: 12, color: "#4caf50" }} />}
        </Box>
        <Box className="section-tools" sx={{ flex: 1, display: "flex", justifyContent: "flex-end", opacity: 0, transition: "opacity 0.2s" }}>
          <Tooltip title="AI Refine"><IconButton size="small" onClick={() => onRefine(section)} sx={{ color: "#F26522" }}><AutoFixHighIcon fontSize="small" /></IconButton></Tooltip>
          <Tooltip title="History"><IconButton size="small" onClick={() => onHistory(section)} sx={{ color: "#8fa3c0" }}><HistoryIcon fontSize="small" /></IconButton></Tooltip>
          <Button size="small" onClick={toggleEdit} sx={{ ml: 1, color: "#F26522", textTransform: 'none', fontSize: '12px' }}>Edit</Button>
        </Box>
      </Box>

      {isEditing ? (
        <Box sx={{ 
          bgcolor: '#0b1322', 
          borderRadius: 1, 
          color: '#e8edf5', 
          border: '1px solid rgba(255,255,255,0.1)', 
          overflow: 'hidden',
          '& .mdxeditor': { color: '#e8edf5 !important' },
          '& .mdxeditor-root-contenteditable': { color: '#e8edf5 !important' },
          '& .mdxeditor-toolbar': { bgcolor: '#112240', borderBottom: '1px solid rgba(255,255,255,0.1)' },
          '& .mdxeditor-toolbar button': { color: '#8fa3c0' },
          '& .mdxeditor-toolbar button[data-active="true"]': { color: '#F26522', bgcolor: 'rgba(242,101,34,0.1)' }
        }}>
          <MDXEditor
            markdown={localContent}
            onChange={setLocalContent}
            autoFocus
            contentEditableClassName="prose max-w-none"
            plugins={[
              headingsPlugin(),
              listsPlugin(),
              quotePlugin(),
              thematicBreakPlugin(),
              tablePlugin(),
              markdownShortcutPlugin(),
              toolbarPlugin({
                toolbarContents: () => (
                  <>
                    <UndoRedo />
                    <Separator />
                    <BoldItalicUnderlineToggles />
                    <Separator />
                    <BlockTypeSelect />
                    <ListsToggle />
                    <Separator />
                    <InsertTable />
                    <CreateLink />
                  </>
                )
              })
            ]}
          />
          <Box sx={{ p: 1, textAlign: 'right', bgcolor: '#112240', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <Button size="small" onClick={stopEdit} sx={{ color: "#F26522", fontWeight: 700 }}>Done</Button>
          </Box>
        </Box>
      ) : (
        <Box onClick={toggleEdit} sx={{ cursor: "text", minHeight: "2em", px: 0.5, maxWidth: '100%', overflowWrap: 'break-word', wordBreak: 'break-word', '& img': { maxWidth: '100%', height: 'auto' } }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {displayContent || "*No content provided for this section.*"}
          </ReactMarkdown>
        </Box>
      )}
      <Divider sx={{ mt: 4, opacity: 0.1 }} />
    </Box>
  );
}

export default function DocumentEditor({
  projectId,
  sections,
  setSections,
  captures,
  onNext,
  onBack,
  token,
  apiBase,
  projectData,
}) {
  const [generating, setGenerating] = useState(false);
  const [versionDialog, setVersionDialog] = useState(null);
  const [versions, setVersions] = useState([]);
  const [refineDialog, setRefineDialog] = useState(null);
  const [refineInstruction, setRefineInstruction] = useState("");
  
  const [meta, setMeta] = useState({
    client_name: projectData?.client_name || "",
    ba_name: projectData?.ba_name || "",
    process_name: projectData?.process_name || projectData?.name || "",
  });
  const [regenAdvice, setRegenAdvice] = useState(null);

  useEffect(() => {
    if (projectData) {
      setMeta({
        client_name: projectData.client_name || "",
        ba_name: projectData.ba_name || "",
        process_name: projectData.process_name || projectData.name || "",
      });
    }
  }, [projectData]);

  useEffect(() => {
    const fetchAdvice = async () => {
      if (!projectId) return;
      try {
        const res = await fetch(`${apiBase}/api/brd/projects/${projectId}/regeneration-recommendation`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          setRegenAdvice(await res.json());
        }
      } catch (e) {
        console.error("Failed to load regeneration recommendation", e);
      }
    };
    fetchAdvice();
  }, [projectId, token, apiBase, sections, captures]);

  const updateMeta = async (field, value) => {
    setMeta(prev => ({ ...prev, [field]: value }));
    try {
      await fetch(`${apiBase}/api/brd/projects/${projectId}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
    } catch {}
  };

  const handleGenerate = async (sectionsToRegen = null, instruction = "") => {
    setGenerating(true);
    try {
      const endpoint = sectionsToRegen ? "regenerate" : "generate";
      const payload = sectionsToRegen 
        ? { sections: sectionsToRegen === true ? null : sectionsToRegen, instruction: String(instruction || "") }
        : {};
      
      const res = await fetch(`${apiBase}/api/brd/projects/${projectId}/${endpoint}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const poll = setInterval(async () => {
          const statusRes = await fetch(`${apiBase}/api/brd/projects/${projectId}/status`, { headers: { Authorization: `Bearer ${token}` } });
          if (statusRes.ok) {
            const status = await statusRes.json();
            if (status.status !== "generating") {
              clearInterval(poll);
              const secRes = await fetch(`${apiBase}/api/brd/projects/${projectId}/sections`, { headers: { Authorization: `Bearer ${token}` } });
              if (secRes.ok) setSections(await secRes.json());
              setGenerating(false);
            }
          }
        }, 3000);
      } else { setGenerating(false); }
    } catch { setGenerating(false); }
  };

  const handleRefine = async () => {
    if (!refineDialog || !refineInstruction.trim()) return;
    setGenerating(true);
    try {
      const res = await fetch(`${apiBase}/api/brd/sections/${refineDialog.id}/refine`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: refineInstruction }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSections(prev => prev.map(s => s.id === updated.id ? updated : s));
        setRefineDialog(null);
        setRefineInstruction("");
      }
    } catch {} finally { setGenerating(false); }
  };

  const openVersionHistory = async (sec) => {
    setVersionDialog(sec);
    const res = await fetch(`${apiBase}/api/brd/sections/${sec.id}/versions`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setVersions(await res.json());
  };

  const restoreVersion = async (versionId) => {
    const res = await fetch(`${apiBase}/api/brd/sections/${versionDialog.id}/restore/${versionId}`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const updated = await res.json();
      setSections(prev => prev.map(s => s.id === updated.id ? updated : s));
    }
    setVersionDialog(null);
  };

  const sortedSections = useMemo(() => {
    return [...sections].sort((a, b) => {
      const aIdx = SECTION_ORDER.indexOf(a.section_key);
      const bIdx = SECTION_ORDER.indexOf(b.section_key);
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    });
  }, [sections]);

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", bgcolor: "#0A1628" }}>
      {/* Tool bar */}
      <Box sx={{ px: 3, py: 1.5, display: "flex", alignItems: "center", gap: 2, borderBottom: "1px solid rgba(255,255,255,0.06)", bgcolor: "#112240" }}>
        <Button startIcon={<ArrowBackIcon />} onClick={onBack} size="small" sx={{ color: "#8fa3c0" }}>Back</Button>
        <Box sx={{ flex: 1 }} />
        {sections.length > 0 ? (
          <>
            <Button variant="outlined" size="small" onClick={() => handleGenerate(true)} disabled={generating} startIcon={<RefreshIcon />} sx={{ borderColor: "rgba(242,101,34,0.5)", color: "#F26522" }}>Regenerate All</Button>
            <Button variant="contained" size="small" onClick={onNext} endIcon={<FileDownloadIcon />} sx={{ background: "#F26522", fontWeight: 700 }}>Download Doc</Button>
          </>
        ) : (
          <Button variant="contained" onClick={() => handleGenerate()} disabled={generating} startIcon={generating ? <CircularProgress size={16} /> : <AutoFixHighIcon />} sx={{ background: "#F26522" }}>Draft BRD</Button>
        )}
      </Box>

      {regenAdvice?.should_regenerate && (
        <Alert
          severity="info"
          sx={{ mx: 2, mt: 1 }}
          action={
            <Button
              size="small"
              variant="contained"
              onClick={() => handleGenerate(true)}
              sx={{ background: "#F26522", fontWeight: 700 }}
            >
              Regenerate BRD
            </Button>
          }
        >
          {regenAdvice.reasons?.[0] || "Project evidence changed. Regenerate to include latest updates."}
        </Alert>
      )}

      {/* Form-style editor: edit sections directly (no DOCX viewer iframe). */}
      <Box sx={{ flex: 1, overflowY: "auto", bgcolor: "#0A1628", p: 3 }}>
        {sortedSections.length === 0 ? (
          <Box sx={{ p: 2 }}>
            <Alert severity="info">No sections generated yet. Click “Draft BRD” or regenerate to start editing.</Alert>
          </Box>
        ) : (
          sortedSections.map((sec, idx) => (
            <SectionBlock
              key={sec.id}
              section={sec}
              index={idx}
              apiBase={apiBase}
              token={token}
              captures={captures}
              onRefine={(section) => {
                setRefineDialog(section);
                setRefineInstruction("");
              }}
              onHistory={openVersionHistory}
            />
          ))
        )}
      </Box>

      {/* Dialogs */}
      <Dialog open={!!versionDialog} onClose={() => setVersionDialog(null)} maxWidth="sm" fullWidth PaperProps={{ sx: { bgcolor: "#112240", borderRadius: 2 } }}>
        <DialogTitle sx={{ color: "#fff" }}>Version History: {versionDialog?.title}</DialogTitle>
        <DialogContent>
          <List>
            {versions.map((v) => (
              <ListItem key={v.id} secondaryAction={<Button size="small" onClick={() => restoreVersion(v.id)} sx={{ color: "#F26522" }}>Restore</Button>}>
                <ListItemText primary={`Version ${v.version_number}`} secondary={new Date(v.created_at).toLocaleString()} primaryTypographyProps={{ color: "#fff" }} secondaryTypographyProps={{ color: "#8fa3c0" }} />
              </ListItem>
            ))}
          </List>
        </DialogContent>
      </Dialog>
      <Dialog open={!!refineDialog} onClose={() => setRefineDialog(null)} maxWidth="sm" fullWidth PaperProps={{ sx: { bgcolor: "#112240", borderRadius: 1 } }}>
        <DialogTitle sx={{ color: "#fff" }}>AI Refine</DialogTitle>
        <DialogContent><TextField fullWidth multiline rows={4} value={refineInstruction} onChange={(e) => setRefineInstruction(e.target.value)} placeholder="How should AI change this section?" sx={{ mt: 1, bgcolor: "#fff", borderRadius: 1 }} /></DialogContent>
        <DialogActions sx={{ p: 2 }}><Button onClick={() => setRefineDialog(null)} sx={{ color: "#8fa3c0" }}>Cancel</Button><Button variant="contained" onClick={handleRefine} disabled={generating} sx={{ bgcolor: "#F26522" }}>Refine Content</Button></DialogActions>
      </Dialog>

    </Box>
  );
}
