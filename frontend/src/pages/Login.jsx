import React, { useState } from "react";
import { Box, Typography, TextField, Button, CircularProgress, Container, Paper, Link } from "@mui/material";
import { useAuth } from "../context/AuthContext";
import { useNavigate, Link as RouterLink } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.detail || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        height: "100vh",
        width: "100vw",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(ellipse 80% 60% at 15% 10%, rgba(242,101,34,0.06) 0%, transparent 60%), #0a1628",
      }}
    >
      <Container maxWidth="xs">
        <Paper
          elevation={6}
          sx={{
            p: 4,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            background: "#112240",
            borderRadius: 3,
            borderTop: "4px solid #F26522",
          }}
        >
          <Typography variant="h4" sx={{ mb: 1, fontWeight: "bold", color: "#F26522" }}>
            AutomationEdge
          </Typography>
          <Typography variant="subtitle1" sx={{ mb: 3, color: "text.secondary" }}>
            Sign in to AI Suite
          </Typography>

          {error && (
            <Typography color="error" variant="body2" sx={{ mb: 2 }}>
              {error}
            </Typography>
          )}

          <Box component="form" onSubmit={handleLogin} sx={{ width: "100%" }}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label="Email Address"
              name="email"
              autoComplete="email"
              autoFocus
              variant="outlined"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              sx={{ input: { color: "white" } }}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              type="password"
              id="password"
              autoComplete="current-password"
              variant="outlined"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              sx={{ input: { color: "white" } }}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              disabled={loading}
              sx={{ mt: 3, mb: 2, py: 1.5, fontSize: "1.1rem", borderRadius: 2 }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : "Sign In"}
            </Button>
            
            <Box textAlign="center" mt={2}>
              <Link component={RouterLink} to="/signup" variant="body2" sx={{ color: "#8fa3c0", "&:hover": { color: "#F26522" } }}>
                Don't have an account? Sign up
              </Link>
            </Box>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
