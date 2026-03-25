import { Box, Typography, Grid } from "@mui/material";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

const TOOL_CARDS = [
  {
    id: "brd",
    label: "BRD Creation",
    description:
      "Generate detailed Business Requirement Documents from simple inputs, saving hours of manual drafting.",
    icon: <ArticleOutlinedIcon sx={{ fontSize: 22 }} />,
    tag: "Documents",
  },
  {
    id: "proposal",
    label: "Proposal Creation",
    description:
      "Craft compelling client proposals and sales decks tailored to your prospect's needs and industry.",
    icon: <ChatBubbleOutlineIcon sx={{ fontSize: 22 }} />,
    tag: "Proposals",
  },
  {
    id: "ai-studio",
    label: "AI Studio",
    description:
      "Design, build, and test AI-powered automation workflows using natural language and visual tools.",
    icon: <AutoAwesomeIcon sx={{ fontSize: 22 }} />,
    tag: "Studio",
  },
  {
    id: "migration",
    label: "Migration to AE",
    description:
      "Seamlessly migrate from legacy RPA platforms to AutomationEdge with guided assistance and tooling.",
    icon: <SwapHorizIcon sx={{ fontSize: 22 }} />,
    tag: "Migration",
  },
];

const toolMap = {
  brd:       { id: "brd",       label: "BRD Creation",      tag: "Documents" },
  proposal:  { id: "proposal",  label: "Proposal Creation",  tag: "Proposals" },
  "ai-studio": { id: "ai-studio", label: "AI Studio",        tag: "Studio"   },
  migration: { id: "migration", label: "Migration to AE",    tag: "Migration" },
};

export default function WelcomeScreen({ onSelectTool }) {
  return (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        px: { xs: 3, md: 5 },
        py: 6,
        gap: 5,
        overflowY: "auto",
      }}
    >
      {/* ── Hero ── */}
      <Box
        sx={{
          textAlign: "center",
          maxWidth: 560,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1.8,
        }}
      >
        {/* Badge */}
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.8,
            background: "rgba(242,101,34,0.18)",
            border: "1px solid rgba(242,101,34,0.45)",
            borderRadius: "100px",
            px: 1.8,
            py: 0.6,
          }}
        >
          <Box
            sx={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#F26522",
              boxShadow: "0 0 6px #F26522",
              animation: "pulse 2s ease infinite",
              "@keyframes pulse": {
                "0%,100%": { opacity: 1, transform: "scale(1)" },
                "50%": { opacity: 0.6, transform: "scale(0.85)" },
              },
            }}
          />
          <Typography
            sx={{
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.5px",
              color: "#ff7d35",
              textTransform: "uppercase",
            }}
          >
            AutomationEdge AI Suite
          </Typography>
        </Box>

        {/* Title */}
        <Typography
          variant="h4"
          sx={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 700,
            fontSize: { xs: "26px", md: "36px" },
            color: "#fff",
            lineHeight: 1.18,
            letterSpacing: "-0.8px",
          }}
        >
          What would you like to{" "}
          <Box component="span" sx={{ color: "#F26522" }}>
            automate
          </Box>{" "}
          today?
        </Typography>

        {/* Subtitle */}
        <Typography
          sx={{
            fontSize: "14px",
            color: "#8fa3c0",
            lineHeight: 1.6,
            maxWidth: 420,
          }}
        >
          Select a tool below to get started. Powered by AutomationEdge's
          Agentic Automation Platform.
        </Typography>
      </Box>

      {/* ── Tool Cards Grid ── */}
      <Grid container spacing={1.8} sx={{ maxWidth: 700, width: "100%", }}>
        {TOOL_CARDS.map((tool, i) => (
          <Grid item xs={12} sm={6} key={tool.id}>
            <Box
              onClick={() => onSelectTool(toolMap[tool.id])}
              sx={{
                display: "flex",
                alignItems: "flex-start",
                gap: 1.8,
                p: 2.4,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: "12px",
                cursor: "pointer",
                position: "relative",
                overflow: "hidden",
                animation: `slideUp 0.4s ease ${i * 80}ms both`,
                "@keyframes slideUp": {
                  from: { opacity: 0, transform: "translateY(18px)" },
                  to:   { opacity: 1, transform: "translateY(0)" },
                },
                transition: "all 0.22s cubic-bezier(0.4,0,0.2,1)",
                "& .arrow-icon": {
                  opacity: 0,
                  transform: "translateX(-6px)",
                  transition: "all 0.22s cubic-bezier(0.4,0,0.2,1)",
                },
                "& .card-icon-box": {
                  transition: "color 0.22s ease",
                },
                "&:hover": {
                  background: "rgba(255,255,255,0.06)",
                  borderColor: "rgba(242,101,34,0.45)",
                  transform: "translateY(-2px)",
                  boxShadow: "0 12px 32px rgba(0,0,0,0.3)",
                  "& .arrow-icon": {
                    opacity: 1,
                    transform: "translateX(0)",
                    color: "#F26522",
                  },
                  "& .card-icon-box": {
                    color: "#F26522",
                    background: "rgba(242,101,34,0.18)",
                  },
                },
              }}
            >
              {/* Icon */}
              <Box
                className="card-icon-box"
                sx={{
                  width: 42,
                  height: 42,
                  background: "#1a3460",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: "10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  color: "#8fa3c0",
                }}
              >
                {tool.icon}
              </Box>

              {/* Body */}
              <Box sx={{ flex: 1 }}>
                <Typography
                  sx={{
                    fontFamily: "'Syne', sans-serif",
                    fontSize: "14.5px",
                    fontWeight: 700,
                    color: "#fff",
                    letterSpacing: "-0.2px",
                    mb: 0.6,
                  }}
                >
                  {tool.label}
                </Typography>
                <Typography
                  sx={{
                    fontSize: "12.5px",
                    color: "#8fa3c0",
                    lineHeight: 1.55,
                  }}
                >
                  {tool.description}
                </Typography>
              </Box>

              {/* Arrow */}
              <Box
                className="arrow-icon"
                sx={{ display: "flex", alignItems: "center", alignSelf: "center" }}
              >
                <ArrowForwardIcon sx={{ fontSize: 16 }} />
              </Box>
            </Box>
          </Grid>
        ))}
      </Grid>

      {/* ── Footer hint ── */}
      <Typography sx={{ fontSize: "11.5px", color: "#506280", letterSpacing: "0.2px" }}>
        More tools coming soon · Built on AutomationEdge Platform
      </Typography>
    </Box>
  );
}
