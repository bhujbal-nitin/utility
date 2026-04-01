/**
 * Step 3: Document Editor (Unified Document-First View)
 * ───────────────────────────────────────────────────
 * - Renders the entire BRD as a single, branded scrollable document.
 * - Each section is editable inline with auto-save.
 * - Specialized Image Deep-Linking: click image to open Image Editor.
 * - Branded v1/v2 status chips & high-visibility toolbar.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Box,
  Typography,
  Button,
  CircularProgress,
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
  Alert,
  Checkbox,
  FormControlLabel,
  ClickAwayListener,
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
  codeBlockPlugin,
  codeMirrorPlugin,
  UndoRedo,
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  ListsToggle,
  InsertTable,
  CreateLink,
  Separator
} from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';
import ImageEditor from "./ImageEditor";

// Section mapping matching template
const SECTION_CONFIG = [
  { key: "process_summary", label: "Section 1: Process Summary" },
  { key: "applications_involved", label: "Section 4: Process Summary Attributes" },
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

const MetadataTable = ({ content }) => {
  const lines = content.split('\n').filter(l => !l.trim().startsWith('```'));
  const items = lines.map(l => {
    if (l.includes(':')) {
      const [k, ...v] = l.split(':');
      const cleanK = k.replace(/^[-*\s]+/, "").replace(/[*`]+/g, "").trim();
      return { k: cleanK, v: v.join(':').trim() };
    }
    return null;
  }).filter(Boolean);

  if (items.length === 0) return <Typography variant="caption" sx={{ color: '#8fa3c0' }}>No attributes defined yet.</Typography>;

  return (
    <Box sx={{ mt: 2, border: '1px solid var(--ae-border)', borderRadius: 2, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
         <tbody>
           {items.map((item, idx) => (
             <tr key={idx} style={{ borderBottom: '1px solid var(--ae-border)' }}>
               <td style={{ padding: '8px 12px', color: 'var(--ae-text-secondary)', fontSize: '9pt', fontWeight: 800, backgroundColor: 'var(--ae-surface)', width: '30%' }}>{item.k.replace(/_/g, ' ').toUpperCase()}</td>
               <td style={{ padding: '8px 12px', color: 'var(--ae-text-primary)', fontSize: '10pt' }}>{item.v}</td>
             </tr>
           ))}
         </tbody>
      </table>
    </Box>
  );
};

const MetadataForm = ({ content, onChange }) => {
  const lines = content.split('\n').filter(l => !l.trim().startsWith('```'));
  const items = lines.map(l => {
    if (l.includes(':')) {
      const [k, ...v] = l.split(':');
      return { k: k.trim(), v: v.join(':').trim() };
    }
    return { k: '', v: l.trim() };
  }).filter(i => i.k || i.v);

  const handleChange = (index, val) => {
    const updated = [...items];
    updated[index].v = val;
    const newContent = updated.map(i => `${i.k}: ${i.v}`).join('\n');
    onChange(newContent);
  };

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) 2fr', gap: 1.5, p: 3, bgcolor: 'background.paper', borderRadius: 2, border: '1px solid var(--ae-border-active)' }}>
      {items.map((item, idx) => (
        <React.Fragment key={idx}>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800, alignSelf: 'center', fontSize: '10px' }}>{item.k.replace(/_/g, ' ').toUpperCase()}</Typography>
          <TextField 
            variant="standard" 
            fullWidth 
            value={item.v} 
            onChange={(e) => handleChange(idx, e.target.value)}
            sx={{ "& .MuiInputBase-input": { color: 'text.primary', fontSize: '13.5px', py: 0.5 } }}
          />
        </React.Fragment>
      ))}
    </Box>
  );
};

const renderImageRefs = (text, captures, apiBase, onImageClick) => {
  if (typeof text !== 'string' || !text.includes('[IMAGE_REF')) return text;
  const parts = text.split(/(\[IMAGE_REF:?\s*[^\]\s]+\])/g);
  
  return parts.map((part, i) => {
    const match = part.match(/\[IMAGE_REF:?\s*([^\]\s]+)\]/);
    if (match) {
      const capId = match[1].trim();
      const cap = captures.find(c => c.id === capId);
      if (cap && (cap.image_url || cap.image_path)) {
        const src = `${apiBase.replace(/\/$/, '')}${cap.image_url}`;
        return (
          <Box key={i} sx={{ 
              my: 4, mx: 'auto', textAlign: 'center', maxWidth: '850px', width: '100%',
              bgcolor: 'var(--ae-surface)', p: 2, borderRadius: 2, border: '1px solid var(--ae-border)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)', cursor: 'pointer', transition: 'all 0.3s ease',
              '&:hover': { bgcolor: 'var(--ae-surface-hover)', borderColor: 'var(--ae-orange)', transform: 'translateY(-2px)' }
            }}
            onClick={(e) => { e.stopPropagation(); onImageClick?.(cap); }}
          >
            <img src={src} alt={cap.label} style={{ maxWidth: '100%', borderRadius: '6px', border: '1px solid var(--ae-border)', display: 'block', margin: '0 auto', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }} />
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1.5, fontStyle: 'italic', fontWeight: 600, fontSize: '0.75rem' }}>
              Step: {cap.label} (Click to Edit Image)
            </Typography>
          </Box>
        );
      }
    }
    return part;
  });
};

const MermaidSVG = ({ code, apiBase, token }) => {
  const [svgUrl, setSvgUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const fetchSvg = async () => {
      try {
        const res = await fetch(`${apiBase}/api/brd/render-mermaid`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ code })
        });
        if (res.ok && active) {
          const blob = await res.blob();
          setSvgUrl(URL.createObjectURL(blob));
        }
      } catch { } finally { if (active) setLoading(false); }
    };
    fetchSvg();
    return () => { active = false; if (svgUrl) URL.revokeObjectURL(svgUrl); };
  }, [code, apiBase, token]);

  if (loading) return <Box sx={{ p: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}><CircularProgress size={24} sx={{ color: '#F26522' }} /><Typography variant="caption" sx={{ color: 'text.secondary' }}>Fetching Diagram...</Typography></Box>;
  if (!svgUrl) return <Typography variant="caption" sx={{ color: 'error.main' }}>Rendering error — check mermaid syntax</Typography>;
  return <img src={svgUrl} alt="Process Diagram" style={{ maxWidth: '100%', filter: 'contrast(1.05)' }} />;
};

const processNode = (node, captures, apiBase, onImageClick) => {
  if (node == null) return node;
  
  if (typeof node === 'string') {
    // 1. Exact singular tag hiding (they will be handled by the Array context or string splitting)
    if (node.toLowerCase().trim() === '<u>' || node.toLowerCase().trim() === '</u>') return null;
    
    // 2. Handle string-contained pairs like <u>Test</u>
    if (node.toLowerCase().includes('<u>') && node.toLowerCase().includes('</u>')) {
      const parts = node.split(/(<u>.*?<\/u>)/gi);
      return parts.map((part, index) => {
        if (part.toLowerCase().startsWith('<u>')) {
          const content = part.replace(/<\/?u>/gi, '');
          return <span key={index} style={{ textDecoration: 'underline' }}>{renderImageRefs(content, captures, apiBase, onImageClick)}</span>;
        }
        return renderImageRefs(part, captures, apiBase, onImageClick);
      });
    }
    return renderImageRefs(node, captures, apiBase, onImageClick);
  }

  if (Array.isArray(node)) {
    const healed = [];
    let inUnderline = false;
    let underlineBuffer = [];

    node.forEach((child, i) => {
      const isStartU = typeof child === 'string' && child.toLowerCase().trim() === '<u>';
      const isEndU = typeof child === 'string' && child.toLowerCase().trim() === '</u>';

      if (isStartU) {
        inUnderline = true;
        underlineBuffer = [];
      } else if (isEndU) {
        if (inUnderline) {
          healed.push(<span key={`u-${i}`} style={{ textDecoration: 'underline' }}>{underlineBuffer}</span>);
          inUnderline = false;
        }
      } else if (inUnderline) {
        underlineBuffer.push(processNode(child, captures, apiBase, onImageClick));
      } else {
        healed.push(processNode(child, captures, apiBase, onImageClick));
      }
    });
    // Flush if unclosed
    if (inUnderline) healed.push(...underlineBuffer);
    return healed;
  }

  if (React.isValidElement(node)) {
    const updatedChildren = node.props.children ? processNode(node.props.children, captures, apiBase, onImageClick) : node.props.children;
    return React.cloneElement(node, { ...node.props, children: updatedChildren });
  }
  return node;
};

const useMarkdownComponents = (captures, apiBase, onImageClick, onMermaidEdit, token) => useMemo(() => ({
  p: ({ children }) => {
    // DIAGRAM HEALER: If a paragraph is just a naked mermaid diagram (no backticks), render it visually.
    const text = React.Children.toArray(children).map(c => typeof c === 'string' ? c : '').join('').trim();
    const isNakedMermaid = /^(graph|sequenceDiagram|gantt|classDiagram|stateDiagram|erDiagram|pie|journey|gitGraph)/i.test(text);
    
    if (isNakedMermaid) {
      return (
        <Box 
          onClick={(e) => { 
            // Open the specialized Mermaid logic editor
            onMermaidEdit?.({ original: text, code: text });
          }}
          sx={{ 
            my: 3, textAlign: 'center', p: 3, bgcolor: 'var(--ae-glass)', borderRadius: 2, cursor: 'pointer',
            border: '2px dashed var(--ae-border)', transition: 'all 0.2s',
            '&:hover': { borderColor: 'var(--ae-orange)', boxShadow: '0 0 20px var(--ae-orange-glow)' }
          }}
        >
          <MermaidSVG code={text} apiBase={apiBase} token={token} />
          <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary', fontWeight: 600 }}>Click to Edit Diagram Flow</Typography>
        </Box>
      );
    }

    return (
      <Typography sx={{ mb: 2, lineHeight: 1.6, fontSize: '10.5pt', color: 'text.primary' }}>
        {processNode(children, captures, apiBase, onImageClick)}
      </Typography>
    );
  },
  li: ({ children }) => (
    <li style={{ color: 'inherit', fontSize: '10.5pt', marginBottom: '8px' }}>
      {processNode(children, captures, apiBase, onImageClick)}
    </li>
  ),
  h3: ({ children }) => (
    <Typography variant="h6" sx={{ color: '#F26522', fontWeight: 700, mt: 3, mb: 1.5 }}>
      {processNode(children, captures, apiBase, onImageClick)}
    </Typography>
  ),
  table: ({ children }) => (
    <Box sx={{ overflowX: 'auto', my: 2, border: '1px solid var(--ae-border)', borderRadius: 1, maxWidth: '100%' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', color: 'inherit', fontSize: '9.5pt', tableLayout: 'fixed' }}>{children}</table>
    </Box>
  ),
  thead: ({ children }) => <thead style={{ backgroundColor: 'var(--ae-navy-mid)', color: '#fff' }}>{children}</thead>,
  th: ({ children }) => <th style={{ padding: '8px 10px', border: '1px solid var(--ae-border)', textAlign: 'left', fontWeight: 600, color: '#fff' }}>{children}</th>,
  td: ({ children }) => <td style={{ padding: '8px 10px', border: '1px solid var(--ae-border)', color: 'inherit', verticalAlign: 'top' }}>{children}</td>,
  pre: ({ children }) => {
    const child = React.Children.toArray(children)[0];
    if (child?.props?.className === 'language-mermaid') return <>{children}</>;
    return <pre style={{ overflowX: 'auto', background: 'var(--ae-surface)', padding: '12px', borderRadius: '6px', fontSize: '9.5pt', color: 'text.primary', border: '1px solid var(--ae-border)' }}>{children}</pre>;
  },
  code: ({ children, className }) => {
    const isMermaid = className === 'language-mermaid';
    if (isMermaid) {
      const code = String(children).replace(/\n$/, '');
      return (
        <Box 
          sx={{ 
            my: 3, textAlign: 'center', p: 3, bgcolor: 'var(--ae-glass)', borderRadius: 2, cursor: 'pointer',
            border: '2px dashed var(--ae-border)', transition: 'all 0.2s',
            '&:hover': { borderColor: 'var(--ae-orange)', boxShadow: '0 0 20px var(--ae-orange-glow)' }
          }}
          onClick={(e) => { e.stopPropagation(); onMermaidEdit?.({ code, original: children }); }}
        >
          <MermaidSVG code={code} apiBase={apiBase} token={token} />
          <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary', fontWeight: 600 }}>Click to Edit Diagram Logic</Typography>
        </Box>
      );
    }
    return <code style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 4px', borderRadius: '3px', fontSize: '9pt', color: '#F26522' }}>{children}</code>;
  },
  u: ({ children }) => <span style={{ textDecoration: 'underline' }}>{children}</span>,
}), [captures, apiBase, onImageClick, onMermaidEdit]);

const SectionBlock = ({ section, index, apiBase, token, onRefine, onHistory, captures, onImageClick, onMermaidEdit, setSections }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [localContent, setLocalContent] = useState(section?.content || "");
  const [saveStatus, setSaveStatus] = useState("idle");
  const timerRef = useRef(null);
  const lastSavedRef = useRef(section?.content);
  
  const handleSave = useCallback(async (forcedContent = null) => {
    const jsonContent = forcedContent !== null ? forcedContent : localContent;
    if (jsonContent === lastSavedRef.current) return;
    
    setSaveStatus("saving");
    try {
      const res = await fetch(`${apiBase}/api/brd/sections/${section.id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: jsonContent }),
      });
      if (res.ok) {
        const updated = await res.json();
        lastSavedRef.current = jsonContent;
        setSections(prev => prev.map(s => s.id === updated.id ? updated : s));
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        setSaveStatus("error");
      }
    } catch {
      setSaveStatus("error");
    }
  }, [localContent, section.id, apiBase, token, setSections]);

  const components = useMarkdownComponents(captures, apiBase, onImageClick, onMermaidEdit, token);

  useEffect(() => { setLocalContent(section?.content || ""); lastSavedRef.current = section?.content; }, [section]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => handleSave(), 1200);
    return () => clearTimeout(timerRef.current);
  }, [localContent, handleSave]);

  // Clean the content for preview: Remove "```markdown" wrappers
  const sanitizeContent = (text) => {
    if (!text) return "";
    let cleaned = text.trim();
    // Aggressively strip markdown code block wrappers (e.g. ```markdown ... ```)
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/gi, "");
    cleaned = cleaned.replace(/\n?```$/gi, "");
    return cleaned.trim();
  };

  const displayContent = sanitizeContent(localContent);

  const config = SECTION_CONFIG.find(c => c.key === section.section_key);
  const headerLabel = config ? config.label : section.title;

  return (
    <Box sx={{ mb: 6, position: "relative", "&:hover .section-tools": { opacity: 1 } }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1.5 }}>
        <Typography variant="h6" sx={{ color: "text.primary", fontWeight: 800, fontSize: "1.05rem", letterSpacing: '0.04em' }}>
          {headerLabel.toUpperCase()}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Chip label={`v${section.version}`} size="small" sx={{ height: 18, fontSize: '10px', bgcolor: 'var(--ae-surface)', color: 'text.secondary', border: '1px solid var(--ae-border)', fontWeight: 700 }} />
          {saveStatus === "saving" && <CircularProgress size={10} sx={{ color: "#F26522" }} />}
          {saveStatus === "saved" && <CheckCircleIcon sx={{ fontSize: 12, color: "#4caf50" }} />}
        </Box>
        <Box className="section-tools" sx={{ flex: 1, display: "flex", justifyContent: "flex-end", opacity: 0, transition: "opacity 0.2s" }}>
          <Tooltip title="AI Refine"><IconButton size="small" onClick={() => onRefine(section)} sx={{ color: "#F26522" }}><AutoFixHighIcon fontSize="small" /></IconButton></Tooltip>
          <Tooltip title="History"><IconButton size="small" onClick={() => onHistory(section)} sx={{ color: "#8fa3c0" }}><HistoryIcon fontSize="small" /></IconButton></Tooltip>
        </Box>
      </Box>

      {isEditing ? (
        section.section_key === "applications_involved" ? (
          <ClickAwayListener onClickAway={() => {
            handleSave();
            setIsEditing(false);
          }}>
            <Box
              onKeyDown={(e) => { 
                if (e.key === "Escape") {
                  handleSave();
                  setIsEditing(false);
                }
              }}
            >
              <MetadataForm content={localContent} onChange={setLocalContent} />
              <Box sx={{ mt: 2, display: "flex", justifyContent: "flex-end" }}>
                <Button size="small" variant="contained" onClick={() => { handleSave(); setIsEditing(false); }} sx={{ bgcolor: "#F26522", fontWeight: 700, fontSize: '11px', py: 0.5, px: 3 }}>Done</Button>
              </Box>
            </Box>
          </ClickAwayListener>
        ) : (
          <Box 
            onKeyDown={(e) => { 
              if (e.key === "Escape") {
                handleSave();
                setIsEditing(false);
              }
            }}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) {
                handleSave();
                setIsEditing(false);
              }
            }}
            sx={{ 
              bgcolor: 'background.paper', borderRadius: 1, color: 'text.primary', border: '1px solid var(--ae-border-active)', overflow: 'hidden',
              '& [role="textbox"]': { 
                color: 'text.primary !important', caretColor: '#F26522', minHeight: '200px', p: 4, lineHeight: 1.6, fontSize: '10.5pt', outline: 'none' 
              },
              '& .mdxeditor': { bgcolor: 'background.paper', color: 'text.primary !important' },
              '& [role="textbox"] p, & [role="textbox"] h1, & [role="textbox"] h2, & [role="textbox"] h3, & [role="textbox"] h4, & [role="textbox"] h5, & [role="textbox"] h6, & [role="textbox"] li, & [role="textbox"] td, & [role="textbox"] th': {
                color: 'text.primary !important',
              },
              '& .mdxeditor-toolbar': { 
                bgcolor: 'var(--ae-surface)', borderBottom: '1px solid var(--ae-border)', p: '6px 12px', display: 'flex', alignItems: 'center' 
              },
              '& .mdxeditor-toolbar button, & .mdxeditor-toolbar button svg': { color: 'text.secondary !important', fill: 'text.secondary !important' },
              '& .mdxeditor-toolbar select, & .mdxeditor-toolbar [role="combobox"]': { 
                color: 'text.primary !important', bgcolor: 'var(--ae-surface) !important', border: '1px solid var(--ae-border) !important', borderRadius: '4px', fontSize: '11px', px: 1 
              },
              '& .mdxeditor-toolbar button:hover': { bgcolor: 'rgba(242,101,34,0.08) !important', color: '#F26522 !important' },
              '& .mdxeditor-toolbar button:hover svg': { fill: '#F26522 !important' },
              '& .mdxeditor-toolbar button[data-active="true"]': { color: '#F26522 !important', bgcolor: 'rgba(242,101,34,0.15) !important' },
              '& .mdxeditor-toolbar button[data-active="true"] svg': { fill: '#F26522 !important' },
              '& .mdxeditor-root-contenteditable': { bgcolor: 'transparent !important' }
            }}
          >
            <MDXEditor
              markdown={localContent} onChange={setLocalContent} autoFocus
              contentEditableClassName="ae-brd-editor-content"
              plugins={[
                headingsPlugin(), listsPlugin(), quotePlugin(), thematicBreakPlugin(), tablePlugin(), markdownShortcutPlugin(),
                codeBlockPlugin({ defaultCodeBlockLanguage: 'mermaid' }),
                codeMirrorPlugin({ theme: 'dark', lsp: true }),
                toolbarPlugin({ toolbarContents: () => (
                  <> <UndoRedo /> <Separator /> <BoldItalicUnderlineToggles /> <Separator /> <BlockTypeSelect /> <ListsToggle /> <Separator /> <InsertTable /> <CreateLink /> </>
                )})
              ]}
            />
            <Box sx={{ bgcolor: "var(--ae-surface)", p: 1, display: "flex", justifyContent: "flex-end", borderTop: '1px solid var(--ae-border)' }}>
              <Button size="small" variant="contained" onClick={() => setIsEditing(false)} sx={{ bgcolor: "#F26522", fontWeight: 700, fontSize: '11px', py: 0.5, px: 3 }}>Done</Button>
            </Box>
          </Box>
        )
      ) : (
        <Box onClick={() => setIsEditing(true)} sx={{ cursor: "text", bgcolor: "rgba(255,255,255,0.01)", borderRadius: 1.5, p: 4, transition: "background 0.2s", "&:hover": { bgcolor: "rgba(255,255,255,0.03)" } }}>
          {section.section_key === "applications_involved" ? (
             <MetadataTable content={displayContent} />
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
              {displayContent || "*No content — click to edit*"}
            </ReactMarkdown>
          )}
        </Box>
      )}
      <Divider sx={{ mt: 4, opacity: 0.1 }} />
    </Box>
  );
};

export default function DocumentEditor({ projectId, sections, setSections, captures, onNext, onBack, token, apiBase, projectData, refreshProject }) {
  const [generating, setGenerating] = useState(false);
  const [versionDialog, setVersionDialog] = useState(null);
  const [versions, setVersions] = useState([]);
  const [refineDialog, setRefineDialog] = useState(null);
  const [refineInstruction, setRefineInstruction] = useState("");
  const [imageEditorCap, setImageEditorCap] = useState(null);
  const [mermaidEdit, setMermaidEdit] = useState(null);
  const [regenDialog, setRegenDialog] = useState(false);
  const [regenInstructions, setRegenInstructions] = useState("");
  const [forceRegen, setForceRegen] = useState(false);

  const handleRegenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`${apiBase}/api/brd/projects/${projectId}/regenerate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: regenInstructions, force_all: forceRegen }),
      });
      if (res.ok) {
        setRegenDialog(false);
        setRegenInstructions("");
        refreshProject?.();
      }
    } catch { } finally { setGenerating(false); }
  };

  const handleMermaidSave = () => {
    if (!mermaidEdit) return;
    const { section, oldCode, newCode } = mermaidEdit;
    
    // Replace the exact code block in content
    const updatedContent = section.content.replace(oldCode, newCode);
    
    setSections(prev => prev.map(s => s.id === section.id ? { ...s, content: updatedContent } : s));
    
    // Trigger immediate save to backend via SectionBlock's existing PUT logic
    // (Actually we need to tell the backend directly or wait for SectionBlock to sync)
    // The cleanest way is to update the local sections and let SectionBlock's useEffect handle it
    setMermaidEdit(null);
  };

  const sortedSections = useMemo(() => {
    return [...sections].sort((a, b) => {
      const idxA = SECTION_ORDER.indexOf(a.section_key);
      const idxB = SECTION_ORDER.indexOf(b.section_key);
      return (idxA !== -1 ? idxA : 999) - (idxB !== -1 ? idxB : 999);
    });
  }, [sections]);

  const openVersionHistory = async (section) => {
    setVersionDialog(section);
    try {
      const res = await fetch(`${apiBase}/api/brd/sections/${section.id}/versions`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setVersions(await res.json());
    } catch { setVersions([]); }
  };

  const handleRefine = async () => {
    if (!refineDialog || !refineInstruction.trim()) return;
    setGenerating(true);
    try {
      const res = await fetch(`${apiBase}/api/brd/sections/${refineDialog.id}/refine`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: refineInstruction }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSections(prev => prev.map(s => s.id === updated.id ? updated : s));
        setRefineDialog(null); setRefineInstruction("");
      }
    } catch { } finally { setGenerating(false); }
  };

  const restoreVersion = async (vId) => {
    if (!versionDialog) return;
    try {
      const res = await fetch(`${apiBase}/api/brd/sections/${versionDialog.id}/restore/${vId}`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const updated = await res.json();
        setSections(prev => prev.map(s => s.id === updated.id ? updated : s));
        setVersionDialog(null);
      }
    } catch { }
  };

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", bgcolor: "background.default", color: "text.primary", overflow: "hidden" }}>
      <Box sx={{ p: 3, borderBottom: "1px solid var(--ae-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
           <IconButton onClick={onBack} sx={{ color: "text.secondary" }}><ArrowBackIcon /></IconButton>
           <Typography variant="h6" sx={{ fontWeight: 800 }}>DOCUMENT EDITOR</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button 
            variant="outlined" 
            startIcon={<AutoFixHighIcon />} 
            onClick={() => setRegenDialog(true)}
            sx={{ color: "#F26522", borderColor: "rgba(242,101,34,0.3)", fontWeight: 700 }}
          >
            Regenerate BRD
          </Button>
          <Button variant="contained" endIcon={<FileDownloadIcon />} onClick={onNext} sx={{ bgcolor: "#F26522", fontWeight: 700 }}>Proceed to Export</Button>
        </Box>
      </Box>

      {/* Body */}
      <Box sx={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {projectData?.status === "generating" && (
           <Box sx={{ 
             position: 'absolute', inset: 0, zIndex: 100, 
             bgcolor: 'var(--ae-glass)', backdropFilter: 'blur(8px)',
             display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
             color: 'text.primary', textAlign: 'center', px: 4
           }}>
              <CircularProgress size={60} sx={{ color: '#F26522' }} />
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>AI IS REDESIGNING DOCUMENT</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>Integrating new instructions and evidence into the BRD. This will take ~60 seconds.</Typography>
              </Box>
           </Box>
        )}
        <Box sx={{ flex: 1, height: '100%', overflowY: "auto", px: "15%", py: 8 }} className="custom-scrollbar">
        {sections.length === 0 ? (
          <Alert severity="info" sx={{ bgcolor: 'rgba(2,136,209,0.1)', color: '#03a9f4' }}>No sections generated. Please go back to Step 2.</Alert>
        ) : (
          sortedSections.map((sec, idx) => (
            <SectionBlock 
              key={sec.id} 
              section={sec} 
              index={idx} 
              apiBase={apiBase} 
              token={token} 
              captures={captures} 
              onRefine={setRefineDialog} 
              onHistory={openVersionHistory} 
              onImageClick={setImageEditorCap}
              onMermaidEdit={(data) => setMermaidEdit({ section: sec, oldCode: data.original, newCode: data.code })}
              setSections={setSections}
            />
          ))
        )}
      </Box>

      <Dialog open={!!versionDialog} onClose={() => setVersionDialog(null)} maxWidth="sm" fullWidth PaperProps={{ sx: { bgcolor: "background.paper", border: "1px solid var(--ae-border)", borderRadius: 2 } }}>
        <DialogTitle sx={{ color: "text.primary" }}>Version History: {versionDialog?.title}</DialogTitle>
        <DialogContent>
           <List>{versions.map(v => (<ListItem key={v.id} secondaryAction={<Button size="small" onClick={() => restoreVersion(v.id)} sx={{ color: "#F26522" }}>Restore</Button>}><ListItemText primary={`Version ${v.version_number}`} secondary={new Date(v.created_at).toLocaleString()} primaryTypographyProps={{ color: "#fff" }} secondaryTypographyProps={{ color: "#8fa3c0" }} /></ListItem>))}</List>
        </DialogContent>
      </Dialog>
      <Dialog open={!!refineDialog} onClose={() => setRefineDialog(null)} maxWidth="sm" fullWidth PaperProps={{ sx: { bgcolor: "#112240", borderRadius: 1 } }}>
        <DialogTitle sx={{ color: "#fff" }}>AI Refine</DialogTitle>
        <DialogContent><TextField fullWidth multiline rows={4} value={refineInstruction} onChange={(e) => setRefineInstruction(e.target.value)} placeholder="Refinement instructions..." sx={{ mt: 1, bgcolor: "#fff", borderRadius: 1 }} /></DialogContent>
        <DialogActions sx={{ p: 2 }}><Button onClick={() => setRefineDialog(null)} sx={{ color: "#8fa3c0" }}>Cancel</Button><Button variant="contained" onClick={handleRefine} disabled={generating} sx={{ bgcolor: "#F26522" }}>Refine Content</Button></DialogActions>
      </Dialog>
      {imageEditorCap && (
        <ImageEditor open={!!imageEditorCap} onClose={() => setImageEditorCap(null)} capture={imageEditorCap} allCaptures={captures} onSwitchCapture={setImageEditorCap} apiBase={apiBase} token={token} onSaved={() => setImageEditorCap(null)} />
      )}

      {/* Mermaid Live Editor Dialog */}
      <Dialog open={!!mermaidEdit} onClose={() => setMermaidEdit(null)} maxWidth="md" fullWidth PaperProps={{ sx: { bgcolor: "#0f172a", borderRadius: 2, border: '1px solid rgba(255,255,255,0.1)' } }}>
        <DialogTitle sx={{ color: "#fff", display: 'flex', alignItems: 'center', gap: 1.5 }}>
           <RefreshIcon sx={{ color: '#F26522' }} /> Edit Diagram Logic (Mermaid)
        </DialogTitle>
        <DialogContent>
           <Typography variant="body2" sx={{ color: "#8fa3c0", mb: 2 }}>Modify the mermaid syntax below and click Save to update the diagram visually.</Typography>
           <TextField
             fullWidth multiline rows={12}
             value={mermaidEdit?.newCode || ""}
             onChange={(e) => setMermaidEdit(prev => ({ ...prev, newCode: e.target.value }))}
             sx={{ 
               input: { color: "#fff" },
               '& .MuiInputBase-root': { color: '#fff', fontFamily: 'monospace', fontSize: '13px', bgcolor: 'rgba(0,0,0,0.3)', p: 2 }
             }}
           />
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
           <Button onClick={() => setMermaidEdit(null)} sx={{ color: "#8fa3c0" }}>Cancel</Button>
           <Button variant="contained" onClick={handleMermaidSave} sx={{ bgcolor: "#F26522", fontWeight: 700, px: 4 }}>Update Diagram</Button>
        </DialogActions>
      </Dialog>

      {/* Regeneration Dialog */}
      <Dialog open={regenDialog} onClose={() => !generating && setRegenDialog(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { bgcolor: "#112240", borderRadius: 3 } }}>
        <DialogTitle sx={{ color: "#fff", display: 'flex', alignItems: 'center', gap: 1.5 }}>
           <AutoFixHighIcon sx={{ color: '#F26522' }} /> Regenerate BRD Document
        </DialogTitle>
        <DialogContent>
           <Typography variant="body2" sx={{ color: "#8fa3c0", mb: 2 }}>Add instructions for the AI to redesign the document.</Typography>
           <TextField 
             fullWidth multiline rows={4} 
             value={regenInstructions} 
             onChange={(e) => setRegenInstructions(e.target.value)} 
             placeholder="e.g. Focus more on exceptions, shorten the summary..." 
             sx={{ bgcolor: 'rgba(255,255,255,0.03)', mb: 2, '& .MuiInputBase-root': { color: '#fff' } }}
           />
           <FormControlLabel
             control={<Checkbox checked={forceRegen} onChange={(e) => setForceRegen(e.target.checked)} sx={{ color: '#F26522', '&.Mui-checked': { color: '#F26522' } }} />}
             label={<Typography variant="body2" sx={{ color: '#fff' }}>Overwrite manually edited sections</Typography>}
           />
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
           <Button onClick={() => setRegenDialog(false)} disabled={generating} sx={{ color: "#8fa3c0" }}>Cancel</Button>
           <Button variant="contained" onClick={handleRegenerate} disabled={generating} sx={{ bgcolor: "#F26522", fontWeight: 700 }}>
             {generating || projectData?.status === "generating" ? "AI Working..." : "Start Regeneration"}
           </Button>
        </DialogActions>
      </Dialog>
      </Box>
    </Box>
  );
}

const SECTION_ORDER = SECTION_CONFIG.map(c => c.key);
