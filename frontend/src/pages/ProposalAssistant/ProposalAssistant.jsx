import React, { useState } from "react";
import {
  Box,
  Typography,
  Stepper,
  Step,
  StepLabel,
  Button,
  Paper,
  Grid,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Chip,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
  Divider,
  Select,
  MenuItem,
 } from "@mui/material";
import { styled } from "@mui/material/styles";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import DownloadIcon from "@mui/icons-material/Download";
import DashboardIcon from "@mui/icons-material/Dashboard";
import AssessmentIcon from "@mui/icons-material/Assessment";
import SettingsIcon from "@mui/icons-material/Settings";
import StorageIcon from "@mui/icons-material/Storage";
import ContactPageIcon from "@mui/icons-material/ContactPage";
import PhotoCamera from "@mui/icons-material/PhotoCamera";
import { useAuth } from "../../context/AuthContext";

/* ─── Styled Components ─── */
const GlassPaper = styled(Paper)(({ theme }) => ({
  background: "var(--ae-glass)",
  backdropFilter: "blur(12px)",
  border: "1px solid var(--ae-border)",
  borderRadius: "16px",
  padding: "24px",
  color: "inherit",
}));

const ActionButton = styled(Button)(({ theme }) => ({
  borderRadius: "10px",
  padding: "10px 24px",
  fontWeight: 600,
  textTransform: "none",
  transition: "all 0.2s ease",
  "&:hover": {
    transform: "translateY(-2px)",
    boxShadow: "0 8px 20px rgba(242, 101, 34, 0.3)",
  },
}));

const MetricCard = styled(Box)(({ theme }) => ({
  background: "var(--ae-surface)",
  border: "1px solid var(--ae-border)",
  borderRadius: "12px",
  padding: "16px",
  display: "flex",
  flexDirection: "column",
  gap: "4px",
}));

/* ─── Constants ─── */
const STEPS = ["Upload Sizing", "Validate Data", "Contact Info", "Download"];
const API_BASE = "";

export default function ProposalAssistant({ onBack }) {
  const { token } = useAuth();
  const [activeStep, setActiveStep] = useState(0);
  const [discoveryId, setDiscoveryId] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [useCases, setUseCases] = useState([]);
  const [activeTab, setActiveTab] = useState(0);
  
  // Sizing Configs
  const [configs, setConfigs] = useState({
    workDays: 1,
    totalBots: 18,
    cycleTime: 5,
    hwProdCpu: 3,
    hwProdCores: 6,
  });

  // Client Data
  const [clientData, setClientData] = useState({
    client_name: "",
    proposal_date: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    contact_name: "",
    contact_title: "",
    contact_address: "",
    contact_email: "",
    contact_mobile: "",
    client_image: null, // Base64 or local path if we handle upload
  });

  const [generating, setGenerating] = useState(false);
  const [downloadInfo, setDownloadInfo] = useState(null);

  /* ─── API Handlers ─── */
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("enrich", "true");

    try {
      const response = await fetch(`${API_BASE}/api/proposal/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) throw new Error("Upload failed");

      const data = await response.json();
      setUseCases(data.use_cases);
      setDiscoveryId(data.discovery_id);
      if (data.use_cases.length > 0) {
        setClientData(prev => ({ ...prev, client_name: data.use_cases[0].client_name || "" }));
      }
      setActiveStep(1);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const formData = new FormData();
      
      // Build request body metadata
      const body = {
        ...clientData,
        discovery_id: discoveryId,
        use_cases: useCases.map(uc => ({
           sr_no: uc.sr_no,
           process_name: uc.process_name,
           process_summary: uc.summary || "",
           daily_volume: String(uc.daily_volume),
           complexity: uc.complexity || "Medium",
           ps_efforts: uc.ps_efforts || 0,
           ai_plugins: uc.ai_plugins || 0,
           solution_mapping: uc.solution_mapping || ""
        }))
      };
      
      formData.append("data", JSON.stringify(body));
      if (clientData.client_image) {
        formData.append("logo", clientData.client_image);
      }

      const response = await fetch(`${API_BASE}/api/proposal/generate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) throw new Error("Generation failed");

      const data = await response.json();
      setDownloadInfo(data);
      setActiveStep(3);
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  /* ─── Recalculation Logics ─── */
  const totals = {
    dailyVolume: useCases.reduce((sum, uc) => sum + (parseInt(uc.daily_volume) || 0), 0),
    psEfforts: useCases.reduce((sum, uc) => sum + (parseInt(uc.ps_efforts) || 0), 0),
    aiPlugins: useCases.reduce((sum, uc) => sum + (parseInt(uc.ai_plugins) || 0), 0),
    docsAnnually: useCases.reduce((sum, uc) => sum + (parseInt(uc.docs_annually) || 0), 0),
  };

  const swMetrics = (() => {
    const sysTime = 960; // 16 hrs * 60
    const botTotalTime = sysTime * configs.workDays * configs.totalBots;
    const procTime = configs.cycleTime * totals.dailyVolume;
    const prodCap = procTime > 0 ? (botTotalTime / procTime) : 0;
    const totalProdCap = configs.totalBots * totals.dailyVolume;
    const casesPerBot = configs.totalBots > 0 ? (totals.dailyVolume / configs.totalBots) : 0;
    const utilisation = botTotalTime > 0 ? (procTime / botTotalTime) : 0;

    const botCost = configs.totalBots * 250000;
    const docCost = totals.docsAnnually * 2;
    const pluginCost = totals.aiPlugins * 300000;
    const grandTotal = botCost + docCost + pluginCost;

    return {
      botTotalTime, procTime, prodCap, totalProdCap, casesPerBot, utilisation,
      botCost, docCost, pluginCost, grandTotal
    };
  })();

  const hwMetrics = (() => {
    const roundToStandardRam = (gb) => {
      const standards = [8, 16, 32, 64, 128, 256, 512];
      for (const s of standards) if (gb <= s) return s;
      return Math.ceil(gb / 128) * 128;
    };

    const baseRam = (configs.totalBots * 4) + 5;
    const withSpare = baseRam / 0.64; // 36% spare
    const coreRam = configs.hwProdCores * 6;
    const finalRam = roundToStandardRam(Math.max(withSpare, coreRam));

    return { finalRam, baseRam, withSpare, coreRam };
  })();

  /* ─── Sub-Components ─── */
  const renderStepContent = () => {
    switch (activeStep) {
      case 0: return <UploadStep onUpload={handleFileUpload} isUploading={isUploading} error={uploadError} />;
      case 1: return (
        <ValidationStep 
          useCases={useCases} 
          setUseCases={setUseCases} 
          activeTab={activeTab} 
          setActiveTab={setActiveTab}
          totals={totals}
          configs={configs}
          setConfigs={setConfigs}
          swMetrics={swMetrics}
          hwMetrics={hwMetrics}
        />
      );
      case 2: return <ContactStep data={clientData} setData={setClientData} />;
      case 3: return <CompleteStep info={downloadInfo} onRestart={() => setActiveStep(0)} />;
      default: return null;
    }
  };

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", bgcolor: "background.default", color: "text.primary" }}>
      {/* Header */}
      <Box sx={{ px: 4, py: 2, borderBottom: "1px solid var(--ae-border)", display: "flex", alignItems: "center", gap: 2 }}>
        <IconButton onClick={onBack} size="small" sx={{ color: "text.secondary" }}><ArrowBackIcon /></IconButton>
        <Typography variant="h6" sx={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, color: "text.primary" }}>Proposal Assistant</Typography>
        <Box sx={{ flex: 1 }} />
        <Stepper activeStep={activeStep} sx={{ width: "400px", "& .MuiStepLabel-label": { color: "text.secondary", fontSize: "12px" }, "& .MuiStepLabel-active": { color: "#F26522 !important" } }}>
          {STEPS.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
        </Stepper>
      </Box>

      {/* Main Content */}
      <Box sx={{ flex: 1, overflowY: "auto", p: 4 }}>
        {renderStepContent()}
      </Box>

      {/* Footer Actions */}
      {activeStep > 0 && activeStep < 3 && (
        <Box sx={{ px: 4, py: 2, borderTop: "1px solid var(--ae-border)", display: "flex", justifyContent: "space-between", background: "var(--ae-glass)", backdropFilter: "blur(12px)" }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => setActiveStep(s => s - 1)} sx={{ color: "text.secondary" }}>Back</Button>
          <ActionButton 
            variant="contained" 
            endIcon={activeStep === 2 ? (generating ? <CircularProgress size={16} /> : <CheckCircleIcon />) : <ArrowForwardIcon />}
            onClick={activeStep === 2 ? handleGenerate : () => setActiveStep(s => s + 1)}
            disabled={generating}
            sx={{ background: "linear-gradient(135deg, #F26522 0%, #e55a1b 100%)" }}
          >
            {activeStep === 2 ? (generating ? "Generating..." : "Generate Proposal") : "Continue"}
          </ActionButton>
        </Box>
      )}
    </Box>
  );
}

/* ──── Step Views ──── */

function UploadStep({ onUpload, isUploading, error }) {
  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3 }}>
      <GlassPaper sx={{ maxWidth: 600, width: "100%", textAlign: "center", py: 8 }}>
        <CloudUploadIcon sx={{ fontSize: 64, color: "#F26522", mb: 2 }} />
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>Upload Discovery Sizing</Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 4 }}>
          Upload the project discovery Excel sheet (.xlsx). <br/>
          We'll use Vertex AI to automatically size complexity and effort.
        </Typography>

        <input type="file" accept=".xlsx,.xls" id="excel-upload" hidden onChange={onUpload} />
        <label htmlFor="excel-upload">
          <ActionButton component="span" variant="contained" disabled={isUploading} sx={{ background: "#F26522", px: 6 }}>
            {isUploading ? <><CircularProgress size={20} color="inherit" sx={{ mr: 1 }} /> Processing...</> : "Select Excel File"}
          </ActionButton>
        </label>
        
        {error && <Alert severity="error" sx={{ mt: 3, borderRadius: "10px" }}>{error}</Alert>}
      </GlassPaper>
    </Box>
  );
}

function ValidationStep({ useCases, setUseCases, activeTab, setActiveTab, totals, configs, setConfigs, swMetrics, hwMetrics }) {
  const handleComplexityChange = (sr, val) => {
    setUseCases(prev => prev.map(uc => uc.sr_no === sr ? { ...uc, complexity: val } : uc));
  };

  const handleInputChange = (sr, field, val) => {
    setUseCases(prev => prev.map(uc => uc.sr_no === sr ? { ...uc, [field]: val } : uc));
  };

  return (
    <Box>
      {/* Mini Summary Strip */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid item xs={3}><MetricCard><Typography sx={{ fontSize: 11, color: "#8fa3c0" }}>USE CASES</Typography><Typography variant="h4" sx={{ fontWeight: 700 }}>{useCases.length}</Typography></MetricCard></Grid>
        <Grid item xs={3}><MetricCard><Typography sx={{ fontSize: 11, color: "#8fa3c0" }}>TOTAL DAILY VOL</Typography><Typography variant="h4" sx={{ fontWeight: 700 }}>{totals.dailyVolume}</Typography></MetricCard></Grid>
        <Grid item xs={3}><MetricCard><Typography sx={{ fontSize: 11, color: "#8fa3c0" }}>TOTAL PS EFFORTS</Typography><Typography variant="h4" sx={{ fontWeight: 700 }}>{totals.psEfforts} <span style={{ fontSize: 14, fontWeight: 400 }}>days</span></Typography></MetricCard></Grid>
        <Grid item xs={3}><MetricCard><Typography sx={{ fontSize: 11, color: "#8fa3c0" }}>AI PLUGINS</Typography><Typography variant="h4" sx={{ fontWeight: 700 }}>{totals.aiPlugins}</Typography></MetricCard></Grid>
      </Grid>

      <Box sx={{ borderBottom: 1, borderColor: "var(--ae-border)", mb: 3 }}>
        <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} sx={{ "& .MuiTab-root": { color: "text.secondary", textTransform: "none", minWidth: 120 } }}>
          <Tab icon={<DashboardIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Use Cases" />
          <Tab icon={<AssessmentIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Software Metrics" />
          <Tab icon={<StorageIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Hardware Sizing" />
        </Tabs>
      </Box>

      {activeTab === 0 && (
        <TableContainer component={GlassPaper} sx={{ p: 0 }}>
          <Table size="small">
            <TableHead sx={{ bgcolor: "var(--ae-glass)" }}>
              <TableRow>
                <TableCell sx={{ color: "text.primary", fontWeight: 700, width: 50 }}>#</TableCell>
                <TableCell sx={{ color: "text.primary", fontWeight: 700 }}>Process Name</TableCell>
                <TableCell sx={{ color: "text.primary", fontWeight: 700 }}>Daily Vol</TableCell>
                <TableCell sx={{ color: "text.primary", fontWeight: 700 }}>Complexity</TableCell>
                <TableCell sx={{ color: "text.primary", fontWeight: 700 }}>Efforts</TableCell>
                <TableCell sx={{ color: "text.primary", fontWeight: 700 }}>Solution Mapping</TableCell>
                <TableCell sx={{ color: "text.primary", fontWeight: 700, width: 80 }}>Plugins</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {useCases.map((uc, i) => (
                <TableRow key={uc.sr_no} sx={{ "&:hover": { bgcolor: "rgba(255,255,255,0.02)" } }}>
                  <TableCell sx={{ color: "#8fa3c0" }}>{uc.sr_no}</TableCell>
                  <TableCell sx={{ color: "#fff", fontWeight: 500 }}>{uc.process_name}</TableCell>
                  <TableCell>
                    <TextField 
                      size="small" variant="standard" type="number" 
                      value={uc.daily_volume} 
                      onChange={(e) => handleInputChange(uc.sr_no, "daily_volume", e.target.value)}
                      sx={{ input: { color: "text.primary", fontSize: 13, textAlign: "center", width: 60 } }} 
                    />
                  </TableCell>
                  <TableCell>
                    <Select 
                      size="small" 
                      value={uc.complexity || "Medium"} 
                      onChange={(e) => handleComplexityChange(uc.sr_no, e.target.value)}
                      sx={{ 
                        height: 28, fontSize: 12, borderRadius: 20, px: 1,
                        bgcolor: uc.complexity === "Simple" ? "rgba(76, 175, 130, 0.2)" : (uc.complexity === "Complex" ? "rgba(211, 47, 47, 0.2)" : "rgba(255, 152, 0, 0.2)"),
                        color: uc.complexity === "Simple" ? "#4caf50" : (uc.complexity === "Complex" ? "#f44336" : "#ff9800"),
                        "& .MuiOutlinedInput-notchedOutline": { border: "none" }
                      }}
                    >
                      <MenuItem value="Simple">Simple</MenuItem>
                      <MenuItem value="Medium">Medium</MenuItem>
                      <MenuItem value="Complex">Complex</MenuItem>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <TextField 
                      size="small" variant="standard" type="number" 
                      value={uc.ps_efforts} 
                      onChange={(e) => handleInputChange(uc.sr_no, "ps_efforts", e.target.value)}
                      sx={{ input: { color: "text.primary", fontSize: 13, textAlign: "center", width: 40 } }} 
                    />
                  </TableCell>
                  <TableCell>
                    <TextField 
                      size="small" variant="standard" fullWidth
                      value={uc.solution_mapping} 
                      onChange={(e) => handleInputChange(uc.sr_no, "solution_mapping", e.target.value)}
                      sx={{ input: { color: "text.secondary", fontSize: 12 } }} 
                    />
                  </TableCell>
                  <TableCell>
                    <TextField 
                      size="small" variant="standard" type="number" 
                      value={uc.ai_plugins} 
                      onChange={(e) => handleInputChange(uc.sr_no, "ai_plugins", e.target.value)}
                      sx={{ input: { color: "#fff", fontSize: 13, textAlign: "center", width: 30 } }} 
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {activeTab === 1 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <GlassPaper sx={{ height: "100%" }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
                <SettingsIcon sx={{ fontSize: 20, color: "#F26522" }} /> Capacity Config
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField 
                    label="No. of BOTs" fullWidth size="small" type="number"
                    value={configs.totalBots} onChange={(e) => setConfigs({ ...configs, totalBots: parseInt(e.target.value) || 0 })}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField 
                    label="Cycle Time (min)" fullWidth size="small" type="number"
                    value={configs.cycleTime} onChange={(e) => setConfigs({ ...configs, cycleTime: parseInt(e.target.value) || 0 })}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField 
                    label="Working Days" fullWidth size="small" type="number"
                    value={configs.workDays} onChange={(e) => setConfigs({ ...configs, workDays: parseInt(e.target.value) || 0 })}
                  />
                </Grid>
              </Grid>
            </GlassPaper>
          </Grid>
          <Grid item xs={12} md={8}>
            <GlassPaper>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>BOT Metrics Output</Typography>
              <Table size="small">
                <TableBody sx={{ "& .MuiTableCell-root": { color: "#8fa3c0", py: 1.5 } }}>
                  <TableRow><TableCell>Productive Capacity</TableCell><TableCell align="right" sx={{ color: "#fff !important", fontWeight: 700 }}>{(swMetrics.prodCap * 100).toFixed(2)}%</TableCell></TableRow>
                  <TableRow><TableCell>Expected Cases / BOT / Day</TableCell><TableCell align="right" sx={{ color: "#fff !important", fontWeight: 700 }}>{swMetrics.casesPerBot.toFixed(1)}</TableCell></TableRow>
                  <TableRow><TableCell>BOT Utilisation</TableCell><TableCell align="right" sx={{ color: "#fff !important", fontWeight: 700 }}>{(swMetrics.utilisation * 100).toFixed(2)}%</TableCell></TableRow>
                </TableBody>
              </Table>
              <Divider sx={{ my: 2, borderColor: "rgba(255,255,255,0.06)" }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>Commercial Estimation (INR)</Typography>
              <Table size="small">
                <TableBody sx={{ "& .MuiTableCell-root": { color: "#8fa3c0", py: 1 } }}>
                  <TableRow><TableCell>Bot Licensing (₹2.5L/bot)</TableCell><TableCell align="right" sx={{ color: "#fff !important" }}>₹{swMetrics.botCost.toLocaleString()}</TableCell></TableRow>
                  <TableRow><TableCell>DocEdge (₹2/page)</TableCell><TableCell align="right" sx={{ color: "#fff !important" }}>₹{swMetrics.docCost.toLocaleString()}</TableCell></TableRow>
                  <TableRow><TableCell>AI Plugins (₹3L/plugin)</TableCell><TableCell align="right" sx={{ color: "#fff !important" }}>₹{swMetrics.pluginCost.toLocaleString()}</TableCell></TableRow>
                  <TableRow sx={{ "& .MuiTableCell-root": { border: "none" } }}><TableCell sx={{ fontWeight: 800, color: "#F26522 !important" }}>Total Annual Subscription</TableCell><TableCell align="right" sx={{ color: "#F26522 !important", fontWeight: 800, fontSize: 18 }}>₹{swMetrics.grandTotal.toLocaleString()}</TableCell></TableRow>
                </TableBody>
              </Table>
            </GlassPaper>
          </Grid>
        </Grid>
      )}

      {activeTab === 2 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={7}>
            <GlassPaper>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>Production Infrastructure (Onpremise)</Typography>
              <Table size="small">
                <TableBody sx={{ "& .MuiTableCell-root": { color: "#8fa3c0", borderBottom: "1px solid rgba(255,255,255,0.05)" } }}>
                  <TableRow><TableCell>Servers</TableCell><TableCell sx={{ color: "#fff !important" }}>2 High Availability</TableCell></TableRow>
                  <TableRow>
                     <TableCell>CPU / Cores</TableCell>
                     <TableCell sx={{ display: "flex", gap: 1, py: 1 }}>
                        <TextField size="small" type="number" sx={{ width: 60 }} value={configs.hwProdCpu} onChange={e => setConfigs({...configs, hwProdCpu: parseInt(e.target.value)})}/> 
                        <Typography sx={{ mt: 1 }}>/</Typography>
                        <TextField size="small" type="number" sx={{ width: 60 }} value={configs.hwProdCores} onChange={e => setConfigs({...configs, hwProdCores: parseInt(e.target.value)})}/> 
                     </TableCell>
                  </TableRow>
                  <TableRow><TableCell>RAM (GB) <Chip label="AUTO" size="small" sx={{ height: 16, fontSize: 9, ml: 1, bgcolor: "rgba(242,101,34,0.2)", color: "#F26522" }}/></TableCell><TableCell sx={{ color: "#F26522 !important", fontWeight: 800 }}>{hwMetrics.finalRam} GB</TableCell></TableRow>
                  <TableRow><TableCell>Hard Disk</TableCell><TableCell sx={{ color: "#fff !important" }}>500 GB (SSD Recommended)</TableCell></TableRow>
                </TableBody>
              </Table>
            </GlassPaper>
          </Grid>
          <Grid item xs={12} md={5}>
            <GlassPaper sx={{ bgcolor: "rgba(242,101,34,0.03)", borderColor: "rgba(242,101,34,0.15)" }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "#F26522", mb: 1.5 }}>RAM Logic Proof</Typography>
              <Box sx={{ fontSize: 12, color: "text.secondary", display: "flex", flexDirection: "column", gap: 1 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}><span>BOT RAM ({configs.totalBots} bots × 4GB)</span><span>{configs.totalBots * 4} GB</span></Box>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}><span>OS Overhead</span><span>5 GB</span></Box>
                <Box sx={{ display: "flex", justifyContent: "space-between", color: "text.primary" }}><span>With 36% Spare</span><span>{hwMetrics.withSpare.toFixed(1)} GB</span></Box>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}><span>Core-to-RAM Ratio (1:6)</span><span>{hwMetrics.coreRam} GB</span></Box>
                <Divider sx={{ my: 0.5, borderColor: "var(--ae-border)" }} />
                <Box sx={{ display: "flex", justifyContent: "space-between", color: "#F26522", fontWeight: 700, fontSize: 13 }}><span>Final Standard Rounded</span><span>{hwMetrics.finalRam} GB</span></Box>
              </Box>
            </GlassPaper>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}

function ContactStep({ data, setData }) {
  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setData({ ...data, client_image_preview: reader.result, client_image: file });
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <Box sx={{ maxWidth: 800, mx: "auto" }}>
      <GlassPaper>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 3, display: "flex", alignItems: "center", gap: 1 }}>
          <ContactPageIcon sx={{ color: "#F26522" }} /> Proposal Branding & Contact
        </Typography>
        
        <Grid container spacing={3}>
           <Grid item xs={12} sm={6}>
              <TextField label="Client Name" fullWidth value={data.client_name} onChange={e => setData({...data, client_name: e.target.value})} sx={{ input: { color: "#fff" } }}/>
           </Grid>
           <Grid item xs={12} sm={6}>
              <TextField label="Proposal Date" fullWidth value={data.proposal_date} onChange={e => setData({...data, proposal_date: e.target.value})} />
           </Grid>

           <Grid item xs={12}>
             <Box sx={{ p: 2, border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 2, textAlign: "center" }}>
                <Typography variant="caption" sx={{ color: "#8fa3c0", display: "block", mb: 1 }}>CLIENT LOGO (Optional)</Typography>
                <input accept="image/*" id="logo-button-file" type="file" hidden onChange={handleLogoUpload} />
                <label htmlFor="logo-button-file">
                   <IconButton color="primary" aria-label="upload picture" component="span" sx={{ bgcolor: "rgba(242,101,34,0.1)", "&:hover": { bgcolor: "rgba(242,101,34,0.2)" } }}>
                      <PhotoCamera sx={{ color: "#F26522" }} />
                   </IconButton>
                </label>
                {data.client_image_preview && (
                  <Box sx={{ mt: 2, display: "flex", justifyContent: "center" }}>
                    <img src={data.client_image_preview} style={{ maxHeight: 60, borderRadius: 4 }} alt="client logo" />
                  </Box>
                )}
             </Box>
           </Grid>

           <Grid item xs={12}><Divider sx={{ borderColor: "rgba(255,255,255,0.06)" }} /></Grid>

           <Grid item xs={12} sm={6}><TextField label="Contact Name" fullWidth value={data.contact_name} onChange={e => setData({...data, contact_name: e.target.value})}/></Grid>
           <Grid item xs={12} sm={6}><TextField label="Designation" fullWidth value={data.contact_title} onChange={e => setData({...data, contact_title: e.target.value})}/></Grid>
           <Grid item xs={12} sm={6}><TextField label="Email" fullWidth value={data.contact_email} onChange={e => setData({...data, contact_email: e.target.value})}/></Grid>
           <Grid item xs={12} sm={6}><TextField label="Mobile" fullWidth value={data.contact_mobile} onChange={e => setData({...data, contact_mobile: e.target.value})}/></Grid>
           <Grid item xs={12}><TextField label="Site Address" fullWidth multiline rows={2} value={data.contact_address} onChange={e => setData({...data, contact_address: e.target.value})}/></Grid>
        </Grid>
      </GlassPaper>
    </Box>
  );
}

function CompleteStep({ info, onRestart }) {
  const { token } = useAuth();
  
  const downloadFile = async (fileUrl, fileName) => {
     try {
       const response = await fetch(`${API_BASE}${fileUrl}`, {
         headers: {
           'Authorization': `Bearer ${token}`
         }
       });
       if (!response.ok) throw new Error("Download failed");
       
       const blob = await response.blob();
       const url = window.URL.createObjectURL(blob);
       const a = document.createElement("a");
       a.href = url;
       a.download = fileName;
       document.body.appendChild(a);
       a.click();
       window.URL.revokeObjectURL(url);
       document.body.removeChild(a);
     } catch (err) {
       console.error("Download error:", err);
       alert("Failed to download file. Please try again.");
     }
  };

  const handleDownloadDocx = () => downloadFile(info.download_url_docx, info.docx);
  const handleDownloadXlsx = () => downloadFile(info.download_url_xlsx, info.xlsx);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 3 }}>
      <GlassPaper sx={{ maxWidth: 500, width: "100%", textAlign: "center", py: 6 }}>
        <CheckCircleIcon sx={{ fontSize: 80, color: "#4caf50", mb: 2 }} />
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>Proposal Ready!</Typography>
        <Typography variant="body2" sx={{ color: "#8fa3c0", mb: 4 }}>
          Your budgetary proposal and project sizing document has been generated successfully.
        </Typography>

        <Box sx={{ display: "flex", gap: 2, justifyContent: "center" }}>
           <ActionButton variant="contained" startIcon={<DownloadIcon />} onClick={handleDownloadDocx} sx={{ background: "#4caf50" }}>
             Download Docx
           </ActionButton>
           <ActionButton variant="contained" startIcon={<DownloadIcon />} onClick={handleDownloadXlsx} sx={{ background: "#217346" }}>
             Download Excel
           </ActionButton>
           <Button variant="outlined" onClick={onRestart} sx={{ borderColor: "rgba(255,255,255,0.2)", color: "#fff" }}>
             Create New
           </Button>
        </Box>
      </GlassPaper>
    </Box>
  );
}
