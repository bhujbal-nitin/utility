import React, { useState, useEffect, useCallback } from "react";
import { Box, Typography, Container, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Select, MenuItem, CircularProgress, Alert, Button } from "@mui/material";
import { useAuth } from "../context/AuthContext";
import axios from "axios";

const ROLES = ["admin", "ba", "sales", "automation", "ae"];

export default function Admin() {
  const { api, user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchUsers = useCallback(async () => {
    try {
      const token = localStorage.getItem("edge_token");
      const res = await axios.get("/api/admin/users", {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(res.data);
    } catch (err) {
      console.error(err);
      setError("Failed to fetch users. Ensure you have Admin privileges.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleRolesChange = async (userId, newRoles) => {
    try {
      const token = localStorage.getItem("edge_token");
      await axios.put(`/api/admin/users/${userId}/roles`, { roles: newRoles }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(prev => prev.map(u => (u.id === userId ? { ...u, roles: newRoles } : u)));
    } catch (err) {
      console.error(err);
      setError("Failed to update roles.");
    }
  };

  const handleApprove = async (userId) => {
    try {
      const token = localStorage.getItem("edge_token");
      await axios.put(`/api/admin/users/${userId}/approve`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(prev => prev.map(u => (u.id === userId ? { ...u, is_approved: true } : u)));
    } catch (err) {
      console.error(err);
      setError("Failed to approve user.");
    }
  };

  const handleDelete = async (userId) => {
    if (!window.confirm("Are you sure you want to delete this user? This action cannot be undone.")) return;
    try {
      const token = localStorage.getItem("edge_token");
      await axios.delete(`/api/admin/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(prev => prev.filter(u => u.id !== userId));
    } catch (err) {
      console.error(err);
      setError("Failed to delete user.");
    }
  };

  if (!user?.roles?.includes("admin")) {
    return (
      <Box sx={{ p: 4, textAlign: "center", color: "#8fa3c0" }}>
        <Typography variant="h5">Access Denied: Administrators only.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, flexGrow: 1, overflowY: "auto" }}>
      <Container maxWidth="md">
        <Typography variant="h4" sx={{ mb: 4, color: "#F26522", fontWeight: "bold" }}>
          User Management
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

        {loading ? (
          <Box display="flex" justifyContent="center">
            <CircularProgress sx={{ color: "#F26522" }} />
          </Box>
        ) : (
          <TableContainer component={Paper} sx={{ background: "#112240", borderRadius: 2 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: "#e8edf5", fontWeight: "bold" }}>Email</TableCell>
                  <TableCell sx={{ color: "#e8edf5", fontWeight: "bold" }}>Current Roles</TableCell>
                  <TableCell sx={{ color: "#e8edf5", fontWeight: "bold" }}>Status</TableCell>
                  <TableCell sx={{ color: "#e8edf5", fontWeight: "bold" }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id} sx={{ "&:last-child td, &:last-child th": { border: 0 } }}>
                    <TableCell sx={{ color: "#8fa3c0" }}>{u.email}</TableCell>
                    <TableCell sx={{ color: "#8fa3c0", textTransform: "capitalize" }}>{u.roles?.join(', ')}</TableCell>
                    <TableCell sx={{ color: u.is_approved ? "#4caf50" : "#ff9800", fontWeight: "bold" }}>
                      {u.is_approved ? "Approved" : "Pending"}
                    </TableCell>
                    <TableCell sx={{display:"flex", gap: "8px"}}>
                      <Select
                        multiple
                        value={u.roles || []}
                        size="small"
                        onChange={(e) => handleRolesChange(u.id, typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)}
                        sx={{ color: "white", ".MuiOutlinedInput-notchedOutline": { borderColor: "#506280" }, minWidth: "120px" }}
                      >
                        {ROLES.map(r => (
                          <MenuItem key={r} value={r} sx={{ textTransform: "capitalize" }}>
                            {r}
                          </MenuItem>
                        ))}
                      </Select>
                      {!u.is_approved && (
                        <Button variant="contained" size="small" onClick={() => handleApprove(u.id)} sx={{background:"#4caf50", "&:hover":{background:"#388e3c"}}}>
                          Approve
                        </Button>
                      )}
                      <Button variant="contained" size="small" onClick={() => handleDelete(u.id)} sx={{background:"#f44336", "&:hover":{background:"#d32f2f"}}}>
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Container>
    </Box>
  );
}
