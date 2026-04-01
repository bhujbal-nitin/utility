import {
  Box,
  Drawer,
  IconButton,
  Tooltip,
  Typography,
  Button,
} from "@mui/material";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import LogoutIcon from "@mui/icons-material/Logout";
import ManageAccountsIcon from "@mui/icons-material/ManageAccounts";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import { useAuth } from "../context/AuthContext";
import { useThemeMode } from "../context/ThemeContext";
import { useNavigate } from "react-router-dom";

export const TOOLS = [
  {
    id: "brd",
    label: "BRD Creation",
    icon: <ArticleOutlinedIcon fontSize="small" />,
    description: "Business Requirement Documents",
    tag: "Documents",
    allowedRoles: ["ba", "admin"],
  },
  {
    id: "proposal",
    label: "Proposal Creation",
    icon: <ChatBubbleOutlineIcon fontSize="small" />,
    description: "Client & Sales Proposals",
    tag: "Proposals",
    allowedRoles: ["sales", "admin"],
  },
  {
    id: "ai-studio",
    label: "AI Studio",
    icon: <AutoAwesomeIcon fontSize="small" />,
    description: "Build & Test AI Workflows",
    tag: "Studio",
    allowedRoles: ["automation", "admin"],
  },
  {
    id: "migration",
    label: "Migration to AE",
    icon: <SwapHorizIcon fontSize="small" />,
    description: "Migrate from Legacy RPA",
    tag: "Migration",
    allowedRoles: ["ae", "admin"],
  },
];

const AELogoMark = () => (
  <Box
    sx={{
      width: 32,
      height: 32,
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

export default function Sidebar({
  activeTool,
  onSelectTool,
  collapsed,
  onToggle,
  sidebarWidth,
  sidebarCollapsed,
}) {
  const { user, logout } = useAuth();
  const { mode, toggleTheme } = useThemeMode();
  const navigate = useNavigate();
  const drawerWidth = collapsed ? sidebarCollapsed : sidebarWidth;

  const visibleTools = TOOLS.filter(
    (t) => user?.roles?.includes("admin") || t.allowedRoles.some(r => user?.roles?.includes(r))
  );

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        "& .MuiDrawer-paper": {
          width: drawerWidth,
          boxSizing: "border-box",
          background: "var(--ae-glass)",
          backdropFilter: "blur(20px)",
          borderRight: "1px solid var(--ae-glass-border)",
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
                color: "text.primary",
                whiteSpace: "nowrap",
                letterSpacing: "-0.3px",
              }}
            >
              AutomationEdge
            </Typography>
            <Typography
              sx={{
                fontSize: "10px",
                fontWeight: 800,
                color: "#F26522",
                textTransform: "uppercase",
                letterSpacing: "1px",
                mt: -0.2,
              }}
            >
              AI TOOLS
            </Typography>
          </Box>
        )}
        
        {/* Theme Toggle */}
        {!collapsed && (
          <Tooltip title={mode === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}>
            <IconButton 
              onClick={toggleTheme} 
              size="small" 
              sx={{ 
                color: "#F26522", 
                bgcolor: "var(--ae-surface)",
                mr: 1,
                "&:hover": { bgcolor: "var(--ae-surface-hover)" }
              }}
            >
              {mode === 'dark' ? <LightModeIcon sx={{ fontSize: 18 }} /> : <DarkModeIcon sx={{ fontSize: 18 }} />}
            </IconButton>
          </Tooltip>
        )}

        <IconButton
          onClick={onToggle}
          size="small"
          sx={{
            flexShrink: 0,
            background: "var(--ae-navy-mid)",
            border: "1px solid var(--ae-border)",
            color: "#8fa3c0",
            padding: "4px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
            "&:hover": { background: "var(--ae-orange)", color: "#fff", borderColor: "var(--ae-orange)" },
            zIndex: 100,
          }}
        >
          <ChevronLeftIcon
            sx={{
              fontSize: 16,
              transform: collapsed ? "rotate(180deg)" : "none",
              transition: "transform 0.3s ease",
            }}
          />
        </IconButton>
      </Box>

      {/* ── Tools ── */}
      <Box sx={{ flex: 1, py: 2, px: 1.5, overflowY: "auto", mt: 1 }}>
        <Typography
          sx={{
            fontSize: "10px",
            fontWeight: 700,
            color: "#506280",
            textTransform: "uppercase",
            letterSpacing: "1px",
            mb: 2,
            px: 1,
            opacity: collapsed ? 0 : 1,
          }}
        >
          Tools
        </Typography>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {visibleTools.map((tool) => {
            const isActive = activeTool?.id === tool.id;
            return (
              <Tooltip
                key={tool.id}
                title={collapsed ? tool.label : ""}
                placement="right"
              >
                <Box
                  onClick={() => onSelectTool(tool)}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    px: 1.5,
                    py: 1.2,
                    borderRadius: "10px",
                    cursor: "pointer",
                    position: "relative",
                    transition: "all 0.2s ease",
                    background: isActive ? "rgba(242,101,34,0.12)" : "transparent",
                    border: "1px solid",
                    borderColor: isActive ? "rgba(242,101,34,0.3)" : "transparent",
                    "&:hover": {
                      background: isActive
                        ? "rgba(242,101,34,0.15)"
                        : "rgba(255,255,255,0.04)",
                    },
                  }}
                >
                  <Box
                    sx={{
                      color: isActive ? "#F26522" : "#8fa3c0",
                      display: "flex",
                      transition: "color 0.2s ease",
                    }}
                  >
                    {tool.icon}
                  </Box>

                  {!collapsed && (
                    <Box sx={{ flex: 1, overflow: "hidden" }}>
                      <Typography
                        sx={{
                          fontSize: "13px",
                          fontWeight: isActive ? 600 : 500,
                          color: isActive ? "var(--ae-orange)" : "text.primary",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {tool.label}
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: "10px",
                          color: "#506280",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {tool.tag}
                      </Typography>
                    </Box>
                  )}

                  {isActive && !collapsed && (
                    <Box
                      sx={{
                        width: 3,
                        height: 16,
                        background: "#F26522",
                        borderRadius: "10px",
                        boxShadow: "0 0 8px rgba(242,101,34,0.5)",
                      }}
                    />
                  )}
                </Box>
              </Tooltip>
            );
          })}
        </Box>
      </Box>

      {/* ── Footer ── */}
      <Box
        sx={{
          px: 1.5,
          py: 2.5,
          borderTop: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(0,0,0,0.1)",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.2,
            px: 1,
            mb: 2,
          }}
        >
          <Tooltip title={user?.roles?.includes("admin") ? "Manage Users" : "Profile Settings"}>
            <IconButton
              onClick={() => user?.roles?.includes("admin") && navigate("/admin")}
              sx={{
                width: 32,
                height: 32,
                borderRadius: "8px",
                background: "rgba(255,255,255,0.04)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                color: "#8fa3c0",
                "&:hover": {
                  background: "rgba(242,101,34,0.1)",
                  color: "#F26522",
                }
              }}
            >
              <ManageAccountsIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          {!collapsed && (
            <Box sx={{ flex: 1, overflow: "hidden" }}>
              <Typography
                sx={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "text.primary",
                  whiteSpace: "nowrap",
                }}
              >
                {user?.email.split("@")[0]}
              </Typography>
              <Typography
                sx={{
                  fontSize: "9px",
                  fontWeight: 800,
                  color: "#F26522",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                ROLES: {user?.roles?.join(', ')}
              </Typography>
            </Box>
          )}
        </Box>

        <Button
          fullWidth
          variant="outlined"
          onClick={logout}
          startIcon={<LogoutIcon sx={{ fontSize: 16 }} />}
          sx={{
            justifyContent: collapsed ? "center" : "flex-start",
            minWidth: 0,
            px: collapsed ? 0 : 2,
            borderColor: "var(--ae-border)",
            color: "text.primary",
            fontSize: "11px",
            "&:hover": {
              borderColor: "var(--ae-orange)",
              background: "var(--ae-surface-hover)",
              color: "text.primary",
            },
            "& .MuiButton-startIcon": {
              margin: collapsed ? 0 : "",
            },
          }}
        >
          {!collapsed && "Logout"}
        </Button>

        {!collapsed && (
          <Box sx={{ mt: 2, px: 1 }}>
            <Typography sx={{ fontSize: "9px", color: "#506280" }}>
              v1.0.0
            </Typography>
            <Typography sx={{ fontSize: "9px", color: "#506280" }}>
              Powered by AutomationEdge
            </Typography>
          </Box>
        )}
      </Box>
    </Drawer>
  );
}
