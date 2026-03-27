import React, { useState } from "react";
import { Box, Typography, TextField, Button, CircularProgress, Container, Paper, Link, Select, MenuItem, FormControl, InputLabel } from "@mui/material";
import axios from "axios";
import { useNavigate, Link as RouterLink } from "react-router-dom";

const AUTH_BASE_URL = "/api/auth";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("ba");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await axios.post(`${AUTH_BASE_URL}/register`, {
        email,
        password,
        role
      });
      setSuccess(true);
      setTimeout(() => navigate("/login"), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || "Registration failed. Try again.");
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
            Create Account
          </Typography>
          <Typography variant="subtitle1" sx={{ mb: 3, color: "text.secondary", textAlign: "center" }}>
            Register to join the AutomationEdge Suite
          </Typography>

          {error && (
            <Typography color="error" variant="body2" sx={{ mb: 2 }}>
              {error}
            </Typography>
          )}

          {success && (
            <Typography color="primary" variant="body2" sx={{ mb: 2, fontWeight: "bold", textAlign: "center" }}>
              Registered successfully! Redirecting to login...
            </Typography>
          )}

          <Box component="form" onSubmit={handleSignup} sx={{ width: "100%" }}>
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
              autoComplete="new-password"
              variant="outlined"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              sx={{ input: { color: "white" } }}
            />

            <FormControl fullWidth margin="normal" required>
              <InputLabel id="role-select-label" sx={{ color: "text.secondary" }}>Select Role</InputLabel>
              <Select
                labelId="role-select-label"
                id="role-select"
                value={role}
                label="Select Role"
                onChange={(e) => setRole(e.target.value)}
                sx={{ 
                  color: "white", 
                  ".MuiOutlinedInput-notchedOutline": { borderColor: "rgba(255,255,255,0.23)" },
                  "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#F26522" }
                }}
              >
                <MenuItem value="ba">BA (for BRD Service)</MenuItem>
                <MenuItem value="automation">AI Studio Dev (for Automation Service)</MenuItem>
                <MenuItem value="sales">Sales (for Proposal Service)</MenuItem>
                <MenuItem value="ae">Dev (for Migration Service)</MenuItem>
              </Select>
            </FormControl>

            <Button
              type="submit"
              fullWidth
              variant="contained"
              disabled={loading || success}
              sx={{ mt: 3, mb: 2, py: 1.5, fontSize: "1.1rem", borderRadius: 2 }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : "Sign Up"}
            </Button>
            
            <Box textAlign="center" mt={2}>
              <Link component={RouterLink} to="/login" variant="body2" sx={{ color: "#8fa3c0", "&:hover": { color: "#F26522" } }}>
                Already have an account? Sign in
              </Link>
            </Box>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
