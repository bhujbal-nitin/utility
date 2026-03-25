import React, { useState } from "react";
import { Box } from "@mui/material";
import Sidebar from "../components/Sidebar";
import ChatWindow from "../components/ChatWindow";
import MigrationHomePage from "../components/MigrationHomePage";
import WelcomeScreen from "../components/WelcomeScreen";
import { useAuth } from "../context/AuthContext";
import { Navigate } from "react-router-dom";

const SIDEBAR_WIDTH = 268;
const SIDEBAR_COLLAPSED = 68;

export default function DashboardLayout() {
  const { user } = useAuth();
  const [activeTool, setActiveTool] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Box
      sx={{
        display: "flex",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        background: "radial-gradient(ellipse 80% 60% at 15% 10%, rgba(242,101,34,0.06) 0%, transparent 60%), #0a1628",
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
        {activeTool ? (
          activeTool.id === "migration" ? (
             <MigrationHomePage tool={activeTool} onBack={() => setActiveTool(null)} />
          ) : (
             <ChatWindow tool={activeTool} onBack={() => setActiveTool(null)} />
          )
        ) : (
          <WelcomeScreen onSelectTool={setActiveTool} />
        )}
      </Box>
    </Box>
  );
}
