import { useState } from "react";
import { Box, CssBaseline } from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/ChatWindow";
import WelcomeScreen from "./components/WelcomeScreen";

const aeTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#F26522" },
    background: { default: "#0a1628", paper: "#112240" },
    text: { primary: "#e8edf5", secondary: "#8fa3c0" },
  },
  typography: {
    fontFamily: "'DM Sans', sans-serif",
    h1: { fontFamily: "'Syne', sans-serif" },
    h2: { fontFamily: "'Syne', sans-serif" },
    h3: { fontFamily: "'Syne', sans-serif" },
    h4: { fontFamily: "'Syne', sans-serif" },
    h5: { fontFamily: "'Syne', sans-serif" },
    h6: { fontFamily: "'Syne', sans-serif" },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { textTransform: "none", fontFamily: "'DM Sans', sans-serif" },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          // Remove any default MUI Drawer offset
          position: "fixed",
        },
      },
    },
    MuiCssBaseline: {
      styleOverrides: {
        "*": { boxSizing: "border-box", margin: 0, padding: 0 },
        html: { height: "100%" },
        body: { height: "100%", overflow: "hidden" },
        "#root": { height: "100%" },
        "::-webkit-scrollbar": { width: "4px" },
        "::-webkit-scrollbar-track": { background: "transparent" },
        "::-webkit-scrollbar-thumb": {
          background: "#1a3460",
          borderRadius: "4px",
        },
        "::-webkit-scrollbar-thumb:hover": { background: "#F26522" },
      },
    },
  },
});

const SIDEBAR_WIDTH = 268;
const SIDEBAR_COLLAPSED = 68;

export default function App() {
  const [activeTool, setActiveTool] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const currentSidebarWidth = sidebarCollapsed ? SIDEBAR_COLLAPSED : SIDEBAR_WIDTH;

  return (
    <ThemeProvider theme={aeTheme}>
      <CssBaseline />
      <Box
        sx={{
          display: "flex",
          height: "100vh",
          width: "100vw",
          overflow: "hidden",
          background:
            "radial-gradient(ellipse 80% 60% at 15% 10%, rgba(242,101,34,0.06) 0%, transparent 60%), #0a1628",
        }}
      >
        {/* Sidebar */}
        <Sidebar
          activeTool={activeTool}
          onSelectTool={setActiveTool}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((c) => !c)}
          sidebarWidth={SIDEBAR_WIDTH}
          sidebarCollapsed={SIDEBAR_COLLAPSED}
        />

        {/* Main content — starts exactly where sidebar ends */}
        <Box
          component="main"
          sx={{
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            width: `calc(100vw - ${currentSidebarWidth}px)`,
            ml: `${currentSidebarWidth}px`,
            transition: "width 0.22s cubic-bezier(0.4,0,0.2,1), margin-left 0.22s cubic-bezier(0.4,0,0.2,1)",
          }}
        >
          {activeTool ? (
            <ChatWindow tool={activeTool} onBack={() => setActiveTool(null)} />
          ) : (
            <WelcomeScreen onSelectTool={setActiveTool} />
          )}
        </Box>
      </Box>
    </ThemeProvider>
  );
}
