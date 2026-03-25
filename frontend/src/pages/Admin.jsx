import React, { useState, useEffect, useCallback } from "react";
import { Box, Typography, Container, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Select, MenuItem, CircularProgress, Alert } from "@mui/material";
import { useAuth } from "../context/AuthContext";

const ROLES = ["admin", "ba", "sales", "automation", "ae"];

export default function Admin() {
  const { api, user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchUsers = useCallback(async () => {
    try {
      const res = await api.get("/admin/users");
      setUsers(res.data);
    } catch (err) {
      setError("Failed to fetch users. Ensure you have Admin privileges.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleRoleChange = async (userId, newRole) => {
    try {
      await api.put(`/admin/users/${userId}/role`, { role: newRole });
      setUsers(prev => prev.map(u => (u.id === userId ? { ...u, role: newRole } : u)));
    } catch (err) {
      setError("Failed to update role.");
    }
  };

  if (user?.role !== "admin") {
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
                  <TableCell sx={{ color: "#e8edf5", fontWeight: "bold" }}>Current Role</TableCell>
                  <TableCell sx={{ color: "#e8edf5", fontWeight: "bold" }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id} sx={{ "&:last-child td, &:last-child th": { border: 0 } }}>
                    <TableCell sx={{ color: "#8fa3c0" }}>{u.email}</TableCell>
                    <TableCell sx={{ color: "#8fa3c0", textTransform: "capitalize" }}>{u.role}</TableCell>
                    <TableCell>
                      <Select
                        value={u.role}
                        size="small"
                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                        sx={{ color: "white", ".MuiOutlinedInput-notchedOutline": { borderColor: "#506280" } }}
                      >
                        {ROLES.map(r => (
                          <MenuItem key={r} value={r} sx={{ textTransform: "capitalize" }}>
                            {r}
                          </MenuItem>
                        ))}
                      </Select>
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
