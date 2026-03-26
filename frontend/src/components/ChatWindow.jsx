import { useState, useRef, useEffect } from "react";
import {
  Box,
  IconButton,
  Typography,
  TextField,
  Tooltip,
  Button,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import SendIcon from "@mui/icons-material/Send";
import DownloadIcon from "@mui/icons-material/Download";
import { useAuth } from "../context/AuthContext";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";

/* ── Tool-specific config ─────────────────────────────────────────────────── */
const TOOL_CONFIG = {
  brd: {
    placeholder: "Describe your project or process to generate a BRD...",
    welcomeTitle: "BRD Creation",
    welcomeSubtitle:
      "Describe your project requirements and I'll generate a comprehensive Business Requirement Document.",
    suggestions: [
      "Create a BRD for an employee onboarding automation workflow",
      "Generate BRD for a customer ticket routing system",
      "BRD for invoice processing automation using RPA",
    ],
  },
  proposal: {
    placeholder:
      "Describe the client, their needs, and the solution you want to propose...",
    welcomeTitle: "Proposal Creation",
    welcomeSubtitle:
      "Tell me about your client and their challenges — I'll help craft a compelling proposal.",
    suggestions: [
      "Create a proposal for a banking client to automate KYC workflows",
      "Write a proposal for migrating a healthcare firm from UiPath to AE",
      "Proposal for IT helpdesk automation for a 5000-employee enterprise",
    ],
  },
  "ai-studio": {
    placeholder: "Describe the automation workflow you want to build...",
    welcomeTitle: "AI Studio",
    welcomeSubtitle:
      "Design intelligent automation workflows using natural language. I'll help you architect and build them.",
    suggestions: [
      "Build an AI agent that classifies and routes IT support tickets",
      "Create a document processing workflow for invoice extraction",
      "Design a conversational bot for HR query resolution",
    ],
  },
  migration: {
    placeholder:
      "Tell me your current RPA platform and what you want to migrate...",
    welcomeTitle: "Migration to AE",
    welcomeSubtitle:
      "Planning a migration from UiPath, Automation Anywhere, or Blue Prism? Let's map out your migration path.",
    suggestions: [
      "I have 50 UiPath bots — help me plan migration to AutomationEdge",
      "Compare Automation Anywhere vs AutomationEdge features",
      "What's the migration effort for Blue Prism workflows?",
    ],
  },
};

/* ── AE Logo mark (small) ─────────────────────────────────────────────────── */
const AEAvatar = () => (
  <Box
    sx={{
      width: 30,
      height: 30,
      borderRadius: "8px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      overflow: "hidden"
    }}
  >
    <img src="/ae-icon.png" alt="AE" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
  </Box>
);

const UserAvatar = () => (
  <Box
    sx={{
      width: 30,
      height: 30,
      borderRadius: "8px",
      background: "#1a3460",
      border: "1px solid rgba(255,255,255,0.07)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      color: "#8fa3c0",
    }}
  >
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  </Box>
);

/* ── Message Bubble ───────────────────────────────────────────────────────── */
function MessageBubble({ message, token }) {
  const isUser = message.role === "user";

  const handleDownload = async (filename) => {
    try {
      const response = await fetch(`/download/${filename}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error("Download failed! Ensure you are authenticated.");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e) {
      console.error(e);
      alert(e.message);
    }
  };

  const CodeBlock = ({ children, className, ...props }) => {
    const match = /language-(\w+)/.exec(className || "");
    const language = match ? match[1] : "";
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
      navigator.clipboard.writeText(String(children).replace(/\n$/, ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    if (!className) {
      return (
        <code className={className} {...props} style={{ 
          background: "rgba(0,0,0,0.2)", 
          padding: "2px 4px", 
          borderRadius: "4px", 
          fontFamily: "monospace", 
          fontSize: "12px" 
        }}>
          {children}
        </code>
      );
    }

    return (
      <Box sx={{ position: "relative", my: 1.5, borderRadius: "8px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" }}>
        <Box sx={{ 
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "center", 
          background: "#1e1e1e", 
          px: 1.5, 
          py: 0.8, 
          borderBottom: "1px solid rgba(255,255,255,0.05)" 
        }}>
          <Typography sx={{ fontSize: "10px", color: "#8fa3c0", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            {language}
          </Typography>
          <IconButton size="small" onClick={handleCopy} sx={{ color: copied ? "#4caf82" : "#8fa3c0", p: 0.5 }}>
            {copied ? <CheckIcon sx={{ fontSize: 13 }} /> : <ContentCopyIcon sx={{ fontSize: 13 }} />}
          </IconButton>
        </Box>
        <SyntaxHighlighter
          style={vscDarkPlus}
          language={language}
          PreTag="div"
          customStyle={{
            margin: 0,
            padding: "16px",
            fontSize: "12px",
            background: "#0d1117",
          }}
          {...props}
        >
          {String(children).replace(/\n$/, "")}
        </SyntaxHighlighter>
      </Box>
    );
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "flex-end",
        gap: 1.2,
        flexDirection: isUser ? "row-reverse" : "row",
        animation: "msgIn 0.25s ease",
        "@keyframes msgIn": {
          from: { opacity: 0, transform: "translateY(10px)" },
          to:   { opacity: 1, transform: "translateY(0)" },
        },
      }}
    >
      {isUser ? <UserAvatar /> : <AEAvatar />}
      <Box
        sx={{
          maxWidth: "68%",
          px: 2,
          py: 1.4,
          borderRadius: isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
          background: isUser
            ? "linear-gradient(135deg, #F26522, #c94e10)"
            : "rgba(255,255,255,0.04)",
          border: isUser ? "none" : "1px solid rgba(255,255,255,0.07)",
          display: "flex",
          flexDirection: "column",
          gap: 0.6,
        }}
      >
        <Box
          sx={{
            fontSize: "13.5px",
            lineHeight: 1.6,
            color: isUser ? "#fff" : "#e8edf5",
            "& p": { m: 0, pb: 1 },
            "& pre": { background: "rgba(0,0,0,0.3)", p: 1.5, borderRadius: "6px", overflowX: "auto" },
            "& code": { fontFamily: "monospace", fontSize: "12px", background: "rgba(0,0,0,0.2)", p: "2px 4px", borderRadius: "4px" },
          }}
        >
          {isUser ? (
            <Typography sx={{ whiteSpace: "pre-wrap", fontSize: "13.5px" }}>{message.content}</Typography>
          ) : (
            <ReactMarkdown components={{ code: CodeBlock }}>{message.content}</ReactMarkdown>
          )}
        </Box>
        <Typography
          sx={{
            fontSize: "10px",
            color: isUser ? "rgba(255,255,255,0.55)" : "#506280",
            alignSelf: "flex-end",
          }}
        >
          {message.tokens ? `Input: ${message.tokens.prompt} | Output: ${message.tokens.candidates} | Total: ${message.tokens.total} • ` : ""}{message.time}
        </Typography>
        
        {/* Render Artifact Download Buttons (Only Zips/Flows) */}
        {message.artifacts && message.artifacts.length > 0 && (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1 }}>
            {message.artifacts
              .filter(art => ["dialogs", "wa_flow", "wa_meta"].includes(art.kind))
              .map((art, idx) => (
                <Button
                  key={idx}
                  variant="outlined"
                  startIcon={<DownloadIcon />}
                  size="small"
                  onClick={() => handleDownload(art.filename)}
                  sx={{
                    color: "#e8edf5",
                    borderColor: "rgba(255,255,255,0.2)",
                    textTransform: "none",
                    fontSize: "11px",
                    "&:hover": { borderColor: "#F26522", background: "rgba(242,101,34,0.1)" }
                  }}
                >
                  Download {art.filename}
                </Button>
              ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

/* ── Typing Indicator ─────────────────────────────────────────────────────── */
function TypingIndicator() {
  return (
    <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1.2 }}>
      <AEAvatar />
      <Box
        sx={{
          px: 2,
          py: 1.6,
          borderRadius: "14px 14px 14px 4px",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.07)",
          display: "flex",
          alignItems: "center",
          gap: 0.6,
        }}
      >
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            sx={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#506280",
              animation: "typing 1.2s ease infinite",
              animationDelay: `${i * 0.18}s`,
              "@keyframes typing": {
                "0%,60%,100%": { transform: "translateY(0)", opacity: 0.4 },
                "30%": { transform: "translateY(-5px)", opacity: 1 },
              },
            }}
          />
        ))}
      </Box>
    </Box>
  );
}

/* ── ChatWindow ───────────────────────────────────────────────────────────── */
export default function ChatWindow({ tool, onBack }) {
  const config = TOOL_CONFIG[tool.id] || TOOL_CONFIG["brd"];
  const { token } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [sessionId, setSessionId] = useState(null);
  const [totalChatTokens, setTotalChatTokens] = useState(0);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    setMessages([]);
    setInput("");
    setIsTyping(false);
    setShowWelcome(true);
    setSessionId(null);
    setTotalChatTokens(0);
  }, [tool.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const now = () =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const handleSend = async (text) => {
    const content = (text || input).trim();
    if (!content) return;
    
    setShowWelcome(false);
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content, time: now() }]);
    setIsTyping(true);

    try {
      let currentSessionId = sessionId;
      let isFirst = false;

      // Create session on first message
      if (!currentSessionId) {
        isFirst = true;
        const startRes = await axios.post(
          "/api/start",
          { usecase_name: tool.id },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        currentSessionId = startRes.data.session_id;
        setSessionId(currentSessionId);
      }

      // Call Chat SSE Endpoint manually with fetch to read stream
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          session_id: currentSessionId,
          usecase_name: tool.id,
          message: content,
          is_first: isFirst,
        }),
      });

      if (!response.ok) {
        throw new Error("Chat request failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let botTextState = "";
      let botArtifactsState = [];
      let latestTokens = null;
      let hasAddedMessage = false;

      while (true) {
        let { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        let chunkHasData = false;
        
        for (const line of lines) {
          if (line.trim().startsWith("data: ")) {
            chunkHasData = true;
            try {
              const data = JSON.parse(line.trim().substring(6));
              
              if (data.type === "progress") {
                botTextState += `[Logs] ${data.message}\n`;
              } else if (data.type === "artifact") {
                const exists = botArtifactsState.some(a => a.filename === data.info.filename);
                if (!exists) botArtifactsState.push(data.info);
              } else if (data.type === "done") {
                botTextState = data.text;
                if (data.tokens) latestTokens = data.tokens;
                if (data.tokens?.total) setTotalChatTokens(data.tokens.total);
              } else if (data.type === "error") {
                botTextState += `\n❌ Error: ${data.message}`;
              }
            } catch (e) {
              console.error("SSE Parse Error", e, line);
            }
          }
        }

        if (chunkHasData) {
          if (!hasAddedMessage) {
            hasAddedMessage = true;
            setShowWelcome(false);
            setIsTyping(false);
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: botTextState,
                time: now(),
                artifacts: [...botArtifactsState],
                tokens: latestTokens
              }
            ]);
          } else {
            setMessages((prev) => {
              const newMsgs = [...prev];
              const lastIdx = newMsgs.length - 1;
              if (lastIdx >= 0 && newMsgs[lastIdx].role === "assistant") {
                newMsgs[lastIdx] = {
                  ...newMsgs[lastIdx],
                  content: botTextState,
                  artifacts: [...botArtifactsState],
                  tokens: latestTokens || newMsgs[lastIdx].tokens
                };
              }
              return newMsgs;
            });
          }
        }
      }
      setIsTyping(false);
    } catch (err) {
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ Failed to connect to Automation Service.", time: now() },
      ]);
      console.error(err);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        animation: "chatEnter 0.25s ease",
        "@keyframes chatEnter": {
          from: { opacity: 0, transform: "translateY(8px)" },
          to:   { opacity: 1, transform: "translateY(0)" },
        },
      }}
    >
      {/* ── Top Bar ── */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          px: 2.5,
          py: 1.6,
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(10,22,40,0.5)",
          backdropFilter: "blur(10px)",
          flexShrink: 0,
        }}
      >
        <Tooltip title="Back to home">
          <IconButton
            onClick={onBack}
            size="small"
            sx={{
              width: 32,
              height: 32,
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: "8px",
              background: "rgba(255,255,255,0.04)",
              color: "#8fa3c0",
              "&:hover": {
                background: "rgba(255,255,255,0.07)",
                color: "#e8edf5",
              },
            }}
          >
            <ArrowBackIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>

        <Box sx={{ flex: 1, display: "flex", alignItems: "center", gap: 1.5 }}>
          <Typography
            sx={{
              fontFamily: "'Syne', sans-serif",
              fontSize: "15px",
              fontWeight: 700,
              color: "#fff",
              letterSpacing: "-0.2px",
            }}
          >
            {tool.label}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.6 }}>
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#4caf82",
                boxShadow: "0 0 6px rgba(76,175,130,0.6)",
                animation: "pulse 2.5s ease infinite",
                "@keyframes pulse": {
                  "0%,100%": { opacity: 1 },
                  "50%": { opacity: 0.5 },
                },
              }}
            />
            <Typography sx={{ fontSize: "11.5px", color: "#4caf82", fontWeight: 500 }}>
              Ready
            </Typography>
          </Box>
        </Box>

        <Tooltip title="Clear conversation">
          <Box
            onClick={() => { setMessages([]); setShowWelcome(true); setTotalChatTokens(0); }}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.7,
              px: 1.5,
              py: 0.7,
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: "8px",
              background: "rgba(255,255,255,0.04)",
              color: "#506280",
              cursor: "pointer",
              fontSize: "12px",
              fontFamily: "'DM Sans', sans-serif",
              transition: "all 0.2s ease",
              "&:hover": {
                background: "rgba(255,255,255,0.07)",
                color: "#8fa3c0",
              },
            }}
          >
            <DeleteOutlineIcon sx={{ fontSize: 15 }} />
            <Typography sx={{ fontSize: "12px", color: "inherit" }}>Clear</Typography>
          </Box>
        </Tooltip>
      </Box>

      {/* ── Messages Area ── */}
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          px: 2.5,
          py: 3,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {/* Welcome state */}
        {showWelcome && messages.length === 0 && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              gap: 1.5,
              flex: 1,
              justifyContent: "center",
              maxWidth: 560,
              mx: "auto",
              width: "100%",
              animation: "fadeUp 0.4s ease",
              "@keyframes fadeUp": {
                from: { opacity: 0, transform: "translateY(16px)" },
                to:   { opacity: 1, transform: "translateY(0)" },
              },
            }}
          >
            {/* Icon */}
            <Box
              sx={{
                width: 56,
                height: 56,
                background: "linear-gradient(135deg, #F26522, #c94e10)",
                borderRadius: "14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 8px 24px rgba(242,101,34,0.35)",
                mb: 0.5,
              }}
            >
              <svg width="28" height="28" viewBox="0 0 40 40" fill="none">
                <path
                  d="M8 28L16 12L24 28"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path d="M11 23H21" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="30" cy="14" r="4" fill="white" />
              </svg>
            </Box>

            <Typography
              sx={{
                fontFamily: "'Syne', sans-serif",
                fontSize: "22px",
                fontWeight: 700,
                color: "#fff",
                letterSpacing: "-0.4px",
              }}
            >
              {config.welcomeTitle}
            </Typography>

            <Typography
              sx={{ fontSize: "13.5px", color: "#8fa3c0", lineHeight: 1.6, maxWidth: 400 }}
            >
              {config.welcomeSubtitle}
            </Typography>

            {/* Suggestions */}
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                gap: 1,
                width: "100%",
                maxWidth: 480,
                mt: 1,
              }}
            >
              {config.suggestions.map((s, i) => (
                <Box
                  key={i}
                  onClick={() => handleSend(s)}
                  sx={{
                    px: 2,
                    py: 1.4,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: "8px",
                    color: "#8fa3c0",
                    fontSize: "13px",
                    fontFamily: "'DM Sans', sans-serif",
                    cursor: "pointer",
                    textAlign: "left",
                    lineHeight: 1.4,
                    transition: "all 0.2s ease",
                    "&:hover": {
                      background: "rgba(242,101,34,0.18)",
                      borderColor: "rgba(242,101,34,0.45)",
                      color: "#e8edf5",
                    },
                  }}
                >
                  {s}
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {/* Messages */}
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} token={token} />
        ))}

        {isTyping && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </Box>

      {/* ── Input Bar ── */}
      <Box
        sx={{
          px: 2.5,
          pt: 1.8,
          pb: 2,
          borderTop: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(10,22,40,0.5)",
          backdropFilter: "blur(10px)",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: 0.8,
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-end",
            gap: 1.2,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: "12px",
            px: 1.5,
            py: 1.2,
            transition: "border-color 0.22s ease, box-shadow 0.22s ease",
            "&:focus-within": {
              borderColor: "rgba(242,101,34,0.45)",
              boxShadow: "0 0 0 3px rgba(242,101,34,0.18)",
            },
          }}
        >
          <TextField
            multiline
            maxRows={4}
            fullWidth
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={config.placeholder}
            variant="standard"
            InputProps={{ disableUnderline: true }}
            sx={{
              "& .MuiInputBase-root": {
                fontFamily: "'DM Sans', sans-serif",
                fontSize: "13.5px",
                color: "#e8edf5",
                lineHeight: 1.55,
                background: "transparent",
                caretColor: "#F26522",
              },
              "& .MuiInputBase-input::placeholder": {
                color: "#506280",
                opacity: 1,
              },
            }}
          />

          <Tooltip title="Send (Enter)">
            <Box
              onClick={() => handleSend()}
              sx={{
                width: 34,
                height: 34,
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                cursor: input.trim() && !isTyping ? "pointer" : "not-allowed",
                background: input.trim() && !isTyping ? "#F26522" : "rgba(255,255,255,0.04)",
                color: input.trim() && !isTyping ? "#fff" : "#506280",
                boxShadow: input.trim() && !isTyping
                  ? "0 4px 14px rgba(242,101,34,0.4)"
                  : "none",
                transition: "all 0.2s ease",
                "&:hover":
                  input.trim() && !isTyping
                    ? { background: "#ff7d35", transform: "scale(1.05)" }
                    : {},
              }}
            >
              <SendIcon sx={{ fontSize: 15 }} />
            </Box>
          </Tooltip>
        </Box>

        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", pt: 0.3 }}>
          <Typography sx={{ fontSize: "11px", color: "#506280", pl: 0.3 }}>
            Press Enter to send · Shift+Enter for new line
          </Typography>
          {totalChatTokens > 0 && (
            <Typography sx={{ fontSize: "11px", color: "#4caf82", pr: 0.3, fontWeight: "bold" }}>
              Total Tokens: {totalChatTokens.toLocaleString()}
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}
