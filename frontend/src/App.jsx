import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { CssBaseline } from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { AuthProvider } from "./context/AuthContext";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import DashboardLayout from "./layouts/DashboardLayout";
import Admin from "./pages/Admin";

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

// Theme and imports remain the exact same but removed Sidebar layout logic

export default function App() {
  return (
    <ThemeProvider theme={aeTheme}>
      <CssBaseline />
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/*" element={<DashboardLayout />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}
