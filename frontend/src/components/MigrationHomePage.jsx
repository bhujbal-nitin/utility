import { useState } from "react";
import {
    Box,
    IconButton,
    Typography,
    Tooltip,
    Card,
    CardContent,
    CardActionArea,
    Chip,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import BluePrismChatWindow from "./BluePrismChatWindow";
import UiPathChatWindow from "./UiPathChatWindow";
import AutomationAnywhereChatWindow from "./AutomationAnywhereChatWindow";

/* ── Migration Option Icons (SVG or MUI Icons) ──────────────────────────── */
const UiPathIcon = () => (
    <Box
        sx={{
            width: 48,
            height: 48,
            borderRadius: "12px",
            background: "linear-gradient(135deg, #FA4616, #C1350D)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
        }}
    >
        <svg width="24" height="24" viewBox="0 0 40 40" fill="none">
            <path
                d="M8 8H32V32H8V8Z"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="rgba(255,255,255,0.2)"
            />
            <path
                d="M16 16L24 24M24 16L16 24"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
            />
        </svg>
    </Box>
);

const BluePrismIcon = () => (
    <Box
        sx={{
            width: 48,
            height: 48,
            borderRadius: "12px",
            background: "linear-gradient(135deg, #0A3E77, #062B52)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
        }}
    >
        <svg width="24" height="24" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="12" stroke="white" strokeWidth="2.5" fill="rgba(255,255,255,0.1)" />
            <circle cx="20" cy="20" r="4" fill="white" />
            <path d="M20 8V12M20 28V32M8 20H12M28 20H32" stroke="white" strokeWidth="2" />
        </svg>
    </Box>
);

const AAIcon = () => (
    <Box
        sx={{
            width: 48,
            height: 48,
            borderRadius: "12px",
            background: "linear-gradient(135deg, #7C3AED, #5B21B6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
        }}
    >
        <svg width="24" height="24" viewBox="0 0 40 40" fill="none">
            <path
                d="M12 12L28 28M28 12L12 28"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
            />
            <circle cx="20" cy="20" r="15" stroke="white" strokeWidth="2" fill="rgba(255,255,255,0.1)" />
        </svg>
    </Box>
);

/* ── Migration Option Card ───────────────────────────────────────────────── */
const MigrationOptionCard = ({ icon: Icon, title, description, features, onClick, index }) => {
    return (
        <Card
            onClick={onClick}
            sx={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: "16px",
                cursor: "pointer",
                transition: "all 0.22s cubic-bezier(0.4,0,0.2,1)",
                animation: `slideUp 0.4s ease ${index * 100}ms both`,
                "@keyframes slideUp": {
                    from: { opacity: 0, transform: "translateY(20px)" },
                    to: { opacity: 1, transform: "translateY(0)" },
                },
                "&:hover": {
                    background: "rgba(255,255,255,0.06)",
                    borderColor: "rgba(242,101,34,0.45)",
                    transform: "translateY(-4px)",
                    boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
                    "& .migration-arrow": {
                        opacity: 1,
                        transform: "translateX(0)",
                        color: "#F26522",
                    },
                },
            }}
        >
            <CardActionArea sx={{ p: 2.5 }}>
                <CardContent sx={{ p: 0 }}>
                    <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
                        <Icon />
                        <Box sx={{ flex: 1 }}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                                <Typography
                                    sx={{
                                        fontFamily: "'Syne', sans-serif",
                                        fontSize: "18px",
                                        fontWeight: 700,
                                        color: "#fff",
                                        letterSpacing: "-0.3px",
                                    }}
                                >
                                    {title}
                                </Typography>
                            </Box>
                            <Typography
                                sx={{
                                    fontSize: "13px",
                                    color: "#8fa3c0",
                                    lineHeight: 1.6,
                                    mb: 1.5,
                                }}
                            >
                                {description}
                            </Typography>
                            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 1 }}>
                                {features.map((feature, i) => (
                                    <Chip
                                        key={i}
                                        label={feature}
                                        size="small"
                                        sx={{
                                            background: "rgba(255,255,255,0.04)",
                                            border: "1px solid rgba(255,255,255,0.07)",
                                            color: "#506280",
                                            fontSize: "10px",
                                            fontWeight: 500,
                                            height: "22px",
                                        }}
                                    />
                                ))}
                            </Box>
                        </Box>
                        <Box
                            className="migration-arrow"
                            sx={{
                                opacity: 0,
                                transform: "translateX(-10px)",
                                transition: "all 0.22s ease",
                                alignSelf: "center",
                            }}
                        >
                            <ArrowForwardIcon sx={{ fontSize: 20, color: "#F26522" }} />
                        </Box>
                    </Box>
                </CardContent>
            </CardActionArea>
        </Card>
    );
};

/* ── MigrationHomePage Component ────────────────────────────────────────── */
const AELogoHero = () => (
    <Box
        sx={{
            width: 72,
            height: 72,
            borderRadius: "16px",
            background: "#F26522",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            mb: 2,
            boxShadow: "0 10px 30px rgba(242,101,34,0.3)"
        }}
    >
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <path d="M8 28L16 12L24 28" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M11 23H21" stroke="white" strokeWidth="3" strokeLinecap="round" />
            <circle cx="30" cy="14" r="5" fill="white" />
        </svg>
    </Box>
);

export default function MigrationHomePage({ tool, onBack }) {
    const [selectedOption, setSelectedOption] = useState(null);

    const migrationOptions = [
        {
            id: "uipath",
            title: "UiPath to AE",
            icon: UiPathIcon,
            description: "Seamlessly migrate your UiPath workflows, assets, and configurations to AutomationEdge with minimal manual effort.",
            features: ["Workflow Conversion", "Asset Migration", "Schedule Mapping", "Credential Transfer"],
        },
        {
            id: "blueprism",
            title: "Blue Prism to AE",
            icon: BluePrismIcon,
            description: "Transform your Blue Prism processes to AutomationEdge while preserving business logic and integrations.",
            features: ["Process Translation", "Object Migration", "Queue Mapping", "Resource Pooling"],
        },
        {
            id: "automationanywhere",
            title: "Automation Anywhere to AE",
            icon: AAIcon,
            description: "Migrate your Automation Anywhere bots, meta bots, and IQ bots to AutomationEdge's modern architecture.",
            features: ["Bot Conversion", "MetaBot Translation", "IQ Bot Migration", "Control Room Sync"],
        },
    ];

    const handleOptionClick = (option) => {
        setSelectedOption(option);
    };

    if (selectedOption) {
        if (selectedOption.id === "blueprism") {
            return <BluePrismChatWindow tool={tool} onBack={() => setSelectedOption(null)} />;
        }
        if (selectedOption.id === "uipath") {
            return <UiPathChatWindow tool={tool} onBack={() => setSelectedOption(null)} />;
        }
        if (selectedOption.id === "automationanywhere") {
            return <AutomationAnywhereChatWindow tool={tool} onBack={() => setSelectedOption(null)} />;
        }
    }

    return (
        <Box
            sx={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                overflow: "hidden",
                animation: "chatEnter 0.25s ease",
                "@keyframes chatEnter": {
                    from: { opacity: 0, transform: "translateY(8px)" },
                    to: { opacity: 1, transform: "translateY(0)" },
                },
            }}
        >
            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    px: 2.5,
                    py: 1.6,
                    borderBottom: "1px solid rgba(255,255,255,0.07)",
                    background: "rgba(10,22,40,0.5)",
                    backdropFilter: "blur(10px)",
                    flexShrink: 0,
                }}
            >
                <Tooltip title="Back to home">
                    <IconButton
                        onClick={onBack}
                        size="small"
                        sx={{
                            width: 32,
                            height: 32,
                            border: "1px solid rgba(255,255,255,0.07)",
                            borderRadius: "8px",
                            background: "rgba(255,255,255,0.04)",
                            color: "#8fa3c0",
                            "&:hover": {
                                background: "rgba(255,255,255,0.07)",
                                color: "#e8edf5",
                            },
                        }}
                    >
                        <ArrowBackIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                </Tooltip>

                <Box sx={{ flex: 1, display: "flex", alignItems: "center", gap: 1.5 }}>
                    <Typography
                        sx={{
                            fontFamily: "'Syne', sans-serif",
                            fontSize: "15px",
                            fontWeight: 700,
                            color: "#fff",
                            letterSpacing: "-0.2px",
                        }}
                    >
                        {tool?.label || "Migration to AE"}
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.6 }}>
                        <Box
                            sx={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                background: "#4caf82",
                                boxShadow: "0 0 6px rgba(76,175,130,0.6)",
                                animation: "pulse 2.5s ease infinite",
                                "@keyframes pulse": {
                                    "0%,100%": { opacity: 1 },
                                    "50%": { opacity: 0.5 },
                                },
                            }}
                        />
                        <Typography sx={{ fontSize: "11.5px", color: "#4caf82", fontWeight: 500 }}>
                            Ready
                        </Typography>
                    </Box>
                </Box>
            </Box>

            <Box
                sx={{
                    flex: 1,
                    overflowY: "auto",
                    px: { xs: 2, md: 4 },
                    py: { xs: 3, md: 5 },
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                }}
            >
                <Box sx={{ maxWidth: 900, width: "100%" }}>
                    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 2, mb: 5 }}>
                        <AELogoHero />
                        <Typography
                            sx={{
                                fontFamily: "'Syne', sans-serif",
                                fontSize: { xs: "24px", md: "32px" },
                                fontWeight: 700,
                                color: "#fff",
                                letterSpacing: "-0.6px",
                            }}
                        >
                            Choose Your Migration Path
                        </Typography>

                        <Typography
                            sx={{
                                fontSize: "14px",
                                color: "#8fa3c0",
                                lineHeight: 1.6,
                                maxWidth: 520,
                            }}
                        >
                            Select your current RPA platform to begin the guided migration process.
                            We'll help you map, convert, and validate your automation assets.
                        </Typography>
                    </Box>

                    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mb: 4 }}>
                        {migrationOptions.map((option, index) => (
                            <MigrationOptionCard
                                key={option.id}
                                index={index}
                                icon={option.icon}
                                title={option.title}
                                description={option.description}
                                features={option.features}
                                onClick={() => handleOptionClick(option)}
                            />
                        ))}
                    </Box>
                </Box>
            </Box>
        </Box>
    );
}
