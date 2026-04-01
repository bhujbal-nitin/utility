import React, { useState, useMemo } from "react";
import {
  Box,
  Typography,
  Button,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Select,
  MenuItem,
  TextField,
  Chip,
  CircularProgress,
  Fade,
  Tabs,
  Tab,
  Grid,
  Divider,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import DownloadIcon from "@mui/icons-material/Download";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import AssessmentIcon from "@mui/icons-material/Assessment";
import SettingsSuggestIcon from "@mui/icons-material/SettingsSuggest";
import MemoryIcon from "@mui/icons-material/Memory";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { useAuth } from "../context/AuthContext";
import axios from "axios";

const STEPS = {
  UPLOAD: 1,
  VALIDATE: 2,
  SUCCESS: 3,
  PROPOSAL: 4,
};

const COMPLEXITY_OPTIONS = ["Simple", "Medium", "Complex"];

function TabPanel(props) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

export default function ProposalStudio({ onBack }) {
  const { token } = useAuth();
  const [step, setStep] = useState(STEPS.UPLOAD);
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [discoveryFile, setDiscoveryFile] = useState(null);
  const [useCases, setUseCases] = useState([]);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [downloadFilename, setDownloadFilename] = useState(null);
  const [wordUrl, setWordUrl] = useState(null);
  const [wordFilename, setWordFilename] = useState(null);

  // Tabs and Sizing state
  const [activeTab, setActiveTab] = useState(0);
  const [softParams, setSoftParams] = useState({ workDays: 1, totalBots: 18, cycleTime: 5, sysHours: 16 });
  const [hwData, setHwData] = useState({
    prodApp: { servers: 1, app: "AutomationEdge Application Server\n(Main Server incl. Active MQ, PostgreSQL DB, DocEdge)", server: "VM", cpu: 1, core: 4, ram: 24, hd: "500", os: "MS Windows Server 2022/2023 – 64 bit", db: "PostgreSQL (Default)", web: "Apache Tomcat" },
    prodProc: { servers: 1, app: "AutomationEdge Processing Server\n(incl. IDP Processing Agents & Robot Sessions)", server: "VM", cpu: 1, core: 4, ram: 16, hd: "500", os: "MS Windows Server 2022/2023 – 64 bit", db: "-", web: "-" },
    uat: { servers: 1, app: "AE Main Server, DocEdge Server, Active MQ, PostgreSQL DB & Processing Server", server: "VM", cpu: 1, core: 4, ram: 16, hd: "500", os: "MS Windows Server 2022/2023 – 64 bit", db: "PostgreSQL (Default)", web: "Apache Tomcat" },
    dev: { servers: 4, app: "Desktop Development Machine for Chatbot / Script Development", server: "Desktop / VM", cpu: 1, core: 4, ram: 8, hd: "500", os: "Windows 7 Professional – 64 bit", db: "PostgreSQL (Default)", web: "NA" }
  });

  const updateHw = (env, field, val) => {
    setHwData(prev => ({ ...prev, [env]: { ...prev[env], [field]: val } }));
  };

  // Client Info for Word Proposal
  const [clientInfo, setClientInfo] = useState({
    clientName: "",
    proposalDate: new Date().toLocaleDateString("en-US", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    contactName: "",
    contactTitle: "",
    contactAddress: "",
    contactEmail: "",
    contactMobile: "",
  });

  const authHeaders = {
    Authorization: `Bearer ${token}`,
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.match(/\.(xlsx|xls)$/)) {
      setFile(droppedFile);
    }
  };

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) setFile(selectedFile);
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file, file.name);
    try {
      const res = await axios.post("/api/proposal/upload", formData, {
        headers: {
          ...authHeaders,
          "Content-Type": "multipart/form-data",
        },
      });
      setDiscoveryFile(res.data.discovery_file);
      setUseCases(res.data.use_cases);
      setStep(STEPS.VALIDATE);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.detail || "Error uploading file.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const res = await axios.post(
        "/api/proposal/generate",
        {
          discovery_file: discoveryFile,
          use_cases: useCases,
          work_days: softParams.workDays,
          total_bots: softParams.totalBots,
          cycle_time: botMetrics.avgExecTime,
          hw_data: hwData,
          sys_hours: parseFloat(softParams.sysHours) || 16,
        },
        { headers: authHeaders }
      );
      setDownloadUrl(res.data.download_url);
      setDownloadFilename(res.data.filename);
      setStep(STEPS.SUCCESS);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.detail || "Error generating proposal document.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async (url, filename) => {
    try {
      const response = await axios.get(url, {
        headers: authHeaders,
        responseType: "blob",
      });
      const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = blobUrl;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error("Download failed:", err);
      alert("Error downloading the document.");
    }
  };

  const handleGenerateWord = async () => {
    setIsGenerating(true);
    try {
      const totalDocs = useCases.reduce((acc, u) => acc + (parseInt(u.docs_annually) || 0), 0);
      const totalPlugins = useCases.reduce((acc, u) => acc + (parseInt(u.ai_plugins) || 0), 0);
      const res = await axios.post(
        "/api/proposal/generate-word",
        {
          use_cases: useCases,
          client_info: clientInfo,
          software: {
            num_bots: softParams.totalBots,
            idp_pages: totalDocs.toLocaleString("en-IN"),
            num_plugins: totalPlugins,
          },
          hardware: {
            production: {
              servers: [
                [hwData.prodApp.servers, hwData.prodApp.app, hwData.prodApp.server, hwData.prodApp.cpu, hwData.prodApp.core, hwData.prodApp.ram, hwData.prodApp.hd, hwData.prodApp.os, hwData.prodApp.db, hwData.prodApp.web],
                [hwData.prodProc.servers, hwData.prodProc.app, hwData.prodProc.server, hwData.prodProc.cpu, hwData.prodProc.core, hwData.prodProc.ram, hwData.prodProc.hd, hwData.prodProc.os, hwData.prodProc.db, hwData.prodProc.web]
              ]
            },
            uat: {
              servers: [
                [hwData.uat.servers, hwData.uat.app, hwData.uat.server, hwData.uat.cpu, hwData.uat.core, hwData.uat.ram, hwData.uat.hd, hwData.uat.os, hwData.uat.db, hwData.uat.web]
              ]
            },
            development: {
              servers: [
                [hwData.dev.servers, hwData.dev.app, hwData.dev.server, hwData.dev.cpu, hwData.dev.core, hwData.dev.ram, hwData.dev.hd, hwData.dev.os, hwData.dev.db, hwData.dev.web]
              ]
            },
            processing_server: {
              ram: hwData.prodProc.ram,
              core: hwData.prodProc.core
            }
          },
        },
        { headers: authHeaders }
      );
      setWordUrl(res.data.download_url);
      setWordFilename(res.data.filename);
      setStep(STEPS.SUCCESS);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.detail || "Error generating Word proposal.");
    } finally {
      setIsGenerating(false);
    }
  };

  const updateClientInfo = (field, value) => {
    setClientInfo({ ...clientInfo, [field]: value });
  };

  const COMPLEXITY_MAP = { "Simple": 15, "Medium": 30, "Complex": 45 };

  const updateUseCase = (idx, field, value) => {
    const updated = [...useCases];
    if (['daily_volume', 'docs_annually', 'ps_efforts', 'ai_plugins', 'estimated_exec_time'].includes(field)) {
      const numVal = parseFloat(value) || 0;
      updated[idx][field] = numVal;
      // Auto-update Docs/Yr if IDP is selected and Daily Volume changes
      if (field === 'daily_volume' && updated[idx]['idp'] === 'Yes') {
        updated[idx]['docs_annually'] = numVal * 365;
      }
    } else if (field === 'idp') {
      updated[idx][field] = value;
      // Auto-update Docs/Yr when IDP changes to Yes
      if (value === 'Yes') {
        updated[idx]['docs_annually'] = (updated[idx]['daily_volume'] || 0) * 365;
      }
    } else if (field === 'complexity') {
      updated[idx][field] = value;
      // Auto-update PS efforts based on complexity
      updated[idx]['ps_efforts'] = COMPLEXITY_MAP[value] || 30;
    } else {
      updated[idx][field] = value;
    }
    setUseCases(updated);
  };

  const totalEfforts = useMemo(() => useCases.reduce((acc, u) => acc + (parseInt(u.ps_efforts) || 0), 0), [useCases]);
  const totalPlugins = useMemo(() => useCases.reduce((acc, u) => acc + (parseInt(u.ai_plugins) || 0), 0), [useCases]);
  const totalDailyVol = useMemo(() => useCases.reduce((acc, u) => acc + (parseInt(u.daily_volume) || 0), 0), [useCases]);
  const totalDocs = useMemo(() => useCases.reduce((acc, u) => acc + (parseInt(u.docs_annually) || 0), 0), [useCases]);

  // Sizing Calculations (v8)
  const botMetrics = useMemo(() => {
    const sysTime = (parseFloat(softParams.sysHours) || 16) * 60; // default 960 min
    const res = useCases.filter(u => parseFloat(u.estimated_exec_time) > 0);
    const avgExecTime = res.length > 0
      ? res.reduce((acc, u) => acc + parseFloat(u.estimated_exec_time), 0) / res.length
      : (softParams.cycleTime || 5); // fallback to cycleTime if none filled

    // Capacity of ONE bot
    const oneBotTime = sysTime * softParams.workDays;
    // Total workload
    const procTimeRequired = avgExecTime * totalDailyVol;

    // Auto-calculate suggested bots (standard logic: Workload / One Bot Capacity)
    let suggestedBots = 1;
    if (oneBotTime > 0 && procTimeRequired > 0) {
      suggestedBots = Math.ceil(procTimeRequired / oneBotTime);
    }

    // Total capacity of the SELECTED number of bots
    const botTotalAvailable = oneBotTime * softParams.totalBots;
    const productiveCapacity = procTimeRequired > 0 ? (botTotalAvailable / procTimeRequired) * 100 : 0;
    const utilisation = botTotalAvailable > 0 ? (procTimeRequired / botTotalAvailable) * 100 : 0;

    const botCost = softParams.totalBots * 250000;
    const docCost = totalDocs * 2;
    const pluginCost = totalPlugins * 300000;

    return {
      avgExecTime: avgExecTime.toFixed(1),
      botTotalAvailable,
      procTimeRequired,
      suggestedBots,
      productiveCapacity: productiveCapacity.toFixed(2) + "%",
      utilisation: utilisation.toFixed(2) + "%",
      expectedTotalCap: softParams.totalBots * totalDailyVol,
      casesPerBot: softParams.totalBots > 0 ? (totalDailyVol / softParams.totalBots).toFixed(1) : 0,
      botCost, docCost, pluginCost,
      grandTotal: botCost + docCost + pluginCost
    };
  }, [softParams, useCases, totalDailyVol, totalDocs, totalPlugins]);

  // Reactive Sync: Auto-update Total BOTs if Suggested changes
  React.useEffect(() => {
    if (botMetrics.suggestedBots && botMetrics.suggestedBots !== softParams.totalBots) {
      setSoftParams(prev => ({ ...prev, totalBots: botMetrics.suggestedBots }));
    }
  }, [botMetrics.suggestedBots, softParams.totalBots]);

  // Hardware RAM Calculation (v8 CEILING logic with standard slabs)
  const hwRamResult = useMemo(() => {
    const STD_RAM = [8, 16, 32, 64, 128, 256, 512];
    const STD_CORES = [2, 4, 6, 8, 12, 16, 24, 32, 48, 64];

    const roundUp = (val, slabs) => {
      for (let s of slabs) { if (val <= s) return s; }
      return Math.ceil(val / slabs[slabs.length - 1]) * slabs[slabs.length - 1];
    };

    const bots = softParams.totalBots;

    // Processing Server: Total RAM = (bots * 4 + 5) * 1.3 -> round up
    const rawRam = (bots * 4 + 5) * 1.3;
    const totalProcRam = roundUp(rawRam, STD_RAM);
    // Total Cores = Total RAM / 6 -> round up
    const rawCores = totalProcRam / 6;
    const totalProcCore = roundUp(rawCores, STD_CORES);

    // Application Server RAM is now user-editable via hwData
    
    const numServers = hwData.prodProc.servers || 1;
    const procRam = roundUp(totalProcRam / numServers, STD_RAM);
    const procCore = roundUp(totalProcCore / numServers, STD_CORES);

    return {
      procRam,
      procCore,
      rawRam, rawCores
    };
  }, [softParams.totalBots, hwData.prodProc.servers]);

  // Reactive Sync: Auto-update user editable procRam and procCore when hwRamResult calculates a new base
  React.useEffect(() => {
    setHwData(prev => ({
      ...prev,
      prodProc: {
        ...prev.prodProc,
        core: hwRamResult.procCore,
        ram: hwRamResult.procRam
      }
    }));
  }, [hwRamResult.procCore, hwRamResult.procRam]);

  return (
    <Box sx={{ flex: 1, display: "flex", flexDirection: "column", p: 3, pt: 2, overflow: "hidden" }}>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", mb: 3 }}>
        <IconButton onClick={onBack} sx={{ color: "#8fa3c0", mr: 2 }}>
          <ArrowBackIcon />
        </IconButton>
        <Box>
          <Typography variant="h5" sx={{ color: "#fff", fontWeight: 700 }}>
            {step === STEPS.UPLOAD && "Scope Commercials Generator"}
            {step === STEPS.VALIDATE && "Review & Validate AI Output"}
            {step === STEPS.SUCCESS && "Generation Complete"}
            {step === STEPS.PROPOSAL && "Generate Proposal Document"}
          </Typography>
          <Typography variant="body2" sx={{ color: "#8fa3c0" }}>
            {step === STEPS.UPLOAD && "Upload the client's Discovery Sheet and let AI automatically assess complexity, PS efforts and solution components."}
            {step === STEPS.VALIDATE && `Vertex AI analysed ${useCases.length} use cases. Adjust any values below, then generate Excel.`}
            {step === STEPS.SUCCESS && "All documents successfully prepared."}
            {step === STEPS.PROPOSAL && "Fill in client details to create the personalised proposal (.docx)"}
          </Typography>
        </Box>
      </Box>

      {/* Main Content Area */}
      <Box sx={{ flex: 1, overflowY: "auto", pr: 1, '&::-webkit-scrollbar': { width: '8px' }, '&::-webkit-scrollbar-thumb': { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '4px' } }}>
        <Fade in timeout={500}>
          <Box>
            {step === STEPS.UPLOAD && (
              <Box sx={{ display: "flex", gap: 3 }}>
                <Paper
                  sx={{
                    flex: 1, p: 4, bgcolor: "rgba(17,34,64,0.6)", backdropFilter: "blur(10px)",
                    border: "1px dashed", borderColor: file ? "#F26522" : "rgba(255,255,255,0.15)",
                    borderRadius: 3, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 300
                  }}
                  onDragOver={(e) => e.preventDefault()} onDrop={handleFileDrop}
                >
                  <CloudUploadOutlinedIcon sx={{ fontSize: 60, color: file ? "#F26522" : "#8fa3c0", mb: 2 }} />
                  <Typography variant="h6" sx={{ color: "#fff", mb: 1 }}>Drag & Drop Discovery Sheet</Typography>
                  <Typography variant="body2" sx={{ color: "#8fa3c0", mb: 3 }}>Supported formats: .xlsx, .xls</Typography>
                  <input type="file" id="discovery-upload" accept=".xlsx,.xls" style={{ display: "none" }} onChange={handleFileSelect} />
                  <label htmlFor="discovery-upload"><Button variant="outlined" component="span" sx={{ color: "#e8edf5", borderColor: "rgba(255,255,255,0.2)" }}>Browse File</Button></label>
                  {file && <Typography sx={{ mt: 3, color: "#fff", fontWeight: 600 }}>Selected: {file.name}</Typography>}
                  {file && (
                    <Button variant="contained" onClick={handleUpload} disabled={isUploading}
                      sx={{ mt: 4, bgcolor: "#F26522", color: "#fff", px: 4, py: 1.2, borderRadius: "8px", "&:hover": { bgcolor: "#d9531e" } }}
                    >
                      {isUploading ? <CircularProgress size={24} color="inherit" /> : "Upload & Analyse with AI"}
                    </Button>
                  )}
                </Paper>
                <Paper sx={{ width: 350, p: 3, bgcolor: "rgba(17,34,64,0.6)", borderRadius: 3, border: "1px solid rgba(255,255,255,0.05)" }}>
                  <Typography variant="h6" sx={{ color: "#fff", mb: 3 }}>How it works</Typography>
                  {[
                    { icon: <DescriptionOutlinedIcon />, title: "Parse Discovery Sheet", desc: "Extracts all use case rows including process name, volume, applications, and summary." },
                    { icon: <AssessmentIcon />, title: "Convert Volumes to Daily", desc: "Any volume is automatically converted to a daily figure." },
                    { icon: <AutoAwesomeIcon />, title: "AI Enrichment via Vertex AI", desc: "Gemini analyses each use case and suggests Complexity, PS Efforts, Solution Mapping and AI Plugins." },
                    { icon: <CheckCircleOutlineIcon />, title: "Review & Edit", desc: "You validate and adjust any AI-generated values before the Excel is built." },
                    { icon: <DownloadIcon />, title: "Generate Scope Excel", desc: "6-sheet workbook generated with formulas, cross-sheet references, and formatting." },
                  ].map((item, i) => (
                    <Box key={i} sx={{ display: "flex", gap: 2, mb: 3 }}>
                      <Box sx={{ color: "#F26522", mt: 0.5 }}>{item.icon}</Box>
                      <Box><Typography sx={{ color: "#fff", fontWeight: 600, fontSize: "14px" }}>{item.title}</Typography><Typography sx={{ color: "#8fa3c0", fontSize: "12px" }}>{item.desc}</Typography></Box>
                    </Box>
                  ))}
                </Paper>
              </Box>
            )}

            {step === STEPS.VALIDATE && (
              <Box>
                {/* Summary Cards */}
                <Box sx={{ display: "flex", gap: 2, mb: 3 }}>
                  <Paper sx={{ flex: 1, p: 2, bgcolor: "rgba(17,34,64,0.6)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 2 }}>
                    <Typography sx={{ fontSize: "11px", color: "#8fa3c0", fontWeight: 700, textTransform: "uppercase" }}>Use Cases</Typography>
                    <Typography sx={{ color: "#fff", fontSize: "24px", fontWeight: 700 }}>{useCases.length}</Typography>
                  </Paper>
                  <Paper sx={{ flex: 1, p: 2, bgcolor: "rgba(17,34,64,0.6)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 2 }}>
                    <Typography sx={{ fontSize: "11px", color: "#8fa3c0", fontWeight: 700, textTransform: "uppercase" }}>Total Daily Volume</Typography>
                    <Typography sx={{ color: "#fff", fontSize: "24px", fontWeight: 700 }}>{totalDailyVol}</Typography>
                  </Paper>
                  <Paper sx={{ flex: 1, p: 2, bgcolor: "rgba(242,101,34,0.1)", border: "1px solid rgba(242,101,34,0.3)", borderRadius: 2 }}>
                    <Typography sx={{ fontSize: "11px", color: "#F26522", fontWeight: 700, textTransform: "uppercase" }}>Total PS Efforts</Typography>
                    <Typography sx={{ color: "#fff", fontSize: "24px", fontWeight: 700 }}>{totalEfforts} <span style={{ fontSize: 14 }}>days</span></Typography>
                  </Paper>
                  <Paper sx={{ flex: 1, p: 2, bgcolor: "rgba(17,34,64,0.6)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 2 }}>
                    <Typography sx={{ fontSize: "11px", color: "#8fa3c0", fontWeight: 700, textTransform: "uppercase" }}>Avg Exec Time (Min)</Typography>
                    <Typography sx={{ color: "#fff", fontSize: "24px", fontWeight: 700 }}>{botMetrics.avgExecTime} <span style={{ fontSize: 14 }}>min</span></Typography>
                  </Paper>
                </Box>


                {/* Tabs */}
                <Box sx={{ borderBottom: 1, borderColor: "rgba(255,255,255,0.1)", mb: 0 }}>
                  <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} textColor="inherit"
                    sx={{ '& .MuiTabs-indicator': { backgroundColor: '#F26522' }, '& .MuiTab-root': { color: '#8fa3c0', '&.Mui-selected': { color: '#fff' } } }}>
                    <Tab icon={<ViewModuleIcon sx={{ fontSize: 18 }} />} label="Use Cases" iconPosition="start" />
                    <Tab icon={<AssessmentIcon sx={{ fontSize: 18 }} />} label="Volume Calculation" iconPosition="start" />
                    <Tab icon={<SettingsSuggestIcon sx={{ fontSize: 18 }} />} label="Software Sizing" iconPosition="start" />
                    <Tab icon={<MemoryIcon sx={{ fontSize: 18 }} />} label="Hardware Specs" iconPosition="start" />
                  </Tabs>
                </Box>

                {/* Tab Content Panels */}
                <TabPanel value={activeTab} index={0}>
                  <Box sx={{ mb: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
                    <Typography sx={{ fontSize: '12px', color: '#e8edf5', fontWeight: 600 }}>Legend:</Typography>
                    <Chip size="small" label="✨ AI-generated" sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '11px' }} />
                    <Chip size="small" label="✏️ User to fill" sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '11px' }} />
                  </Box>
                  <TableContainer component={Paper} sx={{ bgcolor: "rgba(17,34,64,0.6)", overflowX: "auto", borderRadius: 2, border: "1px solid rgba(255,255,255,0.05)" }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ '& th': { color: "#8fa3c0", fontWeight: 700, fontSize: "11px", py: 1.5, borderBottom: "1px solid rgba(255,255,255,0.1)", whiteSpace: 'nowrap' } }}>
                          <TableCell>#</TableCell>
                          <TableCell>Process Name</TableCell>
                          <TableCell>Applications</TableCell>
                          <TableCell>IDP ✏️</TableCell>
                          <TableCell>Raw Volume ✏️</TableCell>
                          <TableCell>Daily ✏️</TableCell>
                          <TableCell>Docs/Year ✏️</TableCell>
                          <TableCell>Complexity ✨</TableCell>
                          <TableCell>PS Efforts (Days) ✨</TableCell>
                          <TableCell>Exec Time (Min) ✏️</TableCell>
                          <TableCell>Solution Mapping ✨</TableCell>
                          <TableCell>AI Plugins ✨</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {useCases.map((uc, i) => (
                          <TableRow key={i} sx={{ '& td': { borderColor: "rgba(255,255,255,0.05)", py: 1 } }}>
                            <TableCell sx={{ color: "#8fa3c0" }}>{uc.sr_no}</TableCell>
                            <TableCell>
                              <Typography sx={{ fontWeight: 600, fontSize: "13px", color: "#fff" }}>{uc.process_name}</Typography>
                            </TableCell>
                            <TableCell>
                              <Typography sx={{ fontSize: "11px", color: "#8fa3c0" }}>{uc.apps}</Typography>
                            </TableCell>
                            <TableCell>
                              <Select size="small" value={uc.idp || "No"} onChange={(e) => updateUseCase(i, "idp", e.target.value)}
                                sx={{ height: 30, fontSize: "12px", color: "#fff" }}>
                                <MenuItem value="Yes">Yes</MenuItem>
                                <MenuItem value="No">No</MenuItem>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <TextField size="small" value={uc.raw_volume || ""} onChange={(e) => updateUseCase(i, "raw_volume", e.target.value)}
                                sx={{ width: 100, '& input': { color: '#fff', fontSize: '12px', p: 0.5 } }} />
                            </TableCell>
                            <TableCell>
                              <TextField size="small" type="number" value={uc.daily_volume} onChange={(e) => updateUseCase(i, "daily_volume", e.target.value)}
                                sx={{ width: 60, '& input': { color: '#fff', fontSize: '13px', p: 0.5 } }} inputProps={{ min: 0 }} />
                            </TableCell>
                            <TableCell>
                              <TextField size="small" type="number" value={uc.docs_annually || 0} onChange={(e) => updateUseCase(i, "docs_annually", e.target.value)}
                                sx={{ width: 70, '& input': { color: '#8fa3c0', fontSize: '13px', p: 0.5 } }} inputProps={{ min: 0 }} />
                            </TableCell>
                            <TableCell>
                              <Select size="small" value={uc.complexity || "Medium"} onChange={(e) => updateUseCase(i, "complexity", e.target.value)}
                                sx={{ height: 30, fontSize: "12px", color: "#fff", minWidth: 90 }}>
                                {COMPLEXITY_OPTIONS.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
                              </Select>
                            </TableCell>
                            <TableCell>
                              <TextField size="small" type="number" value={uc.ps_efforts} onChange={(e) => updateUseCase(i, "ps_efforts", e.target.value)}
                                sx={{ width: 60, '& input': { color: '#fff', fontSize: '13px', p: 0.5 } }} />
                            </TableCell>
                            <TableCell>
                              <TextField size="small" type="number" value={uc.estimated_exec_time || 0} onChange={(e) => updateUseCase(i, "estimated_exec_time", e.target.value)}
                                sx={{ width: 60, '& input': { color: '#FFFF99', fontSize: '13px', p: 0.5, fontWeight: 700 } }} inputProps={{ min: 0, step: 0.5 }} />
                            </TableCell>
                            <TableCell>
                              <TextField size="small" value={uc.solution_mapping || ""} onChange={(e) => updateUseCase(i, "solution_mapping", e.target.value)}
                                sx={{ '& input': { color: '#fff', fontSize: '10px', p: 0.8 }, width: 120 }} />
                            </TableCell>
                            <TableCell>
                              <TextField size="small" type="number" value={uc.ai_plugins || 1} onChange={(e) => updateUseCase(i, "ai_plugins", e.target.value)}
                                sx={{ width: 50, '& input': { color: '#fff', fontSize: '13px', p: 0.5 } }} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </TabPanel>

                <TabPanel value={activeTab} index={1}>
                  <TableContainer component={Paper} sx={{ bgcolor: "rgba(17,34,64,0.6)", borderRadius: 2 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ '& th': { color: "#8fa3c0", fontWeight: 700, borderBottom: "1px solid rgba(255,255,255,0.1)" } }}>
                          <TableCell>#</TableCell><TableCell>Proposed Use Case</TableCell>
                          <TableCell align="center">Daily Vol</TableCell>
                          <TableCell align="center">Monthly</TableCell>
                          <TableCell align="center">Annual</TableCell>
                          <TableCell align="center">Docs/Yr</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {useCases.map((uc, i) => (
                          <TableRow key={i} sx={{ '& td': { borderColor: "rgba(255,255,255,0.05)", color: "#e8edf5" } }}>
                            <TableCell>{i + 1}</TableCell>
                            <TableCell>{uc.process_name}</TableCell>
                            <TableCell align="center">{uc.daily_volume}</TableCell>
                            <TableCell align="center">{uc.daily_volume * 30}</TableCell>
                            <TableCell align="center">{uc.daily_volume * 365}</TableCell>
                            <TableCell align="center">{uc.docs_annually || 0}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow sx={{ bgcolor: "rgba(242,101,34,0.15)" }}>
                          <TableCell colSpan={2} sx={{ fontWeight: 700, color: "#fff" }}>Total</TableCell>
                          <TableCell align="center" sx={{ fontWeight: 700, color: "#fff" }}>{totalDailyVol}</TableCell>
                          <TableCell align="center" sx={{ fontWeight: 700, color: "#fff" }}>{totalDailyVol * 30}</TableCell>
                          <TableCell align="center" sx={{ fontWeight: 700, color: "#fff" }}>{totalDailyVol * 365}</TableCell>
                          <TableCell align="center" sx={{ fontWeight: 700, color: "#fff" }}>{totalDocs}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </TableContainer>
                </TabPanel>

                <TabPanel value={activeTab} index={2}>
                  <Grid container spacing={3}>
                    <Grid item xs={12} md={7}>
                      <Paper sx={{ p: 3, bgcolor: "rgba(17,34,64,0.6)", borderRadius: 2 }}>
                        <Typography variant="subtitle2" sx={{ color: "#F26522", mb: 2, fontWeight: 700 }}>1. BOT Availability</Typography>
                        <Table size="small" sx={{ mb: 4 }}>
                          <TableBody sx={{ '& td': { borderColor: 'rgba(255,255,255,0.05)', py: 1.2 } }}>
                            <TableRow>
                              <TableCell sx={{ color: '#8fa3c0' }}>Lowest Available Daily System Time (Hrs/Day)</TableCell>
                              <TableCell align="right">
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
                                  <TextField type="number" size="small" value={softParams.sysHours} onChange={(e) => setSoftParams({ ...softParams, sysHours: parseFloat(e.target.value) || 16 })} sx={{ width: 80, '& input': { color: '#fff', textAlign: 'center', p: 0.5 } }} />
                                  <Typography sx={{ color: '#F26522', fontWeight: 700, ml: 1 }}>= {(softParams.sysHours || 16) * 60} Min</Typography>
                                </Box>
                              </TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell sx={{ color: '#8fa3c0' }}>No. of Actual Working Days per Month</TableCell>
                              <TableCell align="right">
                                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                                  <TextField type="number" size="small" value={softParams.workDays} onChange={(e) => setSoftParams({ ...softParams, workDays: parseInt(e.target.value) || 1 })} sx={{ width: 80, '& input': { color: '#fff', textAlign: 'center', p: 0.5 } }} />
                                </Box>
                              </TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell sx={{ color: '#8fa3c0' }}>Total BOTs Expected (Suggested)</TableCell>
                              <TableCell align="right" sx={{ color: '#F26522', fontWeight: 800 }}>{botMetrics.suggestedBots}</TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell sx={{ color: '#8fa3c0' }}>BOTs Total Time Available (Min) — for 1 BOT</TableCell>
                              <TableCell align="right" sx={{ color: '#fff', fontWeight: 700 }}>{(softParams.sysHours || 16) * 60 * (softParams.workDays || 1)}</TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>

                        <Typography variant="subtitle2" sx={{ color: "#F26522", mb: 2, fontWeight: 700 }}>2. Volume & Processing</Typography>
                        <Table size="small" sx={{ mb: 4 }}>
                          <TableBody sx={{ '& td': { borderColor: 'rgba(255,255,255,0.05)', py: 1.2 } }}>
                            <TableRow>
                              <TableCell sx={{ color: '#8fa3c0' }}>Estimated Cycle Time Per Ticket (Min)</TableCell>
                              <TableCell align="right" sx={{ color: '#F26522', fontWeight: 800 }}>{botMetrics.avgExecTime} <span style={{ fontSize: '10px', color: '#8fa3c0', fontWeight: 'normal' }}>(Avg of Exec Table)</span></TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell sx={{ color: '#8fa3c0' }}>Ticket/Request Per Day (Total Vol)</TableCell>
                              <TableCell align="right" sx={{ color: '#fff', fontWeight: 700 }}>{totalDailyVol}</TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell sx={{ color: '#8fa3c0' }}>Time Required for Daily Processing (Min)</TableCell>
                              <TableCell align="right" sx={{ color: '#fff', fontWeight: 700 }}>{botMetrics.procTimeRequired}</TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>

                        <Typography variant="subtitle2" sx={{ color: "#F26522", mb: 2, fontWeight: 700 }}>BOT Metrics</Typography>
                        <Table size="small">
                          <TableBody sx={{ '& td': { borderColor: 'rgba(255,255,255,0.05)', py: 1.2 } }}>
                            <TableRow>
                              <TableCell sx={{ color: '#8fa3c0' }}>No. of BOTs <span style={{ fontSize: '10px', color: '#F26522', fontWeight: 'bold' }}>(Override if needed)</span></TableCell>
                              <TableCell align="right">
                                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                                  <TextField type="number" size="small" value={softParams.totalBots} onChange={(e) => setSoftParams({ ...softParams, totalBots: parseInt(e.target.value) || 1 })} sx={{ width: 80, '& input': { color: '#FFFF99', fontWeight: 'bold', textAlign: 'center', p: 0.5 }, '& fieldset': { borderColor: '#F26522' } }} />
                                </Box>
                              </TableCell>
                            </TableRow>
                            <TableRow><TableCell sx={{ color: '#8fa3c0' }}>Productive Capacity</TableCell><TableCell align="right" sx={{ color: '#fff', fontWeight: 700 }}>{botMetrics.productiveCapacity}</TableCell></TableRow>
                            <TableRow><TableCell sx={{ color: '#8fa3c0' }}>Expected Total Production Capacity/Day</TableCell><TableCell align="right" sx={{ color: '#fff', fontWeight: 700 }}>{botMetrics.expectedTotalCap}</TableCell></TableRow>
                            <TableRow><TableCell sx={{ color: '#8fa3c0' }}>Expected Cases/BOT/Day</TableCell><TableCell align="right" sx={{ color: '#fff', fontWeight: 700 }}>{botMetrics.casesPerBot}</TableCell></TableRow>
                            <TableRow><TableCell sx={{ color: '#8fa3c0' }}>BOT Utilisation</TableCell><TableCell align="right" sx={{ color: '#fff', fontWeight: 700 }}>{botMetrics.utilisation}</TableCell></TableRow>
                          </TableBody>
                        </Table>

                        <Typography variant="subtitle2" sx={{ color: "#F26522", mt: 4, mb: 1.5, fontWeight: 700 }}>Exec Time Breakdown (per use case)</Typography>
                        <TableContainer sx={{ maxHeight: 200, bgcolor: 'rgba(0,0,0,0.1)', borderRadius: 1 }}>
                          <Table size="small" stickyHeader>
                            <TableHead>
                              <TableRow sx={{ '& th': { bgcolor: '#1a2e4c', color: '#8fa3c0', borderColor: 'rgba(255,255,255,0.05)', fontSize: 10 } }}>
                                <TableCell>#</TableCell>
                                <TableCell>Use Case</TableCell>
                                <TableCell align="right">Min</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {useCases.map((uc, i) => (
                                <TableRow key={i} sx={{ '& td': { borderColor: 'rgba(255,255,255,0.05)', color: '#e8edf5', fontSize: 11 } }}>
                                  <TableCell>{uc.sr_no}</TableCell>
                                  <TableCell sx={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{uc.process_name}</TableCell>
                                  <TableCell align="right" sx={{ color: parseFloat(uc.estimated_exec_time) > 0 ? '#FFFF99' : '#555' }}>
                                    {uc.estimated_exec_time || '—'}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      </Paper>
                    </Grid>
                    <Grid item xs={12} md={5}>
                      <Paper sx={{ p: 3, bgcolor: "rgba(17,34,64,0.6)", borderRadius: 2, height: "100%" }}>
                        <Typography variant="subtitle2" sx={{ color: "#F26522", mb: 2, fontWeight: 700 }}>Commercials</Typography>
                        <Box sx={{ mb: 2 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                            <Typography sx={{ color: '#e8edf5', fontSize: '13px' }}>Unassisted Bots ({softParams.totalBots})</Typography>
                            <Typography sx={{ color: '#fff', fontWeight: 600 }}>₹{botMetrics.botCost.toLocaleString('en-IN')}</Typography>
                          </Box>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                            <Typography sx={{ color: '#e8edf5', fontSize: '13px' }}>DocEdge ({totalDocs} docs)</Typography>
                            <Typography sx={{ color: '#fff', fontWeight: 600 }}>₹{botMetrics.docCost.toLocaleString('en-IN')}</Typography>
                          </Box>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                            <Typography sx={{ color: '#e8edf5', fontSize: '13px' }}>AI Plugins ({totalPlugins})</Typography>
                            <Typography sx={{ color: '#fff', fontWeight: 600 }}>₹{botMetrics.pluginCost.toLocaleString('en-IN')}</Typography>
                          </Box>
                          <Divider sx={{ bgcolor: 'rgba(255,255,255,0.1)', my: 2 }} />
                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography sx={{ color: '#fff', fontWeight: 700 }}>Total Annual Cost</Typography>
                            <Typography sx={{ color: '#F26522', fontWeight: 800, fontSize: '18px' }}>₹{botMetrics.grandTotal.toLocaleString('en-IN')}</Typography>
                          </Box>
                        </Box>
                      </Paper>
                    </Grid>
                  </Grid>
                </TabPanel>

                <TabPanel value={activeTab} index={3}>
                  <Grid container spacing={3}>
                    <Grid item xs={12} md={8}>
                      <Paper sx={{ p: 3, bgcolor: "rgba(17,34,64,0.6)", borderRadius: 2 }}>
                        <Typography variant="subtitle2" sx={{ color: "#F26522", mb: 2, fontWeight: 700 }}>Production Environment (Onpremise)</Typography>
                        <Box sx={{ mb: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
                          <Typography sx={{ fontSize: '12px', color: '#e8edf5', fontWeight: 600 }}>Legend:</Typography>
                          <Chip size="small" label="✏️ Editable" sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '11px' }} />
                          <Chip size="small" label="✨ Auto-calculated" sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '11px' }} />
                        </Box>

                        <TableContainer sx={{ mb: 4, overflowX: "auto" }}>
                          <Table size="small">
                            <TableHead>
                              <TableRow sx={{ '& th': { bgcolor: '#1a2e4c', color: '#8fa3c0', fontSize: '11px', borderColor: 'rgba(255,255,255,0.05)', whiteSpace: 'nowrap' } }}>
                                <TableCell>No. of Servers</TableCell>
                                <TableCell>Applications / Module</TableCell>
                                <TableCell>Server</TableCell>
                                <TableCell>CPU</TableCell>
                                <TableCell>Core</TableCell>
                                <TableCell>RAM (GB)</TableCell>
                                <TableCell>HD (GB)</TableCell>
                                <TableCell>OS</TableCell>
                                <TableCell>DB</TableCell>
                                <TableCell>Web Server</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody sx={{ '& td': { borderColor: 'rgba(255,255,255,0.05)', color: '#e8edf5', fontSize: '11px' } }}>
                              <TableRow>
                                <TableCell align="center">
                                  <TextField size="small" value={hwData.prodApp.servers} onChange={(e) => updateHw('prodApp', 'servers', parseInt(e.target.value) || 1)} sx={{ width: 50, '& input': { color: '#FFFF99', p: 0.5, textAlign: 'center', fontSize: '11px' } }} />
                                </TableCell>
                                <TableCell>
                                  <TextField multiline size="small" value={hwData.prodApp.app} onChange={(e) => updateHw('prodApp', 'app', e.target.value)} sx={{ width: 200, '& textarea': { color: '#FFFF99', p: 0.5, fontSize: '11px', lineHeight: 1.2 } }} />
                                </TableCell>
                                <TableCell align="center">
                                  <TextField size="small" value={hwData.prodApp.server} onChange={(e) => updateHw('prodApp', 'server', e.target.value)} sx={{ width: 70, '& input': { color: '#FFFF99', p: 0.5, textAlign: 'center', fontSize: '11px' } }} />
                                </TableCell>
                                <TableCell align="center">
                                  <TextField size="small" type="number" value={hwData.prodApp.cpu} onChange={(e) => updateHw('prodApp', 'cpu', parseInt(e.target.value) || 1)} sx={{ width: 50, '& input': { color: '#FFFF99', p: 0.5, textAlign: 'center', fontSize: '11px' } }} />
                                </TableCell>
                                <TableCell align="center">
                                  <TextField size="small" type="number" value={hwData.prodApp.core} onChange={(e) => updateHw('prodApp', 'core', parseInt(e.target.value) || 1)} sx={{ width: 50, '& input': { color: '#FFFF99', p: 0.5, textAlign: 'center', fontSize: '11px' } }} />
                                </TableCell>
                                <TableCell align="center">
                                  <TextField size="small" type="number" value={hwData.prodApp.ram} onChange={(e) => updateHw('prodApp', 'ram', parseInt(e.target.value) || 1)} sx={{ width: 50, '& input': { color: '#FFFF99', p: 0.5, textAlign: 'center', fontSize: '11px' } }} />
                                </TableCell>
                                <TableCell align="center">
                                  <TextField size="small" value={hwData.prodApp.hd} onChange={(e) => updateHw('prodApp', 'hd', e.target.value)} sx={{ width: 60, '& input': { color: '#FFFF99', p: 0.5, textAlign: 'center', fontSize: '11px' } }} />
                                </TableCell>
                                <TableCell>
                                  <TextField size="small" value={hwData.prodApp.os} onChange={(e) => updateHw('prodApp', 'os', e.target.value)} sx={{ width: 140, '& input': { color: '#FFFF99', p: 0.5, fontSize: '11px' } }} />
                                </TableCell>
                                <TableCell>
                                  <TextField size="small" value={hwData.prodApp.db} onChange={(e) => updateHw('prodApp', 'db', e.target.value)} sx={{ width: 100, '& input': { color: '#FFFF99', p: 0.5, fontSize: '11px' } }} />
                                </TableCell>
                                <TableCell>
                                  <TextField size="small" value={hwData.prodApp.web} onChange={(e) => updateHw('prodApp', 'web', e.target.value)} sx={{ width: 100, '& input': { color: '#FFFF99', p: 0.5, fontSize: '11px' } }} />
                                </TableCell>
                              </TableRow>
                              <TableRow>
                                <TableCell align="center">
                                  <TextField size="small" value={hwData.prodProc.servers} onChange={(e) => updateHw('prodProc', 'servers', parseInt(e.target.value) || 1)} sx={{ width: 50, '& input': { color: '#FFFF99', p: 0.5, textAlign: 'center', fontSize: '11px' } }} />
                                </TableCell>
                                <TableCell>
                                  <TextField multiline size="small" value={hwData.prodProc.app} onChange={(e) => updateHw('prodProc', 'app', e.target.value)} sx={{ width: 200, '& textarea': { color: '#FFFF99', p: 0.5, fontSize: '11px', lineHeight: 1.2 } }} />
                                </TableCell>
                                <TableCell align="center">
                                  <TextField size="small" value={hwData.prodProc.server} onChange={(e) => updateHw('prodProc', 'server', e.target.value)} sx={{ width: 70, '& input': { color: '#FFFF99', p: 0.5, textAlign: 'center', fontSize: '11px' } }} />
                                </TableCell>
                                <TableCell align="center">
                                  <TextField size="small" type="number" value={hwData.prodProc.cpu} onChange={(e) => updateHw('prodProc', 'cpu', parseInt(e.target.value) || 1)} sx={{ width: 50, '& input': { color: '#FFFF99', p: 0.5, textAlign: 'center', fontSize: '11px' } }} />
                                </TableCell>
                                <TableCell align="center">
                                  <TextField size="small" type="number" value={hwData.prodProc.core} onChange={(e) => updateHw('prodProc', 'core', parseInt(e.target.value) || 1)} sx={{ width: 50, '& input': { color: '#F26522', p: 0.5, textAlign: 'center', fontSize: '11px', fontWeight: 700 } }} />
                                </TableCell>
                                <TableCell align="center">
                                  <TextField size="small" type="number" value={hwData.prodProc.ram} onChange={(e) => updateHw('prodProc', 'ram', parseInt(e.target.value) || 1)} sx={{ width: 50, '& input': { color: '#F26522', p: 0.5, textAlign: 'center', fontSize: '11px', fontWeight: 700 } }} />
                                </TableCell>
                                <TableCell align="center">
                                  <TextField size="small" value={hwData.prodProc.hd} onChange={(e) => updateHw('prodProc', 'hd', e.target.value)} sx={{ width: 60, '& input': { color: '#FFFF99', p: 0.5, textAlign: 'center', fontSize: '11px' } }} />
                                </TableCell>
                                <TableCell>
                                  <TextField multiline size="small" value={hwData.prodProc.os} onChange={(e) => updateHw('prodProc', 'os', e.target.value)} sx={{ width: 140, '& textarea': { color: '#FFFF99', p: 0.5, fontSize: '11px', lineHeight: 1.2 } }} />
                                </TableCell>
                                <TableCell align="center">
                                  <TextField size="small" value={hwData.prodProc.db} onChange={(e) => updateHw('prodProc', 'db', e.target.value)} sx={{ width: 100, '& input': { color: '#FFFF99', p: 0.5, textAlign: 'center', fontSize: '11px' } }} />
                                </TableCell>
                                <TableCell align="center">
                                  <TextField size="small" value={hwData.prodProc.web} onChange={(e) => updateHw('prodProc', 'web', e.target.value)} sx={{ width: 100, '& input': { color: '#FFFF99', p: 0.5, textAlign: 'center', fontSize: '11px' } }} />
                                </TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </TableContainer>

                        <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.05)', mb: 4 }}>
                          <Typography variant="caption" sx={{ color: '#F26522', fontWeight: 700, display: 'block', mb: 1 }}>PROC SERVER CALCULATION BREAKDOWN</Typography>
                          <Typography variant="body2" sx={{ color: '#8fa3c0', fontSize: 11, lineHeight: 1.6 }}>
                            • Total RAM: {softParams.totalBots} bots × 4 GB + 5GB(OS) + 30%(buffer) = <b>{hwRamResult.rawRam.toFixed(1)} GB</b> → Std Slab: <b>{hwRamResult.procRam * (hwData.prodProc.servers || 1)} GB</b><br />
                            • Total Core: {hwRamResult.procRam * (hwData.prodProc.servers || 1)} GB ÷ 6 = <b>{hwRamResult.rawCores.toFixed(1)}</b> → Std Slab: <b>{hwRamResult.procCore * (hwData.prodProc.servers || 1)} Cores</b><br />
                            • Servers: <b>{hwData.prodProc.servers || 1}</b> (Per-server RAM: <b>{hwRamResult.procRam} GB</b>, Per-server Core: <b>{hwRamResult.procCore} Cores</b>)
                          </Typography>
                        </Box>

                        <Typography variant="subtitle2" sx={{ color: "#F26522", mb: 2, fontWeight: 700 }}>UAT Environment (Onpremise)</Typography>
                        <TableContainer sx={{ mb: 4, overflowX: "auto" }}>
                          <Table size="small">
                            <TableHead>
                              <TableRow sx={{ '& th': { bgcolor: '#1a2e4c', color: '#8fa3c0', fontSize: '11px', borderColor: 'rgba(255,255,255,0.05)', whiteSpace: 'nowrap' } }}>
                                <TableCell>No. of Servers</TableCell><TableCell>Applications / Module</TableCell><TableCell>Server</TableCell><TableCell>CPU</TableCell><TableCell>Core</TableCell><TableCell>RAM (GB)</TableCell><TableCell>HD (GB)</TableCell><TableCell>OS</TableCell><TableCell>DB</TableCell><TableCell>Web Server</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody sx={{ '& td': { borderColor: 'rgba(255,255,255,0.05)', color: '#8fa3c0', fontSize: '11px' } }}>
                              <TableRow>
                                <TableCell align="center">
                                  <TextField size="small" type="number" value={hwData.uat.servers} onChange={(e) => updateHw('uat', 'servers', parseInt(e.target.value) || 1)} sx={{ width: 50, '& input': { color: '#FFFF99', p: 0.5, textAlign: 'center', fontSize: '11px' } }} />
                                </TableCell>
                                <TableCell>
                                  <TextField multiline size="small" value={hwData.uat.app} onChange={(e) => updateHw('uat', 'app', e.target.value)} sx={{ width: 200, '& textarea': { color: '#FFFF99', p: 0.5, fontSize: '11px', lineHeight: 1.2 } }} />
                                </TableCell>
                                <TableCell align="center">
                                  <TextField size="small" value={hwData.uat.server} onChange={(e) => updateHw('uat', 'server', e.target.value)} sx={{ width: 70, '& input': { color: '#FFFF99', p: 0.5, textAlign: 'center', fontSize: '11px' } }} />
                                </TableCell>
                                <TableCell align="center">
                                  <TextField size="small" type="number" value={hwData.uat.cpu} onChange={(e) => updateHw('uat', 'cpu', parseInt(e.target.value) || 1)} sx={{ width: 50, '& input': { color: '#FFFF99', p: 0.5, textAlign: 'center', fontSize: '11px' } }} />
                                </TableCell>
                                <TableCell align="center">
                                  <TextField size="small" type="number" value={hwData.uat.core} onChange={(e) => updateHw('uat', 'core', parseInt(e.target.value) || 1)} sx={{ width: 50, '& input': { color: '#FFFF99', p: 0.5, textAlign: 'center', fontSize: '11px' } }} />
                                </TableCell>
                                <TableCell align="center">
                                  <TextField size="small" type="number" value={hwData.uat.ram} onChange={(e) => updateHw('uat', 'ram', parseInt(e.target.value) || 1)} sx={{ width: 50, '& input': { color: '#FFFF99', p: 0.5, textAlign: 'center', fontSize: '11px' } }} />
                                </TableCell>
                                <TableCell align="center">
                                  <TextField size="small" value={hwData.uat.hd} onChange={(e) => updateHw('uat', 'hd', e.target.value)} sx={{ width: 60, '& input': { color: '#FFFF99', p: 0.5, textAlign: 'center', fontSize: '11px' } }} />
                                </TableCell>
                                <TableCell>
                                  <TextField size="small" value={hwData.uat.os} onChange={(e) => updateHw('uat', 'os', e.target.value)} sx={{ width: 140, '& input': { color: '#FFFF99', p: 0.5, fontSize: '11px' } }} />
                                </TableCell>
                                <TableCell>
                                  <TextField size="small" value={hwData.uat.db} onChange={(e) => updateHw('uat', 'db', e.target.value)} sx={{ width: 100, '& input': { color: '#FFFF99', p: 0.5, fontSize: '11px' } }} />
                                </TableCell>
                                <TableCell>
                                  <TextField size="small" value={hwData.uat.web} onChange={(e) => updateHw('uat', 'web', e.target.value)} sx={{ width: 100, '& input': { color: '#FFFF99', p: 0.5, fontSize: '11px' } }} />
                                </TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </TableContainer>

                        <Typography variant="subtitle2" sx={{ color: "#F26522", mb: 2, fontWeight: 700 }}>Development Environment (Offshore Desktop Systems)</Typography>
                        <TableContainer sx={{ mb: 2, overflowX: "auto" }}>
                          <Table size="small">
                            <TableHead>
                              <TableRow sx={{ '& th': { bgcolor: '#1a2e4c', color: '#8fa3c0', fontSize: '11px', borderColor: 'rgba(255,255,255,0.05)', whiteSpace: 'nowrap' } }}>
                                <TableCell>No. of Desktops</TableCell><TableCell>Applications / Module</TableCell><TableCell>Type</TableCell><TableCell>CPU</TableCell><TableCell>Core</TableCell><TableCell>RAM (GB)</TableCell><TableCell>HD (GB)</TableCell><TableCell>OS</TableCell><TableCell>DB</TableCell><TableCell>Web Server</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody sx={{ '& td': { borderColor: 'rgba(255,255,255,0.05)', color: '#8fa3c0', fontSize: '11px' } }}>
                              <TableRow>
                                <TableCell align="center">
                                  <TextField size="small" type="number" value={hwData.dev.servers} onChange={(e) => updateHw('dev', 'servers', parseInt(e.target.value) || 1)} sx={{ width: 50, '& input': { color: '#FFFF99', p: 0.5, textAlign: 'center', fontSize: '11px' } }} />
                                </TableCell>
                                <TableCell>
                                  <TextField multiline size="small" value={hwData.dev.app} onChange={(e) => updateHw('dev', 'app', e.target.value)} sx={{ width: 200, '& textarea': { color: '#FFFF99', p: 0.5, fontSize: '11px', lineHeight: 1.2 } }} />
                                </TableCell>
                                <TableCell align="center">
                                  <TextField size="small" value={hwData.dev.server} onChange={(e) => updateHw('dev', 'server', e.target.value)} sx={{ width: 90, '& input': { color: '#FFFF99', p: 0.5, textAlign: 'center', fontSize: '11px' } }} />
                                </TableCell>
                                <TableCell align="center">
                                  <TextField size="small" type="number" value={hwData.dev.cpu} onChange={(e) => updateHw('dev', 'cpu', parseInt(e.target.value) || 1)} sx={{ width: 50, '& input': { color: '#FFFF99', p: 0.5, textAlign: 'center', fontSize: '11px' } }} />
                                </TableCell>
                                <TableCell align="center">
                                  <TextField size="small" type="number" value={hwData.dev.core} onChange={(e) => updateHw('dev', 'core', parseInt(e.target.value) || 1)} sx={{ width: 50, '& input': { color: '#FFFF99', p: 0.5, textAlign: 'center', fontSize: '11px' } }} />
                                </TableCell>
                                <TableCell align="center">
                                  <TextField size="small" type="number" value={hwData.dev.ram} onChange={(e) => updateHw('dev', 'ram', parseInt(e.target.value) || 1)} sx={{ width: 50, '& input': { color: '#FFFF99', p: 0.5, textAlign: 'center', fontSize: '11px' } }} />
                                </TableCell>
                                <TableCell align="center">
                                  <TextField size="small" value={hwData.dev.hd} onChange={(e) => updateHw('dev', 'hd', e.target.value)} sx={{ width: 60, '& input': { color: '#FFFF99', p: 0.5, textAlign: 'center', fontSize: '11px' } }} />
                                </TableCell>
                                <TableCell>
                                  <TextField size="small" value={hwData.dev.os} onChange={(e) => updateHw('dev', 'os', e.target.value)} sx={{ width: 140, '& input': { color: '#FFFF99', p: 0.5, fontSize: '11px' } }} />
                                </TableCell>
                                <TableCell>
                                  <TextField size="small" value={hwData.dev.db} onChange={(e) => updateHw('dev', 'db', e.target.value)} sx={{ width: 100, '& input': { color: '#FFFF99', p: 0.5, fontSize: '11px' } }} />
                                </TableCell>
                                <TableCell>
                                  <TextField size="small" value={hwData.dev.web} onChange={(e) => updateHw('dev', 'web', e.target.value)} sx={{ width: 60, '& input': { color: '#FFFF99', p: 0.5, fontSize: '11px' } }} />
                                </TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </TableContainer>
                      </Paper>
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <Paper sx={{ p: 3, bgcolor: "rgba(17,34,64,0.6)", borderRadius: 2 }}>
                        <Typography sx={{ color: '#F26522', fontWeight: 700, mb: 1, fontSize: '13px' }}>v8 Logic</Typography>
                        <Typography sx={{ color: '#e8edf5', fontSize: '12px', mb: 1.5 }}>- App Server: User-driven cores/CPU</Typography>
                        <Typography sx={{ color: '#e8edf5', fontSize: '12px', mb: 1.5 }}>- Proc Server: Bot-driven RAM (Bot×4)</Typography>
                        <Typography sx={{ color: '#e8edf5', fontSize: '12px', mb: 1.5 }}>- Std Slabs: 8, 16, 24, 32, 64, 128...</Typography>
                        <Typography sx={{ color: '#8fa3c0', fontSize: '11px' }}>Excel export will include these as formulas for further client adjustment.</Typography>
                      </Paper>
                    </Grid>
                  </Grid>
                </TabPanel>

                {/* Final Actions */}
                <Box sx={{ display: "flex", gap: 2, justifyContent: "flex-end", mt: 4 }}>
                  <Button variant="outlined" onClick={() => { setStep(STEPS.UPLOAD); setFile(null); }} sx={{ color: "#8fa3c0", borderColor: "rgba(255,255,255,0.1)" }}>Cancel</Button>
                  <Button variant="contained" onClick={handleGenerate} disabled={isGenerating} sx={{ bgcolor: "#F26522", color: "#fff", px: 4, fontWeight: 700, "&:hover": { bgcolor: "#d9531e" } }}
                    startIcon={isGenerating ? <CircularProgress size={20} color="inherit" /> : null}>
                    {isGenerating ? "Generating..." : "Generate Proposal Excel"}
                  </Button>
                </Box>
              </Box>
            )}

            {step === STEPS.SUCCESS && (
              <Box sx={{ display: "flex", justifyContent: "center", mt: 5 }}>
                <Paper sx={{ p: 5, bgcolor: "rgba(17,34,64,0.6)", borderRadius: 3, border: "1px solid rgba(255,255,255,0.05)", textAlign: "center", maxWidth: 600 }}>
                  <Box sx={{ width: 80, height: 80, borderRadius: "50%", bgcolor: "rgba(242,101,34,0.1)", display: "flex", alignItems: "center", justifyContent: "center", mx: "auto", mb: 3 }}>
                    <CheckCircleOutlineIcon sx={{ fontSize: 40, color: "#F26522" }} />
                  </Box>
                  <Typography variant="h5" sx={{ color: "#fff", mb: 1, fontWeight: 700 }}>Documents Ready!</Typography>
                  <Typography sx={{ color: "#8fa3c0", mb: 4 }}>The scope commercials and proposal documents have been generated using v8 logic.</Typography>

                  <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mb: 4 }}>
                    {downloadUrl && (
                      <Paper sx={{ p: 2, bgcolor: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <ViewModuleIcon sx={{ color: "#F26522" }} />
                          <Typography sx={{ color: "#fff", fontSize: "14px" }}>Scope Commercials (Excel v8)</Typography>
                        </Box>
                        <Button size="small" variant="contained" onClick={() => handleDownload(downloadUrl, downloadFilename || "Scope_Commercials.xlsx")} startIcon={<DownloadIcon />} sx={{ bgcolor: "#F26522", color: "#fff" }}>Download</Button>
                      </Paper>
                    )}
                    {wordUrl && (
                      <Paper sx={{ p: 2, bgcolor: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <DescriptionOutlinedIcon sx={{ color: "#F26522" }} />
                          <Typography sx={{ color: "#fff", fontSize: "14px" }}>Project Proposal (Word)</Typography>
                        </Box>
                        <Button size="small" variant="contained" onClick={() => handleDownload(wordUrl, wordFilename || "Proposal.docx")} startIcon={<DownloadIcon />} sx={{ bgcolor: "#F26522", color: "#fff" }}>Download</Button>
                      </Paper>
                    )}
                  </Box>

                  <Box sx={{ display: "flex", gap: 2, justifyContent: "center" }}>
                    <Button variant="outlined" onClick={() => setStep(STEPS.VALIDATE)} sx={{ color: "#8fa3c0", borderColor: "rgba(255,255,255,0.1)" }}>Back to Review & Edit</Button>
                    <Button variant="outlined" onClick={() => { setStep(STEPS.UPLOAD); setFile(null); setWordUrl(null); setDownloadUrl(null); }} sx={{ color: "#8fa3c0", borderColor: "rgba(255,255,255,0.2)" }}>New Proposal</Button>
                    {!wordUrl && (
                      <Button variant="contained" onClick={() => setStep(STEPS.PROPOSAL)} sx={{ bgcolor: "#F26522", color: "#fff", "&:hover": { bgcolor: "#d9531e" } }}>Generate Word Proposal</Button>
                    )}
                  </Box>
                </Paper>
              </Box>
            )}

            {step === STEPS.PROPOSAL && (
              <Box sx={{ maxWidth: 800, mx: "auto", mt: 2 }}>
                <Paper sx={{ p: 4, bgcolor: "rgba(17,34,64,0.6)", borderRadius: 3, border: "1px solid rgba(255,255,255,0.05)" }}>
                  <Typography variant="h5" sx={{ color: "#fff", mb: 1, fontWeight: 700 }}>Generate Proposal Document</Typography>
                  <Typography variant="body2" sx={{ color: "#8fa3c0", mb: 4 }}>Fill in client details to create the personalised proposal (.docx)</Typography>

                  {/* Section 1: Page 1 Cover Page */}
                  <Box sx={{ mb: 4 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                      <Chip label="Page 1" size="small" sx={{ bgcolor: "#F26522", color: "#fff", fontWeight: 700, mr: 1, borderRadius: 1 }} />
                      <Typography variant="subtitle1" sx={{ color: "#fff", fontWeight: 700 }}>Cover Page</Typography>
                    </Box>
                    <Grid container spacing={3}>
                      <Grid item xs={12} md={6}>
                        <TextField fullWidth label="Client Name" variant="outlined" value={clientInfo.clientName} onChange={(e) => updateClientInfo("clientName", e.target.value)}
                          placeholder="e.g. Royal Sundaram General Insurance" required
                          sx={{ '& label': { color: '#8fa3c0' }, '& input': { color: '#fff' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }} />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <TextField fullWidth label="Proposal Date" variant="outlined" value={clientInfo.proposalDate} onChange={(e) => updateClientInfo("proposalDate", e.target.value)}
                          placeholder="e.g. Monday, March 31, 2026" required
                          sx={{ '& label': { color: '#8fa3c0' }, '& input': { color: '#fff' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }} />
                      </Grid>
                    </Grid>
                  </Box>

                  {/* Section 2: Page 3 Local Contact Information */}
                  <Box sx={{ mb: 4 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                      <Chip label="Page 3" size="small" sx={{ bgcolor: "#F26522", color: "#fff", fontWeight: 700, mr: 1, borderRadius: 1 }} />
                      <Typography variant="subtitle1" sx={{ color: "#fff", fontWeight: 700 }}>Local Contact Information</Typography>
                    </Box>
                    <Grid container spacing={3}>
                      <Grid item xs={12} md={6}>
                        <TextField fullWidth label="Contact Name" variant="outlined" value={clientInfo.contactName} onChange={(e) => updateClientInfo("contactName", e.target.value)}
                          placeholder="e.g. Archi Upadhyay" required
                          sx={{ mb: 3, '& label': { color: '#8fa3c0' }, '& input': { color: '#fff' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }} />
                        <TextField fullWidth label="Title / Designation" variant="outlined" value={clientInfo.contactTitle} onChange={(e) => updateClientInfo("contactTitle", e.target.value)}
                          placeholder="e.g. Head Inside Sales – AutomationEdge" required
                          sx={{ mb: 3, '& label': { color: '#8fa3c0' }, '& input': { color: '#fff' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }} />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <TextField fullWidth label="Mailing Address" variant="outlined" multiline rows={4} value={clientInfo.contactAddress} onChange={(e) => updateClientInfo("contactAddress", e.target.value)}
                          placeholder="4th Floor, Global Port, Baner, Pune, Maharashtra 411021"
                          sx={{ '& label': { color: '#8fa3c0' }, '& .MuiInputBase-input': { color: '#fff' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }} />
                      </Grid>
                      <Grid item xs={12} md={6} sx={{ mt: -3 }}>
                        <TextField fullWidth label="Email" variant="outlined" value={clientInfo.contactEmail} onChange={(e) => updateClientInfo("contactEmail", e.target.value)}
                          placeholder="name@automationedge.com"
                          sx={{ mb: 3, '& label': { color: '#8fa3c0' }, '& input': { color: '#fff' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }} />
                      </Grid>
                      <Grid item xs={12} md={6} sx={{ mt: -3 }}>
                        <TextField fullWidth label="Mobile" variant="outlined" value={clientInfo.contactMobile} onChange={(e) => updateClientInfo("contactMobile", e.target.value)}
                          placeholder="+91-XXXXXXXXXX"
                          sx={{ '& label': { color: '#8fa3c0' }, '& input': { color: '#fff' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }} />
                      </Grid>
                    </Grid>
                  </Box>

                  {/* Info Box */}
                  <Paper sx={{ p: 2, bgcolor: "rgba(242,101,34,0.05)", border: "1px solid rgba(242,101,34,0.2)", borderRadius: 2, display: "flex", gap: 2, mb: 4 }}>
                    <InfoOutlinedIcon sx={{ color: "#F26522" }} />
                    <Box>
                      <Typography sx={{ color: "#fff", fontWeight: 700, fontSize: "14px", mb: 0.5 }}>What will be auto-generated from your scope data:</Typography>
                      <ul style={{ margin: 0, paddingLeft: 20, color: "#8fa3c0", fontSize: "13px" }}>
                        <li>Section 2 – Scope of Work (use cases from Proposed Use Case sheet)</li>
                        <li>Section 2.2 – Solution Approach with solution mapping per use case</li>
                        <li>Section 3 – AutomationEdge Deployment (from Software & Hardware sheets)</li>
                        <li>Sections 4, 5, 6, 7 – kept as per standard template</li>
                      </ul>
                    </Box>
                  </Paper>

                  <Box sx={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                    <Button variant="outlined" onClick={() => setStep(STEPS.SUCCESS)} sx={{ color: "#8fa3c0", borderColor: "rgba(255,255,255,0.1)" }}>Back</Button>
                    <Button variant="contained" onClick={handleGenerateWord} disabled={isGenerating} sx={{ bgcolor: "#F26522", color: "#fff", px: 4, fontWeight: 700, "&:hover": { bgcolor: "#d9531e" } }}
                      startIcon={isGenerating ? <CircularProgress size={20} color="inherit" /> : <DescriptionOutlinedIcon />}>
                      {isGenerating ? "Generating Word doc..." : "Generate Proposal Word Document"}
                    </Button>
                  </Box>
                </Paper>
              </Box>
            )}
          </Box>
        </Fade>
      </Box>
    </Box>
  );
}
