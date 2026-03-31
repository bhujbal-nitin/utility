import { useState, useRef, useEffect } from "react";
import {
    Box,
    IconButton,
    Typography,
    TextField,
    Tooltip,
    Menu,
    MenuItem,
    ListItemIcon,
    ListItemText,
    LinearProgress,
    Alert,
    Snackbar,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { useAuth } from "../../context/AuthContext";
import SendIcon from "@mui/icons-material/Send";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import DescriptionIcon from "@mui/icons-material/Description";
import TableChartIcon from "@mui/icons-material/TableChart";
import CloseIcon from "@mui/icons-material/Close";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";

const UIPATH_CONFIG = {
    placeholder: "Ask about UiPath migration or describe your process...",
    welcomeTitle: "UiPath to AutomationEdge Migration",
    welcomeSubtitle: "Upload your UiPath process files (XAML, JSON, ZIP). I'll help you map state machines into AE DAG workflows.",
};

const FileUploadArea = ({ onFileSelect, onFileRemove, acceptedFiles = ".xaml,.json,.txt,.csv,.zip,.nupkg" }) => {
    const [files, setFiles] = useState([]);
    const [anchorEl, setAnchorEl] = useState(null);
    const [uploadProgress, setUploadProgress] = useState({});
    const [uploadStatus, setUploadStatus] = useState({});
    const fileInputRef = useRef(null);
    const open = Boolean(anchorEl);

    const handleFileClick = (event) => setAnchorEl(event.currentTarget);
    const handleClose = () => setAnchorEl(null);

    const handleFileUpload = (event) => {
        const selectedFiles = Array.from(event.target.files);
        const newFiles = selectedFiles.map(file => ({
            file,
            id: `${file.name}-${Date.now()}-${Math.random()}`,
            name: file.name,
            size: file.size,
            type: file.type,
            progress: 0,
            status: 'uploading'
        }));

        setFiles(prev => [...prev, ...newFiles]);
        handleClose();

        newFiles.forEach((fileObj) => {
            let progress = 0;
            const interval = setInterval(() => {
                progress += 20;
                setUploadProgress(prev => ({ ...prev, [fileObj.id]: progress }));
                if (progress >= 100) {
                    clearInterval(interval);
                    setUploadStatus(prev => ({ ...prev, [fileObj.id]: 'success' }));
                    onFileSelect(fileObj.file);
                }
            }, 100);
        });
    };

    const handleRemoveFile = (fileId) => {
        setFiles(prev => prev.filter(f => f.id !== fileId));
        onFileRemove(fileId);
    };

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + ['Bytes', 'KB', 'MB', 'GB'][i];
    };

    const getFileIcon = (fileName) => {
        const ext = fileName.split('.').pop().toLowerCase();
        if (ext === 'xaml' || ext === 'xml') return <DescriptionIcon sx={{ color: '#F26522' }} />;
        if (ext === 'json' || ext === 'csv') return <TableChartIcon sx={{ color: '#4caf82' }} />;
        if (ext === 'zip' || ext === 'nupkg') return <InsertDriveFileIcon sx={{ color: '#8fa3c0' }} />;
        return <InsertDriveFileIcon sx={{ color: '#8fa3c0' }} />;
    };

    return (
        <Box sx={{ position: 'relative' }}>
            {files.length > 0 && (
                <Box sx={{ position: 'absolute', bottom: '100%', left: 0, mb: 2, width: 320, maxHeight: 150, overflowY: 'auto', background: 'rgba(10,22,40,0.95)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '8px', zIndex: 20, p: 0.5 }}>
                    {files.map((file) => (
                        <Box key={file.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, mb: 0.5, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '6px' }}>
                            {getFileIcon(file.name)}
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography sx={{ fontSize: '12px', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</Typography>
                                    <Typography sx={{ fontSize: '10px', color: '#506280' }}>({formatFileSize(file.size)})</Typography>
                                </Box>
                                {uploadStatus[file.id] !== 'success' && (
                                    <LinearProgress variant="determinate" value={uploadProgress[file.id] || 0} sx={{ mt: 0.5, height: 2, borderRadius: 1, bgcolor: 'rgba(255,255,255,0.07)', '& .MuiLinearProgress-bar': { bgcolor: '#F26522' } }} />
                                )}
                                {uploadStatus[file.id] === 'success' && (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                                        <CheckCircleOutlineIcon sx={{ fontSize: 12, color: '#4caf82' }} />
                                        <Typography sx={{ fontSize: '10px', color: '#4caf82' }}>Upload complete</Typography>
                                    </Box>
                                )}
                            </Box>
                            <Tooltip title="Remove">
                                <IconButton size="small" onClick={() => handleRemoveFile(file.id)} sx={{ width: 20, height: 20, color: '#506280', '&:hover': { color: '#ff4444' } }}>
                                    <CloseIcon sx={{ fontSize: 14 }} />
                                </IconButton>
                            </Tooltip>
                        </Box>
                    ))}
                </Box>
            )}

            <Tooltip title="Attach files">
                <IconButton onClick={handleFileClick} sx={{ width: 34, height: 34, borderRadius: '8px', background: 'rgba(255,255,255,0.04)', color: '#8fa3c0', '&:hover': { background: 'rgba(242,101,34,0.18)', color: '#F26522' } }}>
                    <AttachFileIcon sx={{ fontSize: 18 }} />
                </IconButton>
            </Tooltip>

            <Menu anchorEl={anchorEl} open={open} onClose={handleClose} PaperProps={{ sx: { background: '#112240', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', mt: 1 } }}>
                <MenuItem onClick={() => fileInputRef.current?.click()} sx={{ color: '#e8edf5', '&:hover': { background: 'rgba(242,101,34,0.18)' } }}>
                    <ListItemIcon><InsertDriveFileIcon sx={{ color: '#F26522', fontSize: 20 }} /></ListItemIcon>
                    <ListItemText primary="Upload UiPath Files" secondary="XAML, JSON, ZIP" secondaryTypographyProps={{ sx: { color: '#8fa3c0', fontSize: '11px' } }} />
                </MenuItem>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept={acceptedFiles} multiple style={{ display: 'none' }} />
            </Menu>
        </Box>
    );
};

const AELogoMark = () => (
    <img src="/ae-icon.png" alt="AE" style={{ width: "20px", height: "20px", objectFit: "contain" }} />
);

const AEAvatar = () => (
    <Box sx={{ width: 30, height: 30, borderRadius: "8px", background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
        <AELogoMark />
    </Box>
);

const UserAvatar = () => (
    <Box sx={{ width: 30, height: 30, borderRadius: "8px", background: "#1a3460", border: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#8fa3c0" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
    </Box>
);

function MessageBubble({ message }) {
    const isUser = message.role === "user";
    const hasFile = message.fileInfo;
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        const textToCopy = message.jsonData ? (typeof message.jsonData === 'string' ? message.jsonData : JSON.stringify(message.jsonData, null, 2)) : message.content;
        navigator.clipboard.writeText(textToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1.2, flexDirection: isUser ? "row-reverse" : "row", animation: "msgIn 0.25s ease", "@keyframes msgIn": { from: { opacity: 0, transform: "translateY(10px)" }, to: { opacity: 1, transform: "translateY(0)" } } }}>
            {isUser ? <UserAvatar /> : <AEAvatar />}
            <Box sx={{ maxWidth: isUser ? "68%" : "85%", px: 2, py: 1.4, borderRadius: isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px", background: isUser ? "linear-gradient(135deg, #F26522, #c94e10)" : "rgba(255,255,255,0.04)", border: isUser ? "none" : "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column", gap: 0.6, overflow: "hidden" }}>
                {hasFile && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, background: 'rgba(255,255,255,0.04)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <InsertDriveFileIcon sx={{ color: isUser ? '#fff' : '#F26522', fontSize: 20 }} />
                        <Box sx={{ flex: 1 }}>
                            <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#fff' }}>{message.fileInfo.name}</Typography>
                            <Typography sx={{ fontSize: '10px', color: isUser ? 'rgba(255,255,255,0.7)' : '#8fa3c0' }}>{message.fileInfo.size}</Typography>
                        </Box>
                    </Box>
                )}
                {message.content && <Typography sx={{ fontSize: "13.5px", lineHeight: 1.6, color: isUser ? "#fff" : "#e8edf5", whiteSpace: "pre-wrap" }}>{message.content}</Typography>}
                {message.jsonData && (
                    <Box sx={{ mt: 1, position: 'relative', background: '#0a1628', borderRadius: 1, p: 1.5, border: '1px solid #1a3460', width: '100%' }}>
                        <Tooltip title={copied ? "Copied!" : "Copy Details"}>
                            <IconButton size="small" onClick={handleCopy} sx={{ position: 'absolute', top: 8, right: 8, color: copied ? '#4caf82' : '#8fa3c0', background: 'rgba(255,255,255,0.05)', '&:hover': { color: '#fff', background: 'rgba(255,255,255,0.1)' } }}>
                                {copied ? <CheckCircleOutlineIcon sx={{ fontSize: 16 }} /> : <ContentCopyIcon sx={{ fontSize: 16 }} />}
                            </IconButton>
                        </Tooltip>
                        <Box sx={{ maxHeight: '400px', overflowY: 'auto', overflowX: 'hidden', mt: 3, pr: 1 }}>
                            <pre style={{ margin: 0, fontSize: '12px', color: '#a5d6ff', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {typeof message.jsonData === 'string' ? message.jsonData : JSON.stringify(message.jsonData, null, 2)}
                            </pre>
                        </Box>
                    </Box>
                )}
                <Typography sx={{ fontSize: "10px", color: isUser ? "rgba(255,255,255,0.55)" : "#506280", alignSelf: "flex-end" }}>{message.time}</Typography>
            </Box>
        </Box>
    );
}

function TypingIndicator() {
    return (
        <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1.2 }}>
            <AEAvatar />
            <Box sx={{ px: 2, py: 1.6, borderRadius: "14px 14px 14px 4px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", gap: 0.6 }}>
                {[0, 1, 2].map((i) => (
                    <Box key={i} sx={{ width: 7, height: 7, borderRadius: "50%", background: "#506280", animation: "typing 1.2s ease infinite", animationDelay: `${i * 0.18}s`, "@keyframes typing": { "0%,60%,100%": { transform: "translateY(0)", opacity: 0.4 }, "30%": { transform: "translateY(-5px)", opacity: 1 } } }} />
                ))}
            </Box>
        </Box>
    );
}

export default function UiPathChatWindow({ tool, onBack }) {
    const { token } = useAuth();
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const [showWelcome, setShowWelcome] = useState(true);
    const [uploadedFiles, setUploadedFiles] = useState([]);
    const [resetKey, setResetKey] = useState(0);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
    const messagesEndRef = useRef(null);

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isTyping]);
    const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const handleFileSelect = (file) => {
        setUploadedFiles(prev => [...prev, file]);
        setSnackbar({ open: true, message: `File "${file.name}" ready for analysis`, severity: 'success' });
    };
    const handleFileRemove = (fileId) => setUploadedFiles(prev => prev.filter((_, i) => i.toString() !== fileId));
    
    const handleSend = async (text) => {
        const content = (text || input).trim();
        if (!content && uploadedFiles.length === 0) return;
        setShowWelcome(false);
        setInput("");
        
        let fileInfo = null;
        let finalContent = content;

        if (uploadedFiles.length > 0) {
            if (uploadedFiles.length === 1) {
                fileInfo = { name: uploadedFiles[0].name, size: `${(uploadedFiles[0].size / 1024).toFixed(2)} KB`, type: uploadedFiles[0].type };
                if (!content) finalContent = `📌 Uploaded file: ${uploadedFiles[0].name} (${(uploadedFiles[0].size / 1024).toFixed(2)} KB)`;
            } else {
                const totalSize = uploadedFiles.reduce((sum, f) => sum + f.size, 0);
                fileInfo = { name: `${uploadedFiles.length} files attached`, size: `${(totalSize / 1024).toFixed(2)} KB`, type: 'multiple' };
                if (!content) finalContent = `📌 Uploaded ${uploadedFiles.length} files (${(totalSize / 1024).toFixed(2)} KB)`;
            }
        }

        setMessages((prev) => [...prev, { role: "user", content: finalContent, fileInfo, time: now() }]);
        setUploadedFiles([]);
        setResetKey(prev => prev + 1);
        setIsTyping(true);

        try {
            if (uploadedFiles.length === 0) {
                setTimeout(() => {
                    setIsTyping(false);
                    setMessages((prev) => [...prev, { role: "assistant", content: "Please attach a UiPath file for analysis.", time: now() }]);
                }, 1000);
                return;
            }

            const formData = new FormData();
            uploadedFiles.forEach(file => formData.append("files", file));
            if (content) formData.append("prompt", content);


            const res = await fetch("/api/migration/uipath/analyze", {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` },
                body: formData,
            });

            const data = await res.json();
            setIsTyping(false);

            if (res.ok && data.success) {
                setMessages((prev) => [...prev, { role: "assistant", content: `Analysis complete for **${data.fileName}**!`, jsonData: data.data, time: now() }]);
            } else {
                setMessages((prev) => [...prev, { role: "assistant", content: `❌ Error analyzing file: ${data.detail || data.message || 'Unknown error'}`, time: now() }]);
            }
        } catch (err) {
            setIsTyping(false);
            setMessages((prev) => [...prev, { role: "assistant", content: "❌ Error connecting to the 8004 generic API server.", time: now() }]);
        }
    };

    const handleKeyDown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } };
    const handleClearChat = () => { setMessages([]); setShowWelcome(true); setUploadedFiles([]); setSnackbar({ open: true, message: 'Cleared', severity: 'info' }); };
    
    return (
        <Box sx={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", animation: "chatEnter 0.25s ease", "@keyframes chatEnter": { from: { opacity: 0, transform: "translateY(8px)" }, to: { opacity: 1, transform: "translateY(0)" } } }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 2.5, py: 1.6, borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(10,22,40,0.5)", backdropFilter: "blur(10px)", flexShrink: 0 }}>
                <Tooltip title="Back"><IconButton onClick={onBack} size="small" sx={{ width: 32, height: 32, border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", background: "rgba(255,255,255,0.04)", color: "#8fa3c0", "&:hover": { background: "rgba(255,255,255,0.07)", color: "#e8edf5" } }}><ArrowBackIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                <Box sx={{ flex: 1, display: "flex", alignItems: "center", gap: 1.5 }}>
                    <Typography sx={{ fontFamily: "'Syne', sans-serif", fontSize: "15px", fontWeight: 700, color: "#fff" }}>UiPath to AE Migration</Typography>
                </Box>
                <Tooltip title="Clear chat"><Box onClick={handleClearChat} sx={{ display: "flex", alignItems: "center", gap: 0.7, px: 1.5, py: 0.7, border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", background: "rgba(255,255,255,0.04)", color: "#506280", cursor: "pointer", fontSize: "12px", "&:hover": { background: "rgba(255,255,255,0.07)", color: "#8fa3c0" } }}><DeleteOutlineIcon sx={{ fontSize: 15 }} />Clear</Box></Tooltip>
            </Box>

            <Box sx={{ flex: 1, overflowY: "auto", px: 2.5, py: 3, display: "flex", flexDirection: "column", gap: 2 }}>
                {showWelcome && messages.length === 0 && (
                    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 1.5, flex: 1, justifyContent: "center", maxWidth: 560, mx: "auto", animation: "fadeUp 0.4s ease", "@keyframes fadeUp": { from: { opacity: 0, transform: "translateY(16px)" }, to: { opacity: 1, transform: "translateY(0)" } } }}>
                        <AELogoMark />
                        <Typography sx={{ fontFamily: "'Syne', sans-serif", fontSize: "22px", fontWeight: 700, color: "#fff", letterSpacing: "-0.4px" }}>{UIPATH_CONFIG.welcomeTitle}</Typography>
                        <Typography sx={{ fontSize: "13.5px", color: "#8fa3c0", lineHeight: 1.6, maxWidth: 400 }}>{UIPATH_CONFIG.welcomeSubtitle}</Typography>
                    </Box>
                )}
                {messages.map((msg, i) => <MessageBubble key={i} message={msg} />)}
                {isTyping && <TypingIndicator />}
                <div ref={messagesEndRef} />
            </Box>

            <Box sx={{ px: 2.5, pt: 1.8, pb: 2, borderTop: "1px solid rgba(255,255,255,0.07)", background: "rgba(10,22,40,0.5)", backdropFilter: "blur(10px)", flexShrink: 0, display: "flex", flexDirection: "column", gap: 0.8 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.2, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "12px", px: 1.5, py: 0.5, "&:focus-within": { borderColor: "rgba(242,101,34,0.45)", boxShadow: "0 0 0 3px rgba(242,101,34,0.18)" } }}>
                    <FileUploadArea key={resetKey} onFileSelect={handleFileSelect} onFileRemove={handleFileRemove} />
                    <TextField multiline maxRows={4} fullWidth value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder={UIPATH_CONFIG.placeholder} variant="standard" InputProps={{ disableUnderline: true, sx: { fontSize: "13.5px", lineHeight: 1.55, pt: 0.5, pb: 0.5 } }} sx={{ flex: 1, "& .MuiInputBase-root": { color: "#e8edf5", width: "100%" }, "& .MuiInputBase-input::placeholder": { color: "#506280", opacity: 1 } }} />
                    <Tooltip title="Send">
                        <Box onClick={() => handleSend()} sx={{ width: 34, height: 34, borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", cursor: (input.trim() || uploadedFiles.length > 0) && !isTyping ? "pointer" : "not-allowed", background: (input.trim() || uploadedFiles.length > 0) && !isTyping ? "#F26522" : "rgba(255,255,255,0.04)", color: (input.trim() || uploadedFiles.length > 0) && !isTyping ? "#fff" : "#506280", transition: "all 0.2s ease" }}><SendIcon sx={{ fontSize: 15 }} /></Box>
                    </Tooltip>
                </Box>
                <Typography sx={{ fontSize: "11px", color: "#506280", pl: 0.3 }}>Press Enter to send · Shift+Enter for new line</Typography>
            </Box>

            <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
                <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} sx={{ background: snackbar.severity === 'success' ? '#1a3460' : '#112240', color: '#fff', border: `1px solid ${snackbar.severity === 'success' ? '#4caf82' : '#F26522'}` }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}
