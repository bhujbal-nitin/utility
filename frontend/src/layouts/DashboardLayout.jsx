import React, { useState } from "react";
import { Box, useTheme } from "@mui/material";
import Sidebar from "../components/Sidebar";
import AIStudio from "../pages/AIStudio";
import MigrationAssistant from "../pages/MigrationAssistant";
import BRDStudio from "../pages/BRDStudio";
import ProposalStudio from "../pages/ProposalStudio";
import WelcomeScreen from "../components/WelcomeScreen";
import { useAuth } from "../context/AuthContext";
import { useThemeMode } from "../context/ThemeContext";
import { Navigate } from "react-router-dom";

const SIDEBAR_WIDTH = 268;
const SIDEBAR_COLLAPSED = 68;

export default function DashboardLayout() {
  const { user } = useAuth();
  const { mode } = useThemeMode();
  const theme = useTheme();
  const [activeTool, setActiveTool] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const renderMainContent = () => {
    if (!activeTool) return <WelcomeScreen onSelectTool={setActiveTool} />;

    switch (activeTool.id) {
      case "brd":
        return <BRDStudio onBack={() => setActiveTool(null)} />;
      case "proposal":
        return <ProposalStudio onBack={() => setActiveTool(null)} />;
      case "migration":
        return <MigrationAssistant tool={activeTool} onBack={() => setActiveTool(null)} />;
      case "ai-studio":
        return <AIStudio tool={activeTool} onBack={() => setActiveTool(null)} />;
      default:
        return <AIStudio tool={activeTool} onBack={() => setActiveTool(null)} />;
    }
  };

  const bgGradient = mode === 'light'
    ? "radial-gradient(ellipse 80% 60% at 15% 10%, rgba(242,101,34,0.04) 0%, transparent 60%), #f8fafc"
    : "radial-gradient(ellipse 80% 60% at 15% 10%, rgba(242,101,34,0.06) 0%, transparent 60%), #0a1628";

  return (
    <Box
      sx={{
        display: "flex",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        background: bgGradient,
      }}
    >
      <Sidebar
        activeTool={activeTool}
        onSelectTool={setActiveTool}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((c) => !c)}
        sidebarWidth={SIDEBAR_WIDTH}
        sidebarCollapsed={SIDEBAR_COLLAPSED}
      />

      <Box
        component="main"
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          transition: "all 0.22s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        {renderMainContent()}
      </Box>
    </Box>
  );
}

