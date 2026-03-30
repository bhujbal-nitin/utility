import { Box, Typography } from "@mui/material";

const TOOL_CARDS = [
  {
    id: "brd",
    label: "BRD Creation",
    description:
      "Generate detailed Business Requirement Documents from simple inputs, saving hours of manual drafting.",
  },
  {
    id: "proposal",
    label: "Proposal Creation",
    description:
      "Craft compelling client proposals and sales decks tailored to your prospect's needs and industry.",
  },
  {
    id: "ai-studio",
    label: "AI Studio",
    description:
      "Design, build, and test AI-powered automation workflows using natural language and visual tools.",
  },
  {
    id: "migration",
    label: "Migration to AE",
    description:
      "Seamlessly migrate from legacy RPA platforms to AutomationEdge with guided assistance and tooling.",
  },
];

export default function WelcomeScreen() {
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

      {/* ── Plain Text Feature List (non-clickable) ── */}
      <Box sx={{ width: "100%", maxWidth: 760, mt: 3 }}>
        {TOOL_CARDS.map((tool) => (
          <Box key={tool.id} sx={{ mb: 2.6 }}>
            <Typography
              sx={{
                fontFamily: "'Syne', sans-serif",
                fontSize: "15px",
                fontWeight: 800,
                color: "#fff",
                letterSpacing: "-0.2px",
                mb: 0.4,
              }}
            >
              {tool.label}
            </Typography>
            <Typography sx={{ fontSize: "12.5px", color: "#8fa3c0", lineHeight: 1.55 }}>
              {tool.description}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* ── Footer hint ── */}
      <Typography sx={{ fontSize: "11.5px", color: "#506280", letterSpacing: "0.2px" }}>
        More tools coming soon · Built on AutomationEdge Platform
      </Typography>
    </Box>
  );
}
