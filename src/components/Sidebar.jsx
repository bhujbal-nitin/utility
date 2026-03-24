import { useState } from "react";
import {
  Box,
  Drawer,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";

export const TOOLS = [
  {
    id: "brd",
    label: "BRD Creation",
    icon: <ArticleOutlinedIcon fontSize="small" />,
    description: "Business Requirement Documents",
    tag: "Documents",
  },
  {
    id: "proposal",
    label: "Proposal Creation",
    icon: <ChatBubbleOutlineIcon fontSize="small" />,
    description: "Client & Sales Proposals",
    tag: "Proposals",
  },
  {
    id: "ai-studio",
    label: "AI Studio",
    icon: <AutoAwesomeIcon fontSize="small" />,
    description: "Build & Test AI Workflows",
    tag: "Studio",
  },
  {
    id: "migration",
    label: "Migration to AE",
    icon: <SwapHorizIcon fontSize="small" />,
    description: "Migrate from Legacy RPA",
    tag: "Migration",
  },
];

const AELogoMark = () => (
  <Box
    sx={{
      width: 32,
      height: 32,
      borderRadius: "8px",
      background: "#F26522",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    }}
  >
    <svg width="20" height="20" viewBox="0 0 40 40" fill="none">
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
);

export default function Sidebar({
  activeTool,
  onSelectTool,
  collapsed,
  onToggle,
  sidebarWidth,
  sidebarCollapsed,
}) {
  const drawerWidth = collapsed ? sidebarCollapsed : sidebarWidth;

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        "& .MuiDrawer-paper": {
          width: drawerWidth,
          boxSizing: "border-box",
          background: "rgba(17,34,64,0.72)",
          backdropFilter: "blur(20px)",
          borderRight: "1px solid rgba(255,255,255,0.07)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          transition: "width 0.22s cubic-bezier(0.4,0,0.2,1)",
        },
      }}
    >
      {/* ── Logo ── */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.2,
          px: 2,
          py: 2,
          position: "relative",
          flexShrink: 0,
        }}
      >
        <AELogoMark />
        {!collapsed && (
          <Box sx={{ flex: 1, overflow: "hidden" }}>
            <Typography
              sx={{
                fontFamily: "'Syne', sans-serif",
                fontWeight: 700,
                fontSize: "13.5px",
                color: "#fff",
                whiteSpace: "nowrap",
                letterSpacing: "-0.3px",
              }}
            >
              AutomationEdge
            </Typography>
            <Typography
              sx={{
                fontSize: "10px",
                fontWeight: 600,
                color: "#F26522",
                letterSpacing: "0.5px",
                textTransform: "uppercase",
              }}
            >
              AI Tools
            </Typography>
          </Box>
        )}
        <IconButton
          onClick={onToggle}
          size="small"
          sx={{
            width: 28,
            height: 28,
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: "6px",
            background: "rgba(255,255,255,0.04)",
            color: "#8fa3c0",
            flexShrink: 0,
            ml: collapsed ? "auto" : 0,
            "&:hover": {
              background: "rgba(242,101,34,0.18)",
              borderColor: "rgba(242,101,34,0.45)",
              color: "#F26522",
            },
          }}
        >
          <ChevronLeftIcon
            sx={{
              fontSize: 16,
              transform: collapsed ? "rotate(180deg)" : "none",
              transition: "transform 0.22s ease",
            }}
          />
        </IconButton>
      </Box>

      {/* ── Divider ── */}
      <Box sx={{ height: "1px", background: "rgba(255,255,255,0.07)", mx: 2 }} />

      {/* ── Section Label ── */}
      {!collapsed && (
        <Typography
          sx={{
            fontSize: "10px",
            fontWeight: 600,
            letterSpacing: "1.2px",
            textTransform: "uppercase",
            color: "#506280",
            px: 2.5,
            pt: 1.8,
            pb: 0.8,
          }}
        >
          Tools
        </Typography>
      )}

      {/* ── Nav Items ── */}
      <Box
        sx={{
          flex: 1,
          px: 1.2,
          py: 0.8,
          display: "flex",
          flexDirection: "column",
          gap: 0.4,
          overflowY: "auto",
        }}
      >
        {TOOLS.map((tool) => {
          const isActive = activeTool?.id === tool.id;
          return (
            <Tooltip
              key={tool.id}
              title={collapsed ? tool.label : ""}
              placement="right"
              arrow
            >
              <Box
                onClick={() => onSelectTool(tool)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  px: 1.2,
                  py: 1.2,
                  borderRadius: "8px",
                  border: "1px solid",
                  borderColor: isActive
                    ? "rgba(242,101,34,0.45)"
                    : "transparent",
                  background: isActive
                    ? "rgba(242,101,34,0.18)"
                    : "transparent",
                  cursor: "pointer",
                  color: isActive ? "#fff" : "#8fa3c0",
                  position: "relative",
                  transition: "all 0.22s cubic-bezier(0.4,0,0.2,1)",
                  "&:hover": {
                    background: isActive
                      ? "rgba(242,101,34,0.22)"
                      : "rgba(255,255,255,0.07)",
                    borderColor: isActive
                      ? "rgba(242,101,34,0.45)"
                      : "rgba(255,255,255,0.07)",
                    color: "#e8edf5",
                  },
                }}
              >
                {/* Icon */}
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    color: isActive ? "#F26522" : "inherit",
                  }}
                >
                  {tool.icon}
                </Box>

                {/* Label */}
                {!collapsed && (
                  <Box sx={{ flex: 1, overflow: "hidden" }}>
                    <Typography
                      sx={{
                        fontSize: "13.5px",
                        fontWeight: 500,
                        lineHeight: 1.3,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        color: "inherit",
                      }}
                    >
                      {tool.label}
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: "10px",
                        color: isActive ? "rgba(242,101,34,0.7)" : "#506280",
                        fontWeight: 400,
                        mt: 0.2,
                      }}
                    >
                      {tool.tag}
                    </Typography>
                  </Box>
                )}

                {/* Active indicator bar */}
                {isActive && (
                  <Box
                    sx={{
                      position: "absolute",
                      right: 0,
                      top: "20%",
                      height: "60%",
                      width: "3px",
                      background: "#F26522",
                      borderRadius: "3px 0 0 3px",
                    }}
                  />
                )}
              </Box>
            </Tooltip>
          );
        })}
      </Box>

      {/* ── Footer ── */}
      <Box sx={{ flexShrink: 0, pb: 1.5 }}>
        <Box sx={{ height: "1px", background: "rgba(255,255,255,0.07)", mx: 2, mb: 1.5 }} />
        {!collapsed && (
          <Box sx={{ px: 2.5 }}>
            <Typography sx={{ fontSize: "10px", color: "#506280", fontWeight: 500 }}>
              v1.0.0
            </Typography>
            <Typography sx={{ fontSize: "10px", color: "#506280" }}>
              Powered by AutomationEdge
            </Typography>
          </Box>
        )}
      </Box>
    </Drawer>
  );
}
