/**
 * generate_proposal.js
 * --------------------
 * Generates the AutomationEdge Proposal DOCX from use_cases + software/hardware data.
 * 
 * Usage:
 *   node generate_proposal.js --data <json_file> --out <output.docx> --images <images_dir>
 */

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageBreak, LevelFormat,
  Header, Footer, TabStopType, TabStopPosition, UnderlineType,
  convertInchesToTwip, TableLayoutType, SimpleField,
} = require('docx');

const fs   = require('fs');
const path = require('path');

// ── CLI Args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const get  = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i+1] : null; };
const dataFile  = get('--data');
const outFile   = get('--out');
const imagesDir = get('--images');

if (!dataFile || !outFile || !imagesDir) {
  console.error('Usage: node generate_proposal.js --data <json> --out <docx> --images <dir>');
  process.exit(1);
}

const DATA = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
const {
  client_name, proposal_date, contact_name, contact_title,
  contact_address, contact_email, contact_mobile,
  use_cases, software, hardware, client_image
} = DATA;

// ── Helpers ───────────────────────────────────────────────────────────────────
const DXA_PAGE   = 12240;
const DXA_MARGIN = 1080; // ~0.75 in
const DXA_CONTENT = DXA_PAGE - 2 * DXA_MARGIN; // 10080

const C_DARK_BLUE  = '1F3864';
const C_MID_BLUE   = '2E75B6';
const C_LIGHT_BLUE = 'BDD7EE';
const C_ORANGE     = 'E46C0A';
const C_WHITE      = 'FFFFFF';
const C_LIGHT_GRAY = 'F2F2F2';
const C_GREEN_LIGHT = 'E2EFDA';
const C_YELLOW_LIGHT = 'FFF2CC';
const C_ORANGE_LIGHT = 'FCE4D6';

function border(color='CCCCCC', size=6) {
  return { style: BorderStyle.SINGLE, size, color };
}
const ALL_BORDERS = (c='CCCCCC', sz=6) => {
  const b = border(c, sz);
  return { top: b, bottom: b, left: b, right: b };
};
const NO_BORDERS = () => {
  const b = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  return { top: b, bottom: b, left: b, right: b };
};

function img(name, widthIn, heightIn) {
  const p = path.join(imagesDir, name);
  if (!fs.existsSync(p)) return null;
  const data = fs.readFileSync(p);
  const ext  = path.extname(name).slice(1).toLowerCase();
  const typeMap = { png: 'png', jpg: 'jpg', jpeg: 'jpg' };
  return new ImageRun({
    data,
    transformation: {
      width:  Math.round(widthIn  * 96),
      height: Math.round(heightIn * 96),
    },
    type: typeMap[ext] || 'png',
  });
}

function bold(text, size=20, color='000000') {
  return new TextRun({ text, bold: true, size, font: 'Arial', color });
}
function run(text, size=20, color='000000', options={}) {
  return new TextRun({ text, size, font: 'Arial', color, ...options });
}
function p(children, opts={}) {
  if (!Array.isArray(children)) children = [children];
  return new Paragraph({ children, ...opts });
}
function sp(size=160) { // spacer paragraph
  return new Paragraph({ children: [new TextRun('')], spacing: { after: size } });
}

function hdrCell(text, widthDxa, colspan=1) {
  return new TableCell({
    columnSpan: colspan,
    width: { size: widthDxa, type: WidthType.DXA },
    borders: ALL_BORDERS(C_WHITE, 4),
    shading: { fill: C_ORANGE, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children: [p([bold(text, 18, C_WHITE)], { alignment: AlignmentType.CENTER })],
  });
}

function dataCell(content, widthDxa, opts={}) {
  const { fill=C_WHITE, align=AlignmentType.LEFT, bold: isBold=false, color='000000', size=18, colspan=1 } = opts;
  const textRuns = Array.isArray(content)
    ? content
    : [new TextRun({ text: String(content ?? ''), bold: isBold, size, font: 'Arial', color })];
  return new TableCell({
    columnSpan: colspan,
    width: { size: widthDxa, type: WidthType.DXA },
    borders: ALL_BORDERS('CCCCCC', 4),
    shading: { fill, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children: [p(textRuns, { alignment: align })],
  });
}

function bulletPara(text, ref='bullets') {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    children: [run(text, 18)],
  });
}

function numberedPara(text, ref='numbers') {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    children: [run(text, 18)],
  });
}

function sectionHeading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text, bold: true, size: 28, font: 'Arial', color: C_ORANGE })],
    spacing: { before: 200, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: C_ORANGE, space: 1 } },
  });
}

function subHeading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text, bold: true, size: 24, font: 'Arial', color: C_ORANGE, underline: { type: UnderlineType.SINGLE, color: C_ORANGE } })],
    spacing: { before: 160, after: 80 },
  });
}

function subSubHeading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    children: [new TextRun({ text, bold: true, size: 22, font: 'Arial', color: C_DARK_BLUE })],
    spacing: { before: 120, after: 60 },
  });
}

function pageBreakPara() {
  return new Paragraph({ children: [new PageBreak()] });
}

// ── Complexity color ──────────────────────────────────────────────────────────
function complexityFill(c) {
  if (!c) return C_WHITE;
  c = c.toLowerCase();
  if (c === 'simple')  return C_GREEN_LIGHT;
  if (c === 'medium')  return C_YELLOW_LIGHT;
  if (c === 'complex') return C_ORANGE_LIGHT;
  return C_WHITE;
}

// ── Process Summary Table (Section 2.1) ───────────────────────────────────────
function buildProcessSummaryTable() {
  const COL = [400, 1400, 4200, 2400, 1680]; // total ~10080
  const hdrs = ['Sr No', 'Process Name', 'Process Summary', 'Volume', 'Process Complexity'];
  const headerRow = new TableRow({ children: hdrs.map((h, i) => hdrCell(h, COL[i])) });

  const dataRows = use_cases.map((uc, idx) => {
    const fill = complexityFill(uc.complexity);
    // Build volume text
    const daily  = uc.daily_volume  || 0;
    const monthly = daily * 30;
    const annual = uc.docs_annually || (daily * 12 * 30);
    const volLines = [
      `${daily} Cases/Day`,
      `Monthly – ${monthly.toLocaleString()}`,
      `Annual – ${annual.toLocaleString()}`,
    ].join('\n');

    // Steps from raw_volume or description
    const steps = uc.scope_of_workflow || uc.process_summary || '';

    return new TableRow({
      children: [
        dataCell(String(idx + 1), COL[0], { fill }),
        dataCell(uc.process_name || uc.use_case_name || '', COL[1], { fill }),
        new TableCell({
          width: { size: COL[2], type: WidthType.DXA },
          borders: ALL_BORDERS('CCCCCC', 4),
          shading: { fill, type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [
            p([bold(uc.use_case_name || '', 18)]),
            ...(steps ? steps.split('\n').filter(s => s.trim()).map(s => bulletPara(s.replace(/^\d+\.\s*/, '').trim())) : []),
          ],
        }),
        dataCell(volLines, COL[3], { fill }),
        dataCell(uc.complexity || '', COL[4], { fill, align: AlignmentType.CENTER }),
      ],
    });
  });

  return new Table({
    width: { size: DXA_CONTENT, type: WidthType.DXA },
    columnWidths: COL,
    rows: [headerRow, ...dataRows],
    layout: TableLayoutType.FIXED,
  });
}

// ── Solution Mapping Table (Section 2.2) ──────────────────────────────────────
function buildSolutionMappingTable() {
  const COL = [600, 2800, 6680]; // total ~10080
  const hdrs = ['No.', 'Process Name', 'Proposed Solution Components Mapping'];
  const headerRow = new TableRow({ children: hdrs.map((h, i) => hdrCell(h, COL[i])) });

  const dataRows = use_cases.map((uc, idx) => {
    const solutions = (uc.solution_mapping || '').split(/[,\n]/).map(s => s.trim()).filter(Boolean);
    return new TableRow({
      children: [
        dataCell(String(idx + 1), COL[0]),
        dataCell(uc.process_name || uc.use_case_name || '', COL[1]),
        new TableCell({
          width: { size: COL[2], type: WidthType.DXA },
          borders: ALL_BORDERS('CCCCCC', 4),
          shading: { fill: C_WHITE, type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: solutions.length > 0
            ? solutions.map(s => bulletPara(s))
            : [p([run('', 18)])],
        }),
      ],
    });
  });

  return new Table({
    width: { size: DXA_CONTENT, type: WidthType.DXA },
    columnWidths: COL,
    rows: [headerRow, ...dataRows],
    layout: TableLayoutType.FIXED,
  });
}

// ── Software Table (Section 3.1) ──────────────────────────────────────────────
function buildSoftwareTable() {
  const COL = [400, 1800, 4780, 3100]; // ~10080
  const hdrs = ['No.', 'Process', 'No. of Workflow Functions', 'Count for Commercial'];
  const headerRow = new TableRow({ children: hdrs.map((h, i) => hdrCell(h, COL[i])) });

  // Build process list
  const processNames = use_cases.map((uc, i) => `${i+1}. ${uc.process_name || uc.use_case_name}`);

  // Get software values
  const numBots    = software?.num_bots    || 18;
  const numIDP     = software?.idp_pages   || '31,00,000';
  const numPlugins = software?.num_plugins || 9;

  const row1 = new TableRow({
    children: [
      dataCell('1', COL[0]),
      dataCell('Business Process Automation', COL[1]),
      new TableCell({
        width: { size: COL[2], type: WidthType.DXA },
        borders: ALL_BORDERS('CCCCCC', 4),
        shading: { fill: C_WHITE, type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [
          p([bold('Total Workflows', 18)]),
          ...processNames.map(name => bulletPara(name)),
        ],
      }),
      new TableCell({
        width: { size: COL[3], type: WidthType.DXA },
        borders: ALL_BORDERS('CCCCCC', 4),
        shading: { fill: C_WHITE, type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [
          bulletPara(`AutomationEdge RPA ${numBots} Nos. Unassisted BOT`),
          bulletPara(`Agentic AI Plugins (LLM connector + Classifier + Summarizer + RAG + AI Master Conductor): ${numPlugins} Nos`),
          bulletPara('Gen AI Services Subscription'),
        ],
      }),
    ],
  });

  const row2 = new TableRow({
    children: [
      dataCell('', COL[0]),
      dataCell('', COL[1]),
      dataCell(`IDP With ${numIDP} number of pages/Year`, COL[2]),
      new TableCell({
        width: { size: COL[3], type: WidthType.DXA },
        borders: ALL_BORDERS('CCCCCC', 4),
        shading: { fill: C_WHITE, type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [
          bulletPara(`AutomationEdge IDP License | Per-page Processing | Annual Pages: ${numIDP}`),
        ],
      }),
    ],
  });

  return new Table({
    width: { size: DXA_CONTENT, type: WidthType.DXA },
    columnWidths: COL,
    rows: [headerRow, row1, row2],
    layout: TableLayoutType.FIXED,
  });
}

// ── Hardware Table builder ─────────────────────────────────────────────────────
function buildHardwareSection() {
  const hw = hardware || {};
  const prod    = hw.production    || {};
  const uat     = hw.uat           || {};
  const dev     = hw.development   || {};

  const COL = [900, 3000, 700, 600, 600, 700, 700, 1500, 900, 780]; // ~10380 -> trim a bit
  const COL2 = [900, 3000, 700, 600, 600, 700, 700, 1500, 900, 680]; // ~10280
  const hdrs = ['No. of Servers (Qty)', 'Applications / Module', 'Server', 'vCPU', 'Core', 'RAM (GB)', 'HD (GB)', 'Operating System', 'DB', 'Web Server'];

  function hwRow(data, cols) {
    return new TableRow({
      children: data.map((v, i) => dataCell(String(v ?? ''), cols[i])),
    });
  }

  function sectionTitle(title) {
    return new TableRow({
      children: [new TableCell({
        columnSpan: 10,
        width: { size: DXA_CONTENT, type: WidthType.DXA },
        borders: ALL_BORDERS(C_DARK_BLUE, 8),
        shading: { fill: C_DARK_BLUE, type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [p([bold(title, 20, C_WHITE)])],
      })],
    });
  }

  const headerRow = (cols) => new TableRow({ children: hdrs.map((h, i) => hdrCell(h, cols[i])) });

  // Production
  const prodRows = (prod.servers || [[
    2, 'AutomationEdge Main Server & including Active MQ, PostgreSQL DB, DocEdge Application Server, and Repair Station',
    'VM', 2, 6, 36, 500, 'MS Windows Server 2022/2023 - 64 bit', 'PostgreSQL (Default)', 'Apache Tomcat'
  ], [
    2, 'Robot Processing Server including IDP Processing Agents',
    'VM', 8, 12, 64, 500, 'MS Windows Server 2022/2023 - 64 bit (10 User Sessions)', '-', '-'
  ]]).map(r => hwRow(r, COL));

  // UAT
  const uatRows = (uat.servers || [[
    1, 'AutomationEdge Main Server, Active MQ, PostgreSQL DB & Processing Server, DocEdge Application Server, Processing Server and Repair Station',
    'VM', 1, 4, 24, 500, 'MS Windows Server 2022/2023 - 64 bit (6 User Sessions)', 'PostgreSQL (Default)', 'Apache Tomcat'
  ]]).map(r => hwRow(r, COL));

  // Dev
  const devRows = (dev.servers || [[
    4, 'Desktop Development Machine for Chatbot / Script Development',
    'Desktop / VM with Remote Access', 1, 4, 8, 500, 'Windows 7 Professional – 64 bit', 'PostgreSQL (Default)', 'NA'
  ]]).map(r => hwRow(r, COL));

  return new Table({
    width: { size: DXA_CONTENT, type: WidthType.DXA },
    columnWidths: COL,
    rows: [
      sectionTitle('Production Environment (On premises / VMs)'),
      headerRow(COL),
      ...prodRows,
      sectionTitle('UAT Environment (On premises / VMs)'),
      headerRow(COL),
      ...uatRows,
      sectionTitle('Development Environment (Offshore Desktop Systems)'),
      headerRow(COL),
      ...devRows,
    ],
    layout: TableLayoutType.FIXED,
  });
}

// ── Contact Info Table ────────────────────────────────────────────────────────
function buildContactTable() {
  const COL = [3200, 6880];
  function row(label, value) {
    return new TableRow({
      children: [
        new TableCell({
          width: { size: COL[0], type: WidthType.DXA },
          borders: ALL_BORDERS('CCCCCC', 4),
          shading: { fill: C_LIGHT_BLUE, type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [p([bold(label, 18)])],
        }),
        dataCell(value, COL[1]),
      ],
    });
  }
  return new Table({
    width: { size: DXA_CONTENT, type: WidthType.DXA },
    columnWidths: COL,
    rows: [
      row('Name', contact_name || ''),
      row('Title', contact_title || ''),
      row('Mailing Address', contact_address || ''),
      row('Email', contact_email || ''),
      row('Mobile', contact_mobile || ''),
    ],
    layout: TableLayoutType.FIXED,
  });
}

// ── Pricing Tables ────────────────────────────────────────────────────────────
function buildPricingTables() {
  const elems = [];

  // 5.1 Software Cost
  const sw_col = [400, 5200, 1700, 2780]; // 10080
  elems.push(
    subHeading('5.1 AutomationEdge Software Cost'),
    new Table({
      width: { size: DXA_CONTENT, type: WidthType.DXA },
      columnWidths: sw_col,
      rows: [
        new TableRow({ children: ['No.', 'Annual Subscription Based License Line Item', 'No. of Units', 'Total Cost (INR)'].map((h, i) => hdrCell(h, sw_col[i])) }),
        new TableRow({ children: [dataCell('1', sw_col[0]), dataCell('AutomationEdge RPA Advanced Unassisted Bot', sw_col[1]), dataCell('As per sizing', sw_col[2]), dataCell('', sw_col[3])] }),
        new TableRow({ children: [dataCell('2', sw_col[0]), dataCell('DocEdge (IDP) – Per-page Processing', sw_col[1]), dataCell('As per volume', sw_col[2]), dataCell('', sw_col[3])] }),
        new TableRow({ children: [dataCell('3', sw_col[0]), dataCell('Agentic AI Plugins (LLM connector + Classifier + Summariser + RAG + AI Master Conductor)', sw_col[1]), dataCell('As per scope', sw_col[2]), dataCell('', sw_col[3])] }),
        new TableRow({ children: [
          new TableCell({ columnSpan: 3, width: { size: sw_col[0]+sw_col[1]+sw_col[2], type: WidthType.DXA }, borders: ALL_BORDERS('CCCCCC', 4), shading: { fill: C_ORANGE, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [p([bold('Total', 18)])] }),
          dataCell('To be shared', sw_col[3], { bold: true, fill: C_ORANGE }),
        ] }),
      ],
      layout: TableLayoutType.FIXED,
    }),
    sp(100),
  );

  // 5.2 AI Services
  const ai_col = [400, 7000, 2680];
  elems.push(
    subHeading('5.2 AI Services Costing'),
    new Table({
      width: { size: DXA_CONTENT, type: WidthType.DXA },
      columnWidths: ai_col,
      rows: [
        new TableRow({ children: ['No.', 'Description', 'Cost (INR)'].map((h, i) => hdrCell(h, ai_col[i])) }),
        new TableRow({ children: [dataCell('1', ai_col[0]), dataCell('Gen AI Services Subscription (Cloud / On-prem LLM)', ai_col[1]), dataCell('To be decided', ai_col[2])] }),
      ],
      layout: TableLayoutType.FIXED,
    }),
    sp(100),
  );

  // 5.3 Professional Services
  const ps_col = [400, 5200, 1700, 2780];
  elems.push(
    subHeading('5.3 Professional Service Costing'),
    new Table({
      width: { size: DXA_CONTENT, type: WidthType.DXA },
      columnWidths: ps_col,
      rows: [
        new TableRow({ children: ['No.', 'Description', 'Effort (Days)', 'Cost (INR)'].map((h, i) => hdrCell(h, ps_col[i])) }),
        new TableRow({ children: [dataCell('1', ps_col[0]), dataCell('Implementation – Professional Services', ps_col[1]), dataCell('As per scope', ps_col[2]), dataCell('', ps_col[3])] }),
        new TableRow({ children: [
          new TableCell({ columnSpan: 3, width: { size: ps_col[0]+ps_col[1]+ps_col[2], type: WidthType.DXA }, borders: ALL_BORDERS('CCCCCC', 4), shading: { fill: C_ORANGE, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [p([bold('Total', 18)])] }),
          dataCell('To be shared', ps_col[3], { bold: true, fill: C_ORANGE }),
        ] }),
      ],
      layout: TableLayoutType.FIXED,
    }),
    sp(100),
  );

  // 5.4 Training
  const tr_col = [400, 5200, 4480];
  elems.push(
    subHeading('5.4 Training'),
    new Table({
      width: { size: DXA_CONTENT, type: WidthType.DXA },
      columnWidths: tr_col,
      rows: [
        new TableRow({ children: ['No.', 'Description', 'Details'].map((h, i) => hdrCell(h, tr_col[i])) }),
        new TableRow({ children: [dataCell('1', tr_col[0]), dataCell('Train the Trainer – AutomationEdge Platform', tr_col[1]), dataCell('3 working days, 2 hours/day (web-based)', tr_col[2])] }),
      ],
      layout: TableLayoutType.FIXED,
    }),
    sp(100),
  );

  // 5.5 Payment Schedule
  const pay_col = [400, 5200, 4480];
  elems.push(
    subHeading('5.5 Payment Schedule'),
    new Table({
      width: { size: DXA_CONTENT, type: WidthType.DXA },
      columnWidths: pay_col,
      rows: [
        new TableRow({ children: ['No.', 'Milestone', 'Payment (%)'].map((h, i) => hdrCell(h, pay_col[i])) }),
        new TableRow({ children: [dataCell('1', pay_col[0]), dataCell('On signing of contract / Purchase Order', pay_col[1]), dataCell('30%', pay_col[2])] }),
        new TableRow({ children: [dataCell('2', pay_col[0]), dataCell('On delivery of Development / Configuration', pay_col[1]), dataCell('40%', pay_col[2])] }),
        new TableRow({ children: [dataCell('3', pay_col[0]), dataCell('On Go-Live / Acceptance', pay_col[1]), dataCell('30%', pay_col[2])] }),
      ],
      layout: TableLayoutType.FIXED,
    }),
    sp(100),
  );

  // 5.6 Payment Terms
  elems.push(
    subHeading('5.6 Payment Terms'),
    p([run('Payment is due within 30 days of invoice date. All prices are exclusive of applicable taxes (GST). Any travel and out-of-pocket expenses will be billed separately at actuals. Prices are valid for 30 days from the date of this proposal.', 18)]),
    sp(100),
  );

  return elems;
}

// ── Post Go Live Support Tables ───────────────────────────────────────────────
function buildPostGoLiveTables() {
  const elems = [];

  const col2 = [2000, 8080];

  elems.push(
    subHeading('4.1 Post-production Support'),
    p([run('AutomationEdge will provide post-production support for a period of 2 months after go-live.', 18)]),
    sp(80),
  );

  // 4.2
  const sup_col = [400, 5200, 2240, 2240];
  elems.push(
    subHeading('4.2 Product Support for 1 Year'),
    new Table({
      width: { size: DXA_CONTENT, type: WidthType.DXA },
      columnWidths: sup_col,
      rows: [
        new TableRow({ children: ['No.', 'Support Type', 'Response Time', 'Resolution Time'].map((h, i) => hdrCell(h, sup_col[i])) }),
        new TableRow({ children: [dataCell('1', sup_col[0]), dataCell('Critical (P1)', sup_col[1]), dataCell('4 hours', sup_col[2]), dataCell('24 hours', sup_col[3])] }),
        new TableRow({ children: [dataCell('2', sup_col[0]), dataCell('High (P2)', sup_col[1]), dataCell('8 hours', sup_col[2]), dataCell('48 hours', sup_col[3])] }),
        new TableRow({ children: [dataCell('3', sup_col[0]), dataCell('Medium (P3)', sup_col[1]), dataCell('24 hours', sup_col[2]), dataCell('72 hours', sup_col[3])] }),
        new TableRow({ children: [dataCell('4', sup_col[0]), dataCell('Low (P4)', sup_col[1]), dataCell('48 hours', sup_col[2]), dataCell('5 working days', sup_col[3])] }),
      ],
      layout: TableLayoutType.FIXED,
    }),
    sp(100),
  );

  elems.push(
    subHeading('4.3 Operational Support after Post-Production Support'),
    p([run('Operational support (L1/L2/L3) can be provided as per a separate agreement. Scope and pricing to be mutually agreed upon.', 18)]),
    sp(80),
  );

  return elems;
}

// ── Terms and Conditions ──────────────────────────────────────────────────────
function buildTandC() {
  const terms = [
    'Scope of work for each Use Case mentioned above is tentative and will be finalized after detailed requirement gathering only.',
    'Effort estimates will vary depending on the actual complexity and deviations from assumptions, which can only be estimated after the requirement gathering workshop.',
    'AutomationEdge is not responsible for third-party product licensing, upgrades, or procurement.',
    'Any changes to the agreed scope will require a Change Request (CR) with separate commercial approval.',
    'This proposal is valid for 30 days from the date of issue.',
    'All intellectual property developed during the project shall be owned by the client upon full payment.',
    'AutomationEdge reserves the right to assign qualified resources for project execution.',
    'The client will provide timely access to systems, data, and SMEs as required for the project.',
    'Data shared with AutomationEdge for the purpose of this project will be kept confidential and used only for the stated purposes.',
    'Dispute resolution will follow the mutually agreed contractual terms, under Indian jurisdiction.',
  ];
  return terms.map(t => numberedPara(t, 'tnc'));
}

// ── About AutomationEdge ──────────────────────────────────────────────────────
function buildAboutSection() {
  return [
    p([run('AutomationEdge is a Universal Automation Platform that combines Robotic Process Automation (RPA), Artificial Intelligence (AI), and Intelligent Document Processing (IDP) into a single unified platform.', 18)]),
    sp(60),
    subSubHeading('7.1 What is a Universal Automation Platform?'),
    p([run('A Universal Automation Platform integrates RPA, AI, and IDP to automate end-to-end business processes across all systems and applications — structured and unstructured. AutomationEdge provides:', 18)]),
    bulletPara('Robotic Process Automation (RPA) – for UI-based and API-based process automation'),
    bulletPara('DocEdge (IDP) – for intelligent extraction and processing of documents'),
    bulletPara('Agentic AI – for autonomous, decision-making bots powered by LLMs'),
    bulletPara('HyperAutomation – for combining multiple automation technologies'),
  ];
}

// ── DOCUMENT BUILD ─────────────────────────────────────────────────────────────
function loadImg(name) {
  const full = path.join(imagesDir, name);
  if (fs.existsSync(full)) return fs.readFileSync(full);
  return null;
}

const doc = new Document({
  numbering: {
    config: [
      { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•',
          alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: 'numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.',
          alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: 'tnc', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.',
          alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ],
  },
  styles: {
    default: { document: { run: { font: 'Arial', size: 20 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 28, bold: true, font: 'Arial', color: C_DARK_BLUE },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, font: 'Arial', color: C_MID_BLUE },
        paragraph: { spacing: { before: 160, after: 80 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 22, bold: true, font: 'Arial', color: C_DARK_BLUE },
        paragraph: { spacing: { before: 120, after: 60 }, outlineLevel: 2 } },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: DXA_PAGE, height: 15840 },
        margin: { top: DXA_MARGIN, bottom: DXA_MARGIN, left: DXA_MARGIN, right: DXA_MARGIN },
        borders: { pageBorders: { display: "notFirstPage", zOrder: "front", offsetFrom: "page", top: { style: BorderStyle.SINGLE, size: 8, color: C_ORANGE, space: 24 }, bottom: { style: BorderStyle.SINGLE, size: 8, color: C_ORANGE, space: 24 }, left: { style: BorderStyle.SINGLE, size: 8, color: C_ORANGE, space: 24 }, right: { style: BorderStyle.SINGLE, size: 8, color: C_ORANGE, space: 24 } } }
      },
    },
    headers: {
      default: new Header({
        children: [
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C_ORANGE, space: 1 } },
            children: [
              ...(loadImg('image2.png') ? [new ImageRun({ data: loadImg('image2.png'), transformation: { width: 140, height: 20 }, type: 'png' })] : [bold('AutomationEdge', 16, C_DARK_BLUE)]),
              new TextRun({ text: '\t', size: 16 }),
              run(`Proposal for ${client_name || 'Client'}`, 14, '595959'),
              new TextRun({ text: '\t', size: 16 }),
              ...(client_image && loadImg(client_image) ? [new ImageRun({ data: loadImg(client_image), transformation: { width: 80, height: 25 }, type: 'png' })] : []),
            ],
            tabStops: [ { type: TabStopType.CENTER, position: DXA_CONTENT / 2 }, { type: TabStopType.RIGHT, position: DXA_CONTENT } ],
          }),
        ],
      }),
    },
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            border: { top: { style: BorderStyle.SINGLE, size: 6, color: C_ORANGE, space: 1 } },
            children: [
              run('Confidential | AutomationEdge', 14, '595959'),
              new TextRun({ text: '\t', size: 14 }),
              run('Page ', 14, '595959'),
              new SimpleField('PAGE', '', { size: 14, font: 'Arial', color: '595959' }),
            ],
            tabStops: [{ type: TabStopType.RIGHT, position: DXA_CONTENT }],
          }),
        ],
      }),
    },
    children: [
      // ════════ PAGE 1: COVER ════════
      p([
        ...(loadImg('image1.png') ? [new ImageRun({ data: loadImg('image1.png'), transformation: { width: 630, height: 354 }, type: 'png', floating: { horizontalPosition: { offset: 0 }, verticalPosition: { offset: 0 } } })] : []),
      ], { alignment: AlignmentType.CENTER }),
      sp(400),
      p([bold('Budgetary Proposal', 32, C_WHITE)], { alignment: AlignmentType.CENTER }),
      p([run('for ', 24, C_WHITE), bold('Business Process Automation', 28, C_ORANGE)], { alignment: AlignmentType.CENTER }),
      p([run('By', 22, C_WHITE)], { alignment: AlignmentType.CENTER }),
      sp(80),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: loadImg('image2.png')
          ? [new ImageRun({ data: loadImg('image2.png'), transformation: { width: 220, height: 28 }, type: 'png' })]
          : [bold('AutomationEdge', 24, C_MID_BLUE)],
      }),
      sp(120),
      p([run('Submitted To', 22, C_WHITE)], { alignment: AlignmentType.CENTER }),
      sp(60),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: (client_image && loadImg(client_image))
          ? [new ImageRun({ data: loadImg(client_image), transformation: { width: 185, height: 47 }, type: 'png' })]
          : [bold(client_name || 'Client', 26, C_WHITE)],
      }),
      sp(120),
      p([run(proposal_date || '', 20, C_WHITE)], { alignment: AlignmentType.CENTER }),

      pageBreakPara(),

      // ════════ PAGE 2: TOC ════════
      p([new TextRun({ text: 'Table of Content', bold: true, size: 28, font: 'Arial', color: C_ORANGE, underline: { type: UnderlineType.SINGLE } })]),
      sp(60),
      ...[
        ['Confidentiality Statement', '3'],
        ['Contact Information', '3'],
        ['1  Executive Summary', '4'],
        ['1.1  Overview of the Project', '4'],
        ['1.2  Business Value', '4'],
        ['2  Scope of Work', '6'],
        ['2.1  Business Requirements', '6'],
        ['2.2  Solution Approach', '11'],
        ['2.3  Project Deliverable', '15'],
        ['2.4  Project Approach & Plan', '16'],
        ['2.5  Assumptions', '17'],
        ['2.6  Out of Scope', '18'],
        ['3  AutomationEdge Deployment', '19'],
        ['3.1  Proposed AutomationEdge Bot (On premises)', '19'],
        ['3.2  Proposed Infrastructure Sizing', '20'],
        ['4  Post Go Live Support Structure', '22'],
        ['5  Pricing and Payment Terms', '23'],
        ['6  Terms and Conditions', '26'],
        ['7  Automation - A Universal Automation Platform', '31'],
      ].map(([title, pg]) => new Paragraph({
        children: [
          run(title, 18),
          new TextRun({ text: '\t', size: 18 }),
          run(pg, 18),
        ],
        tabStops: [{ type: TabStopType.RIGHT, position: DXA_CONTENT, leader: TabStopType.DOT }],
        spacing: { after: 60 },
      })),

      pageBreakPara(),

      // ════════ PAGE 3: CONFIDENTIALITY + CONTACT ════════
      p([bold('Confidentiality Statement', 24, C_DARK_BLUE)]),
      sp(60),
      p([run(`The information contained in this proposal is of a proprietary nature and is not to be revealed or used except for the evaluation of this proposal and/or in the performance of the services proposed herein. This proposal is strictly meant for the addressee or persons within `, 18), bold(client_name || 'the client', 18), run(` (hereinafter referred to as the `, 18), bold('Client', 18), run(`) who are designated to evaluate or consider the proposal.`, 18)]),
      sp(80),
      p([run('No part of this work may be reproduced or transmitted in any form or by any means, electronic or mechanical, including photocopying and recording or by any information storage or retrieval system, except as may be permitted by AutomationEdge.', 18)]),
      sp(80),
      p([run('AutomationEdge submits this proposal with the understanding that it will be used only in accordance with the stated intent expressed by the addressee in its solicitation.', 18)]),
      sp(80),
      p([bold('Proposal Validity: ', 18), bold('30 days', 18, C_MID_BLUE), run(' from the date of the proposal', 18)]),
      sp(120),

      p([bold('Contact Information', 24, C_DARK_BLUE)]),
      sp(60),
      p([new TextRun({ text: 'Local Contact', bold: true, size: 20, underline: { type: UnderlineType.SINGLE }, font: 'Arial' })]),
      sp(60),
      p([run('Your Point of Contact for this document', 18, '595959')]),
      sp(40),
      buildContactTable(),

      pageBreakPara(),

      // ════════ SECTION 1: EXECUTIVE SUMMARY ════════
      sectionHeading('Executive Summary'),
      subHeading('1.1 Overview of the Project'),
      p([bold('AutomationEdge', 18), run(' is excited to present this proposal to ', 18), bold(client_name || 'the Client', 18), run(' for the implementation of our ', 18), bold('Robotic Process HyperAutomation and Intelligent Document Processing (IDP), which is known as the DocEdge solution', 18), run('. Our objective is to revolutionize and automate repetitive business processes, driving efficiency and operational excellence across the Client\'s workflows.', 18)]),
      sp(80),
      p([run('We are honored by the opportunity to partner in this transformative journey. With our proven expertise, cutting-edge technology, and industry-leading consulting services, we are confident in our ability to deliver seamless and impactful automation. Together, we aim to ensure the successful completion of these mission-critical ', 18), bold('HyperAutomation projects', 18), run(', unlocking new levels of productivity and innovation.', 18)]),
      sp(80),
      p([run('We look forward to building a ', 18), bold('long-lasting, value-driven partnership.', 18)]),
      sp(120),

      subHeading('1.2 Business Value'),
      p([bold('Leveraging RPA and IDP capabilities with AutomationEdge', 18)]),
      sp(60),
      p([new TextRun({ text: '1.  Elevated Operational Efficiency:', bold: true, size: 18, font: 'Arial' })]),
      p([run('With AutomationEdge\'s RPA and IDP, businesses can automate repetitive tasks such as data extraction, invoice processing, and document management. This automation ensures employees focus on strategic, high-value activities that foster innovation and growth.', 18)], { indent: { left: 720 } }),
      sp(60),
      p([new TextRun({ text: '2.  Significant Cost Reduction:', bold: true, size: 18, font: 'Arial' })]),
      p([run('By automating high-volume, labor-intensive processes, AutomationEdge\'s RPA and IDP solutions significantly reduce operational costs and mitigate the risk of costly errors, ensuring seamless business operations with enhanced accuracy.', 18)], { indent: { left: 720 } }),
      sp(60),
      p([new TextRun({ text: '3.  Accelerated Time to Value:', bold: true, size: 18, font: 'Arial' })]),
      p([run('AutomationEdge\'s technologies are designed for quick deployment and seamless integration with legacy systems and enterprise applications, significantly shortening the time required to achieve operational excellence.', 18)], { indent: { left: 720 } }),
      sp(60),
      p([new TextRun({ text: '4.  Superior Customer Experience:', bold: true, size: 18, font: 'Arial' })]),
      p([run('RPA and IDP ensure faster, more responsive service delivery by automating key touchpoints in the customer journey, enhancing customer satisfaction and building long-term loyalty.', 18)], { indent: { left: 720 } }),

      pageBreakPara(),

      // ════════ SECTION 2: SCOPE OF WORK ════════
      sectionHeading('2  Scope of Work'),
      subHeading('2.1 Business Requirements'),
      p([bold(client_name || 'The Client', 18), run(' is exploring ', 18), bold('Robotic Process Automation (RPA) and DocEdge', 18), run(' for the processes given in the requirement section as the scope of work for this engagement.', 18)]),
      sp(80),
      subSubHeading('Process Summary'),
      buildProcessSummaryTable(),
      sp(80),
      p([run('1. This is a proposed use case tentatively for budgeting purposes.', 18)]),
      p([run('2. Process complexity will be finalized only after detailed requirement gathering.', 18)]),
      p([run('3. Effort estimates may vary depending on the complexity of the process.', 18)]),
      p([run('4. The scope of work for each use case mentioned here is tentative and will be finalized after detailed requirement gathering only.', 18)]),
      p([run('5. PS Efforts are assumed as per Ref. complexity grid sheet, and any deviation in complexity parameters will have corresponding changes in Efforts.', 18)]),
      sp(80),
      subSubHeading('Automation Complexity Matrix'),
      ...(loadImg('image4.png') ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: loadImg('image4.png'), transformation: { width: 627, height: 216 }, type: 'png' })] })] : []),

      pageBreakPara(),

      // ════════ SECTION 2.2: SOLUTION APPROACH ════════
      subHeading('2.2 Solution Approach'),
      p([run('The below ', 18), bold('AutomationEdge robotic process automation (RPA) and Intelligent Document Processing (IDP) solution', 18), run(' offers enhanced accuracy, efficiency and time-saving advantages for your business processes.', 18)]),
      sp(80),
      buildSolutionMappingTable(),
      sp(80),
      ...(loadImg('image6.png') ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: loadImg('image6.png'), transformation: { width: 624, height: 288 }, type: 'png' })] }), sp(80)] : []),
      p([run('• RPA is ideal when processes involve structured data, or when automating interactions with systems that don\'t provide API integration, enhancing efficiency without compromising security.', 18)]),
      p([run('• The platform offers multiple recorders that capture and replicate human actions, making it easy to automate processes by mimicking the exact steps performed by a user.', 18)]),
      p([run('• AutomationEdge bots are equipped to send email alerts, notifications, and generate dashboards or reports to keep stakeholders informed of the automation process.', 18)]),
      sp(80),
      ...(loadImg('image7.png') ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: loadImg('image7.png'), transformation: { width: 522, height: 232 }, type: 'png' })] }), sp(80)] : []),
      p([bold('Notes for Proposed Intelligent Document Processing Solution:', 18)]),
      ...[
        'Document will be in English language only.',
        'Documents are in PDF file format as per scope with a maximum 5-degree tilt in the document.',
        'Average field level extraction accuracy for printed fields will be 80% and above for 200 dpi scanned English documents with an 11-point font size.',
        'Highlighted text, overwritten text, scratched text, bounding boxes, strikethrough text, poor quality images decrease the accuracy.',
        'If some fields are not present in the document, then those will be kept blank in the output.',
        'Automation will be deployed at client on-premises servers provisioned by the client.',
      ].map((note, i) => p([run(`${i+1}. ${note}`, 18)], { spacing: { after: 40 } })),

      pageBreakPara(),

      // ════════ SECTION 2.3: DELIVERABLES ════════
      subHeading('2.3 Project Deliverable'),
      p([run('AutomationEdge will provide the following deliverables as a part of implementation:', 18)]),
      sp(60),
      new Table({
        width: { size: DXA_CONTENT, type: WidthType.DXA },
        columnWidths: [1200, 8880],
        rows: [
          new TableRow({ children: [hdrCell('Sr. No.', 1200), hdrCell('Project Deliverable', 8880)] }),
          ...['Business Requirement Documentation','Project Plan','Solution Design and Configuration','AutomationEdge Workflows','Training Manual/Guide'].map((d, i) =>
            new TableRow({ children: [dataCell(String(i+1), 1200), dataCell(d, 8880)] })
          ),
        ],
        layout: TableLayoutType.FIXED,
      }),
      sp(80),
      p([bold('Note:', 18)]),
      p([run('1. All the documentation will be done in English only and may be combined based on suitability of functions.', 18)]),
      p([run('2. Any document preparation in non-English language is out of scope.', 18)]),

      pageBreakPara(),

      // ════════ SECTION 2.4: PROJECT APPROACH ════════
      subHeading('2.4 Project Approach & Plan'),
      subSubHeading('Implementation Approach'),
      ...(loadImg('image9.png') ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: loadImg('image9.png'), transformation: { width: 533, height: 300 }, type: 'png' })] }), sp(80)] : []),
      subSubHeading('Training'),
      p([run('Training will be delivered on a \'Train the Trainer\' basis for development and admin staff (max. 3 count).', 18)]),
      bulletPara('Web-based training for 3 working days, 2 (two) hours per day.'),
      bulletPara('Scope: AutomationEdge workflows, Development Studio, predefined examples. Prerequisite: Java knowledge.'),
      bulletPara('Additional duration and scope of training are chargeable.'),
      sp(80),
      subSubHeading('Timeline'),
      p([run('Implementation timeline will be finalized after detailed discussions and agreement between AutomationEdge and the client\'s leadership team. The project will follow the standard phases:', 18)]),
      sp(60),
      // Empty timeline placeholder table
      new Table({
        width: { size: DXA_CONTENT, type: WidthType.DXA },
        columnWidths: [2200, 7880],
        rows: [
          new TableRow({ children: [hdrCell('Phase', 2200), hdrCell('Timeline', 7880)] }),
          new TableRow({ children: [dataCell('Project Planning', 2200), dataCell('', 7880)] }),
          new TableRow({ children: [dataCell('Business Req. Gathering', 2200), dataCell('', 7880)] }),
          new TableRow({ children: [dataCell('Solution Design', 2200), dataCell('', 7880)] }),
          new TableRow({ children: [dataCell('Build (Dev & UAT)', 2200), dataCell('', 7880)] }),
          new TableRow({ children: [dataCell('Training', 2200), dataCell('', 7880)] }),
          new TableRow({ children: [dataCell('Validate (SIT & UAT)', 2200), dataCell('', 7880)] }),
          new TableRow({ children: [dataCell('Deploy (Pilot Launch)', 2200), dataCell('', 7880)] }),
          new TableRow({ children: [dataCell('Handover to Operations', 2200), dataCell('', 7880)] }),
          new TableRow({ children: [dataCell('Post Go-Live Support', 2200), dataCell('', 7880)] }),
        ],
        layout: TableLayoutType.FIXED,
      }),

      pageBreakPara(),

      // ════════ SECTION 2.5: ASSUMPTIONS ════════
      subHeading('2.5 Assumptions'),
      ...[
        'A persistent data store like PostgreSQL server will be used for saving application statistics.',
        'The implementation will be for English language only.',
        'The client will provide VPN access and system connectivity & APIs wherever available for the consultant\'s access of Source & Target Systems.',
        'Any delays in provision of hardware, software, requested data, system access, credentials, or information as per the project plan by the client will impact the SOW schedule and cost.',
        'Access to the common email box, client Insurance Systems, CRM and in-house system will be provided by the client team before development starts.',
        'AutomationEdge will perform the service from one (1) offshore location. Additional onsite visits/travel will entail additional costs.',
        'Lead-time required for on-site resources will be approximately four weeks from the date of PO.',
        'Any acquisition, installation, configuration, and maintenance of Non-AutomationEdge software and hardware will not be included, unless otherwise stated.',
        'Estimated efforts will vary depending on complexity and deviations from assumptions.',
        'Any change in requirement after requirement sign-off will be considered a change request with corresponding commercial implications.',
      ].map((a, i) => p([run(`${i+1}. ${a}`, 18)], { spacing: { after: 60 } })),

      pageBreakPara(),

      // ════════ SECTION 2.6: OUT OF SCOPE ════════
      subHeading('2.6 Out of Scope'),
      new Table({
        width: { size: DXA_CONTENT, type: WidthType.DXA },
        columnWidths: [1200, 8880],
        rows: [
          new TableRow({ children: [hdrCell('#', 1200), hdrCell('Out of Scope Description', 8880)] }),
          ...['Any hardware and associated software procurement, licensing, installation, and support.',
              'Surface Automation, Integration with any 3rd Party applications, SMS Gateway Integration, Development of Web Services or APIs, Citrix applications.',
              'Any activity related to non-English linguistic provisions of training.',
              'HA and DR setup.',
              'Customizations that are not mentioned under the scope section.',
              'Any language support that is not mentioned under this scope section.',
          ].map((s, i) => new TableRow({ children: [dataCell(String(i+1), 1200), dataCell(s, 8880)] })),
        ],
        layout: TableLayoutType.FIXED,
      }),

      pageBreakPara(),

      // ════════ SECTION 3: DEPLOYMENT ════════
      sectionHeading('3  AutomationEdge Deployment'),
      subHeading('3.1 Proposed AutomationEdge Bot (On premises)'),
      p([run('Below are the proposed software license requirements for automation deployment.', 18)]),
      sp(60),
      buildSoftwareTable(),
      sp(80),
      p([bold('Note:', 18)]),
      p([run('• Agent in the above estimates is applicable for one production instance only.', 18)]),
      p([run('• Clients can add more licenses (Robotic agents, IDP Pages, Agentic Plugins) as per TAT Requirements or future growth of process volumes.', 18)]),
      p([run('• The suggested number of bot licenses is based on current understanding of the scope.', 18)]),
      p([run('• AI Services subscription provision to be decided between both parties.', 18)]),

      pageBreakPara(),

      subHeading('3.2 Proposed Infrastructure Sizing (For On premises / VMs)'),
      p([run('Below are the infrastructure requirements/prerequisites for on-premises deployment.', 18)]),
      sp(60),
      buildHardwareSection(),
      sp(80),
      p([run('* Count of servers may increase based on the actual requirements and volumes to be processed.', 18)]),
      ...[
        'Server/Desktop count may increase/decrease based on actual requirements and volumes.',
        'All PC/VM/Desktops should be in the same domain.',
        'AutomationEdge includes PostgreSQL; Oracle or MSSQL can be used at additional cost.',
        'Connectivity of target systems from the AutomationEdge server must be provisioned for GUI and REST APIs.',
        'Power user rights required on target systems and provided VM/PC/Desktops.',
        'Hardware procurement, installation, and maintenance are the client\'s responsibility.',
        'Development is performed on the UAT instance; deployment to production follows client UAT approval.',
      ].map((n, i) => p([run(`${i+1}. ${n}`, 16, '595959')], { spacing: { after: 40 } })),

      pageBreakPara(),

      // ════════ SECTION 4: POST GO LIVE ════════
      sectionHeading('4  Post Go Live Support Structure'),
      ...buildPostGoLiveTables(),

      pageBreakPara(),

      // ════════ SECTION 5: PRICING ════════
      sectionHeading('5  Pricing and Payment Terms'),
      p([run('Note: The pricing tables below are for validation. Please review and confirm before finalization.', 18, 'FF0000')]),
      sp(80),
      ...buildPricingTables(),

      pageBreakPara(),

      // ════════ SECTION 6: T&C ════════
      sectionHeading('6  Terms and Conditions'),
      sp(60),
      ...buildTandC(),

      pageBreakPara(),

      // ════════ SECTION 7: ABOUT ════════
      sectionHeading('7  Automation - A Universal Automation Platform'),
      sp(60),
      ...buildAboutSection(),
      sp(80),
      ...(loadImg('image10.png') ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: loadImg('image10.png'), transformation: { width: 252, height: 295 }, type: 'png' })] })] : []),
    ],
  }],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(outFile, buf);
  console.log('OK: ' + outFile);
}).catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
