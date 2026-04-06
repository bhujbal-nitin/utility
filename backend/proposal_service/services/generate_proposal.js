const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

// Determine paths from process args
const OUTPUT_PATH = process.argv[2] || path.join(__dirname, "output.docx");
const JSON_PATH = process.argv[3];
const TEMPLATE_PATH = "C:\\Users\\nitin.bhujbal\\Desktop\\Proposal\\AE_BusinessProposal_Template_1.docx";

if (!JSON_PATH || !fs.existsSync(JSON_PATH)) {
    console.error("No JSON payload provided or file missing.");
    process.exit(1);
}

try {
    const rawData = fs.readFileSync(JSON_PATH, "utf-8");
    const payload = JSON.parse(rawData);
    generateDocx(payload);
} catch (err) {
    console.error("Failed to parse input or generate document:", err);
    process.exit(1);
}

function numberToWords(num) {
    const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
    const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

    if (num === 0) return "Zero";
    if (num < 10) return ones[num];
    if (num < 20) return teens[num - 10];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? " " + ones[num % 10] : "");
    if (num < 1000) return ones[Math.floor(num / 100)] + " Hundred" + (num % 100 ? " " + numberToWords(num % 100) : "");
    if (num < 10000) return ones[Math.floor(num / 1000)] + " Thousand" + (num % 1000 ? " " + numberToWords(num % 1000) : "");
    return num.toString();
}

function generateDocx(jsonData) {
    const clientInfo = jsonData.client_info || {};
    const useCases = jsonData.use_cases || [];

    // Load template
    const content = fs.readFileSync(TEMPLATE_PATH, "binary");
    const zip = new PizZip(content);

    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        nullGetter: () => ""
    });

    let workflowFunctions = "";
    if (useCases.length > 0) {
        workflowFunctions = useCases
            .map((u, index) => `${index + 1}. ${u.process_name || ""}`)
            .join("\n");
    }

    let totalDocsAnnually = 0;
    if (useCases.length > 0) {
        totalDocsAnnually = useCases.reduce((sum, u) => sum + (Number(u.docs_annually) || 0), 0);
    }
    const formattedDocsAnnually = totalDocsAnnually.toLocaleString("en-IN");

    let totalAIPlugins = 0;
    if (useCases.length > 0) {
        totalAIPlugins = useCases.reduce((sum, u) => sum + (Number(u.ai_plugins) || 0), 0);
    }

    const numBots = Number(jsonData.software?.num_bots) || 0;
    const numBotsWords = numberToWords(numBots);

    const formattedUseCases = useCases.map(u => {
        let bullets = "";
        if (u.solution_mapping) {
            bullets = u.solution_mapping
                .split(",")
                .map(item => "  •  " + item.trim())
                .join("\n");
        }

        return {
            sr_no: u.sr_no || "",
            process_name: u.process_name || "",
            summary: u.summary || "",
            raw_volume: u.raw_volume || "",
            complexity: u.complexity || "",
            solution_mapping_bullets: bullets
        };
    });

    const createServers = (rawList) => (rawList || []).map(row => ({
        qty: row[0] || "", app: row[1] || "", server: row[2] || "",
        vcpu: row[3] || "", core: row[4] || "", ram: row[5] || "",
        hd: row[6] || "", os: row[7] || "", db: row[8] || "", web: row[9] || ""
    }));

    const productionServers = createServers(jsonData.hardware?.production?.servers);
    const uatServers = createServers(jsonData.hardware?.uat?.servers);
    const devServers = createServers(jsonData.hardware?.development?.servers);

    doc.setData({
        // Flexible fallback to ensure UI state renders
        client_name: clientInfo.clientName || clientInfo.client_name || "",
        proposal_date: clientInfo.proposalDate || clientInfo.proposal_date || "",
        contact_name: clientInfo.contactName || clientInfo.contact_name || "",
        contact_title: clientInfo.contactTitle || clientInfo.contact_title || "",
        contact_address: clientInfo.contactAddress || clientInfo.contact_address || "",
        contact_email: clientInfo.contactEmail || clientInfo.contact_email || "",
        contact_mobile: clientInfo.contactMobile || clientInfo.contact_mobile || "",

        // Extra fallback for capitalized Template fields
        Name: clientInfo.contactName || clientInfo.contact_name || "",
        Title: clientInfo.contactTitle || clientInfo.contact_title || "",
        "Mailing Address": clientInfo.contactAddress || clientInfo.contact_address || "",
        Email: clientInfo.contactEmail || clientInfo.contact_email || "",
        Mobile: clientInfo.contactMobile || clientInfo.contact_mobile || "",

        use_cases: formattedUseCases,
        workflow_functions: workflowFunctions,
        total_docs_annually: formattedDocsAnnually,
        num_bots: numBots,
        num_bots_words: numBotsWords,
        total_ai_plugins: totalAIPlugins,
        production_servers: productionServers,
        uat_servers: uatServers,
        dev_servers: devServers,
    });

    try {
        doc.render();
    } catch (error) {
        console.error("Template Error:", JSON.stringify(error, null, 2));
        throw error;
    }

    const buf = doc.getZip().generate({ type: "nodebuffer" });
    fs.writeFileSync(OUTPUT_PATH, buf);

    console.log("✅ Document generated successfully:", OUTPUT_PATH);
}
