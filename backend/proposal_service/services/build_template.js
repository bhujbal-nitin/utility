/**
 * build_template.js
 * -----------------
 * Creates AE_BusinessProposal_Template.docx with {{placeholder}} tags
 * for every field that generate_proposal.js will fill.
 *
 * Run once (or whenever the template structure changes):
 *   node build_template.js
 *
 * The output file goes to:
 *   ../../assets/AE_BusinessProposal_Template.docx   (relative to this script)
 *
 * Docxtemplater tag reference used in this template:
 *   {{variable}}               – simple replacement
 *   {{#loop}} ... {{/loop}}    – repeat rows for arrays
 *   {{#if_val}} ... {{/if_val}} – conditional blocks (unused here but supported)
 */

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageBreak, LevelFormat,
  Header, Footer, TabStopType, UnderlineType,
  TableLayoutType, ImageRun,
} = require('docx');

const fs   = require('fs');
const path = require('path');

// ── Page geometry ────────────────────────────────────────────────────────────
const DXA_PAGE    = 12240;
const DXA_MARGIN  = 1440;
const DXA_CONTENT = DXA_PAGE - 2 * DXA_MARGIN; // 9360

// ── Exact brand colours from Royal Sundaram reference template ───────────────
const C_ORANGE      = 'F79646';
const C_ORANGE_DARK = 'E36C0A';
const C_NAVY        = '002060';
const C_BLUE        = '0000FF';
const C_STEEL_BLUE  = '4F81BD';
const C_GRAY_BORDER = '808080';
const C_WHITE       = 'FFFFFF';
const C_BLACK       = '000000';
const C_LIGHT_GRAY  = 'F2F2F2';
const C_LIGHT_BLUE  = 'BDD7EE';
const C_GREEN_LIGHT  = 'E2EFDA';
const C_YELLOW_LIGHT = 'FFF2CC';
const C_ORANGE_LIGHT = 'FCE4D6';
const C_AMBER       = 'FFC000';

// ── Helpers ───────────────────────────────────────────────────────────────────
const bdr = (color = 'CCCCCC', size = 6) => ({ style: BorderStyle.SINGLE, size, color });
const ALL_BORDERS = (c = 'CCCCCC', sz = 6) => { const b = bdr(c, sz); return { top: b, bottom: b, left: b, right: b }; };

// Calibri 11pt body
const bold = (text, size = 22, color = C_BLACK) => new TextRun({ text, bold: true, size, font: 'Calibri', color });
const run  = (text, size = 22, color = C_BLACK) => new TextRun({ text, size, font: 'Calibri', color });
const p    = (children, opts = {}) => new Paragraph({ children: Array.isArray(children) ? children : [children], ...opts });
const sp   = (size = 160) => new Paragraph({ children: [new TextRun('')], spacing: { after: size } });

// hdrCell – orange fill, white bold text
const hdrCell = (text, w, colspan = 1) => new TableCell({
  columnSpan: colspan,
  width: { size: w, type: WidthType.DXA },
  borders: ALL_BORDERS(C_ORANGE, 8),
  shading: { fill: C_ORANGE, type: ShadingType.CLEAR },
  margins: { top: 80, bottom: 80, left: 120, right: 120 },
  verticalAlign: VerticalAlign.CENTER,
  children: [p([bold(text, 18, C_WHITE)], { alignment: AlignmentType.CENTER })],
});

// placeholder cell – grey border, contains {{tag}}
const phCell = (tag, w, colspan = 1) => new TableCell({
  columnSpan: colspan,
  width: { size: w, type: WidthType.DXA },
  borders: ALL_BORDERS('CCCCCC', 4),
  shading: { fill: C_WHITE, type: ShadingType.CLEAR },
  margins: { top: 80, bottom: 80, left: 120, right: 120 },
  verticalAlign: VerticalAlign.CENTER,
  children: [p([run(tag, 20)])],
});

const labelCell = (text, w) => new TableCell({
  width: { size: w, type: WidthType.DXA },
  borders: ALL_BORDERS('CCCCCC', 4),
  shading: { fill: C_LIGHT_GRAY, type: ShadingType.CLEAR },
  margins: { top: 80, bottom: 80, left: 120, right: 120 },
  children: [p([bold(text, 20)])],
});

const pageBreakPara = () => new Paragraph({ children: [new PageBreak()] });

function sectionHeading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [bold(text, 40, C_NAVY)],
    spacing: { after: 300 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: C_STEEL_BLUE, space: 1 } },
  });
}
function subHeading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text, bold: true, size: 28, font: 'Calibri', color: C_BLUE, underline: { type: UnderlineType.SINGLE } })],
    spacing: { before: 200, after: 0, line: 360, lineRule: 'auto' },
  });
}
function subSubHeading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    children: [bold(text, 22, C_NAVY)],
    spacing: { before: 120, after: 60 },
  });
}

// ── Image loader (optional — skipped silently if file not found) ─────────────
const IMAGES_DIR = path.join(__dirname, 'proposal_images');
function loadImg(name) {
  const full = path.join(IMAGES_DIR, name);
  return fs.existsSync(full) ? fs.readFileSync(full) : null;
}
function imgPara(name, w, h, spAfter = 0) {
  const data = loadImg(name);
  if (!data) return null;
  const ext  = path.extname(name).slice(1).toLowerCase();
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: spAfter ? { after: spAfter } : undefined,
    children: [new ImageRun({ data, transformation: { width: w, height: h }, type: ext === 'jpg' ? 'jpg' : 'png' })],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT
// ─────────────────────────────────────────────────────────────────────────────
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
    default: { document: { run: { font: 'Calibri', size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 40, bold: true, font: 'Calibri', color: C_NAVY },
        paragraph: { spacing: { after: 300 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 28, bold: true, font: 'Calibri', color: C_BLUE },
        paragraph: { spacing: { before: 200, after: 0, line: 360, lineRule: 'auto' }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 22, bold: true, font: 'Calibri', color: C_NAVY },
        paragraph: { spacing: { before: 120, after: 60 }, outlineLevel: 2 } },
    ],
  },

  sections: [

    // ══════════════ SECTION 1: COVER PAGE ══════════════
    {
      properties: {
        page: {
          size: { width: DXA_PAGE, height: 15840 },
          margin: { top: 360, bottom: 360, left: 1440, right: 1440, header: 0, footer: 0 },
        },
      },
      children: [
        // Orange top band
        new Paragraph({ shading: { fill: C_ORANGE, type: ShadingType.CLEAR }, spacing: { before: 0, after: 0, line: 560, lineRule: 'exact' }, children: [run('', 56)] }),
        new Paragraph({ shading: { fill: C_ORANGE, type: ShadingType.CLEAR }, spacing: { before: 0, after: 480, line: 560, lineRule: 'exact' }, children: [run('', 56)] }),

        // Cover image (image1.png)
        ...(imgPara('image1.png', 325, 183, 560) ? [imgPara('image1.png', 325, 183, 560)] : [sp(560)]),

        // Titles
        p([bold('Budgetary Proposal', 56, C_BLACK)], { alignment: AlignmentType.CENTER, spacing: { after: 0 } }),
        p([run('for', 56, C_BLACK)], { alignment: AlignmentType.CENTER, spacing: { after: 0 } }),
        p([bold('Business Process Automation', 56, C_BLACK)], { alignment: AlignmentType.CENTER, spacing: { after: 560 } }),

        // By + AE logo
        p([run('By', 36, C_BLACK)], { alignment: AlignmentType.CENTER, spacing: { after: 120 } }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 560 },
          children: loadImg('image2.png')
            ? [new ImageRun({ data: loadImg('image2.png'), transformation: { width: 274, height: 34 }, type: 'png' })]
            : [bold('AutomationEdge', 40, C_ORANGE_DARK)],
        }),

        // Submitted To + client logo placeholder
        p([run('Submitted To', 36, C_BLACK)], { alignment: AlignmentType.CENTER, spacing: { after: 120 } }),

        // {{client_name}} on cover
        p([run('{{client_name}}', 32, C_BLACK)], { alignment: AlignmentType.CENTER, spacing: { after: 480 } }),

        // Date
        p([run('{{proposal_date}}', 24, C_BLACK)], { alignment: AlignmentType.CENTER }),

        sp(400),
        // Orange bottom band
        new Paragraph({ shading: { fill: C_ORANGE, type: ShadingType.CLEAR }, spacing: { before: 0, after: 0, line: 560, lineRule: 'exact' }, children: [run('', 56)] }),
        new Paragraph({ shading: { fill: C_ORANGE, type: ShadingType.CLEAR }, spacing: { before: 0, after: 0, line: 560, lineRule: 'exact' }, children: [run('', 56)] }),
      ],
    },

    // ══════════════ SECTION 2: BODY PAGES ══════════════
    {
      properties: {
        page: {
          size: { width: DXA_PAGE, height: 15840 },
          margin: { top: 1440, bottom: 1440, left: 1440, right: 1440, header: 720, footer: 720 },
          borders: {
            pageBorderTop:    { style: BorderStyle.SINGLE, size: 18, color: C_ORANGE, space: 24 },
            pageBorderLeft:   { style: BorderStyle.SINGLE, size: 18, color: C_ORANGE, space: 24 },
            pageBorderBottom: { style: BorderStyle.SINGLE, size: 18, color: C_ORANGE, space: 24 },
            pageBorderRight:  { style: BorderStyle.SINGLE, size: 18, color: C_ORANGE, space: 24 },
            offsetFrom: 'page',
          },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: C_GRAY_BORDER, space: 1 } },
              spacing: { after: 60 },
              children: [
                ...(loadImg('image2.png')
                  ? [new ImageRun({ data: loadImg('image2.png'), transformation: { width: 153, height: 19 }, type: 'png' })]
                  : [bold('AutomationEdge', 18, C_NAVY)]),
                new TextRun({ text: '\t', size: 18 }),
                bold('Budgetary Proposal for Business Process Automation', 18, C_BLACK),
                new TextRun({ text: '\t', size: 18 }),
                ...(loadImg('image3.png')
                  ? [new ImageRun({ data: loadImg('image3.png'), transformation: { width: 100, height: 22 }, type: 'png' })]
                  : [run('{{client_name}}', 16, '595959')]),
              ],
              tabStops: [
                { type: TabStopType.CENTER, position: Math.round(DXA_CONTENT / 2) },
                { type: TabStopType.RIGHT,  position: DXA_CONTENT },
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              border: { top: { style: BorderStyle.SINGLE, size: 18, color: C_GRAY_BORDER, space: 1 } },
              spacing: { before: 60 },
              children: [
                run('Page ', 20),
                new TextRun({ children: ['PAGE'], fieldType: 'PAGE', size: 20, font: 'Calibri' }),
                run(' of ', 20),
                new TextRun({ children: ['NUMPAGES'], fieldType: 'NUMPAGES', size: 20, font: 'Calibri' }),
                new TextRun({ text: '\t', size: 16 }),
                run('This document may contain confidential information intended for the organization to which it is submitted.  The information should not be disseminated, distributed or copied.', 16),
                new TextRun({ text: '\t', size: 18 }),
                new TextRun({ text: 'https://automationedge.com/', size: 18, font: 'Calibri', color: '0563C1' }),
              ],
              tabStops: [
                { type: TabStopType.CENTER, position: Math.round(DXA_CONTENT / 2) },
                { type: TabStopType.RIGHT,  position: DXA_CONTENT },
              ],
            }),
          ],
        }),
      },

      children: [

        // ════ TABLE OF CONTENTS ════
        p([new TextRun({ text: 'Table of Content', bold: true, size: 28, font: 'Calibri', color: C_NAVY,
                         underline: { type: UnderlineType.SINGLE } })], { alignment: AlignmentType.CENTER }),
        sp(80),
        ...[
          ['Confidentiality Statement',                       '3'],
          ['Contact Information',                             '3'],
          ['1  Executive Summary',                            '4'],
          ['2  Scope of Work',                                '6'],
          ['3  AutomationEdge Deployment',                    '19'],
          ['4  Post Go Live Support Structure',               '22'],
          ['5  Pricing and Payment Terms',                    '23'],
          ['6  Terms and Conditions',                         '26'],
          ['7  Automation - A Universal Automation Platform', '31'],
        ].map(([title, pg]) => new Paragraph({
          children: [run(title, 20), new TextRun({ text: '\t', size: 20 }), run(pg, 20)],
          tabStops: [{ type: TabStopType.RIGHT, position: DXA_CONTENT, leader: TabStopType.DOT }],
          spacing: { after: 80 },
        })),

        pageBreakPara(),

        // ════ CONFIDENTIALITY ════
        sectionHeading('Confidentiality Statement'),
        sp(60),
        p([run('The information contained in this proposal is of a proprietary nature and is not to be revealed or used except for the evaluation of this proposal and/or in the performance of the services proposed herein. This proposal is strictly meant for the addressee or persons within ', 20), bold('{{client_name}}', 20), run(' (hereinafter referred to as the ', 20), bold('Client', 20), run(') who are designated to evaluate or consider the proposal.', 20)]),
        sp(80),
        p([run('No part of this work may be reproduced or transmitted in any form or by any means, electronic or mechanical, including photocopying and recording or by any information storage or retrieval system, except as may be permitted by AutomationEdge.', 20)]),
        sp(80),
        p([run('AutomationEdge submits this proposal with the understanding that it will be used only in accordance with the stated intent expressed by the addressee in its solicitation.', 20)]),
        sp(80),
        p([bold('Proposal Validity: ', 20), bold('30 days', 20, C_ORANGE_DARK), run(' from the date of the proposal', 20)]),
        sp(160),

        // ════ CONTACT INFORMATION ════
        sectionHeading('Contact Information'),
        sp(60),
        p([new TextRun({ text: 'Local Contact', bold: true, size: 22, underline: { type: UnderlineType.SINGLE }, font: 'Calibri' })]),
        sp(60),
        // Contact table with {{placeholders}}
        new Table({
          width: { size: DXA_CONTENT, type: WidthType.DXA },
          columnWidths: [DXA_CONTENT],
          rows: [
            // Orange banner row
            new TableRow({
              children: [new TableCell({
                columnSpan: 2, width: { size: DXA_CONTENT, type: WidthType.DXA },
                borders: ALL_BORDERS(C_ORANGE, 8), shading: { fill: C_ORANGE, type: ShadingType.CLEAR },
                margins: { top: 100, bottom: 100, left: 120, right: 120 },
                children: [p([bold('Your Point of Contact for this document', 22, C_WHITE)], { alignment: AlignmentType.CENTER })],
              })],
            }),
            ...[
              ['Name',            '{{contact_name}}'],
              ['Title',           '{{contact_title}}'],
              ['Mailing Address', '{{contact_address}}'],
              ['Email',           '{{contact_email}}'],
              ['Mobile',          '{{contact_mobile}}'],
            ].map(([label, tag]) => new TableRow({
              children: [
                labelCell(label, 2800),
                phCell(tag, DXA_CONTENT - 2800),
              ],
            })),
          ],
          layout: TableLayoutType.FIXED,
        }),

        pageBreakPara(),

        // ════ SECTION 1: EXECUTIVE SUMMARY ════
        sectionHeading('1  Executive Summary'),
        subHeading('1.1  Overview of the Project'),
        p([bold('AutomationEdge', 20), run(' is excited to present this proposal to ', 20), bold('{{client_name}}', 20), run(' for the implementation of our Robotic Process HyperAutomation and Intelligent Document Processing (IDP), which is known as the DocEdge solution. Our objective is to revolutionize and automate repetitive business processes, driving efficiency and operational excellence across the workflows.', 20)]),
        sp(80),
        p([run('We are honoured by the opportunity to partner in this transformative journey. With our proven expertise, cutting-edge technology, and industry-leading consulting services, we are confident in our ability to deliver seamless and impactful automation. Together, we aim to ensure the successful completion of these mission-critical ', 20), bold('HyperAutomation projects', 20), run(', unlocking new levels of productivity and innovation.', 20)]),
        sp(80),
        p([run('We look forward to building a ', 20), bold('long-lasting, value-driven partnership.', 20)]),
        sp(120),

        subHeading('1.2  Business Value'),
        p([bold('Leveraging RPA and IDP capabilities with AutomationEdge', 20)]),
        sp(60),
        ...[
          ['1.  Elevated Operational Efficiency:', 'With AutomationEdge\'s RPA and IDP, businesses can automate repetitive tasks such as data extraction, invoice processing, and document management, ensuring employees focus on strategic, high-value activities that foster innovation and growth.'],
          ['2.  Significant Cost Reduction:', 'By automating high-volume, labor-intensive processes, AutomationEdge\'s RPA and IDP solutions significantly reduce operational costs and mitigate the risk of costly errors.'],
          ['3.  Accelerated Time to Value:', 'AutomationEdge\'s technologies are designed for quick deployment and seamless integration with legacy systems, significantly shortening the time required to achieve operational excellence.'],
          ['4.  Superior Customer Experience:', 'RPA and IDP ensure faster, more responsive service delivery by automating key touchpoints in the customer journey, enhancing customer satisfaction and building long-term loyalty.'],
        ].flatMap(([heading, body]) => [
          p([bold(heading, 20)]),
          p([run(body, 20)], { indent: { left: 720 }, spacing: { after: 60 } }),
        ]),

        pageBreakPara(),

        // ════ SECTION 2: SCOPE OF WORK ════
        sectionHeading('2  Scope of Work'),
        subHeading('2.1  Business Requirements'),
        p([bold('{{client_name}}', 20), run(' is exploring Robotic Process Automation (RPA) and DocEdge for the processes given in the requirement section as the scope of work for this engagement.', 20)]),
        sp(80),
        subSubHeading('Process Summary'),

        // ── Process Summary Table with {{#processes}} loop ────────────────────
        // docxtemplater: the {{#processes}} tag MUST be on its own in a table row
        // The row containing {{#processes}} is the "opening" row (hidden in output)
        // The next row is the "body" row that gets repeated
        // The row containing {{/processes}} closes the loop
        new Table({
          width: { size: DXA_CONTENT, type: WidthType.DXA },
          columnWidths: [400, 1500, 2800, 1200, 1300, 2160],
          rows: [
            // Header row
            new TableRow({ children: [
              hdrCell('Sr No',       400),
              hdrCell('Process Name', 1500),
              hdrCell('Summary',      2800),
              hdrCell('Volume',       1200),
              hdrCell('SME',          1300),
              hdrCell('Complexity',   2160),
            ]}),
            // Loop open row — contains only {{#processes}}
            new TableRow({ children: [
              new TableCell({
                columnSpan: 6,
                width: { size: DXA_CONTENT, type: WidthType.DXA },
                borders: ALL_BORDERS('FFFFFF', 1),
                children: [p([run('{{#processes}}', 20)])],
              }),
            ]}),
            // Data row — body of the loop
            new TableRow({ children: [
              phCell('{{sr_no}}',       400),
              phCell('{{process_name}}', 1500),
              phCell('{{summary}}',      2800),
              phCell('{{volume}}',       1200),
              phCell('{{sme}}',          1300),
              phCell('{{complexity}}',   2160),
            ]}),
            // Loop close row
            new TableRow({ children: [
              new TableCell({
                columnSpan: 6,
                width: { size: DXA_CONTENT, type: WidthType.DXA },
                borders: ALL_BORDERS('FFFFFF', 1),
                children: [p([run('{{/processes}}', 20)])],
              }),
            ]}),
          ],
          layout: TableLayoutType.FIXED,
        }),

        sp(80),
        p([run('Notes: Process complexity will be finalised after detailed requirement gathering. Effort estimates may vary.', 20)]),

        pageBreakPara(),

        subHeading('2.2  Solution Approach'),
        p([run('The AutomationEdge RPA and IDP solution offers enhanced accuracy, efficiency and time-saving advantages.', 20)]),
        sp(80),
        // Solution mapping table
        new Table({
          width: { size: DXA_CONTENT, type: WidthType.DXA },
          columnWidths: [600, 2760, 6000],
          rows: [
            new TableRow({ children: [hdrCell('No.', 600), hdrCell('Process Name', 2760), hdrCell('Proposed Solution Components', 6000)] }),
            // Loop for solution mapping
            new TableRow({ children: [new TableCell({ columnSpan: 3, width: { size: DXA_CONTENT, type: WidthType.DXA }, borders: ALL_BORDERS('FFFFFF', 1), children: [p([run('{{#processes}}', 20)])] })] }),
            new TableRow({ children: [phCell('{{sr_no}}', 600), phCell('{{process_name}}', 2760), phCell('{{solution_mapping}}', 6000)] }),
            new TableRow({ children: [new TableCell({ columnSpan: 3, width: { size: DXA_CONTENT, type: WidthType.DXA }, borders: ALL_BORDERS('FFFFFF', 1), children: [p([run('{{/processes}}', 20)])] })] }),
          ],
          layout: TableLayoutType.FIXED,
        }),

        pageBreakPara(),

        subHeading('2.3  Project Deliverable'),
        p([run('AutomationEdge will provide the following deliverables as a part of implementation:', 20)]),
        sp(60),
        new Table({
          width: { size: DXA_CONTENT, type: WidthType.DXA }, columnWidths: [1200, 8160],
          rows: [
            new TableRow({ children: [hdrCell('Sr. No.', 1200), hdrCell('Project Deliverable', 8160)] }),
            ...['Business Requirement Documentation', 'Project Plan', 'Solution Design and Configuration', 'AutomationEdge Workflows', 'Training Manual/Guide']
              .map((d, i) => new TableRow({ children: [phCell(String(i + 1), 1200), phCell(d, 8160)] })),
          ],
          layout: TableLayoutType.FIXED,
        }),

        pageBreakPara(),

        subHeading('2.4  Assumptions'),
        ...[
          'A persistent data store like PostgreSQL server will be used for saving application statistics.',
          'The implementation will be for English language only.',
          'The client will provide VPN access and system connectivity & APIs wherever available.',
          'Any delays in provision of hardware, software, requested data, system access, credentials will impact the SOW schedule and cost.',
          'Any change in requirement after requirement sign-off will be considered a change request with corresponding commercial implications.',
        ].map((a, i) => p([run(`${i + 1}. ${a}`, 20)], { spacing: { after: 60 } })),

        pageBreakPara(),

        // ════ SECTION 3: DEPLOYMENT ════
        sectionHeading('3  AutomationEdge Deployment'),
        subHeading('3.1  Proposed Software'),
        p([run('Below are the proposed software licence requirements for automation deployment.', 20)]),
        sp(60),
        new Table({
          width: { size: DXA_CONTENT, type: WidthType.DXA }, columnWidths: [400, 4960, 2000, 2000],
          rows: [
            new TableRow({ children: [hdrCell('No.', 400), hdrCell('Line Item', 4960), hdrCell('Quantity', 2000), hdrCell('Notes', 2000)] }),
            new TableRow({ children: [phCell('1', 400), phCell('AutomationEdge RPA Unassisted BOT', 4960), phCell('{{num_bots}}', 2000), phCell('Unassisted', 2000)] }),
            new TableRow({ children: [phCell('2', 400), phCell('DocEdge IDP – Per-page Processing / Year', 4960), phCell('{{idp_pages}}', 2000), phCell('Annual pages', 2000)] }),
            new TableRow({ children: [phCell('3', 400), phCell('Agentic AI Plugins', 4960), phCell('{{num_plugins}}', 2000), phCell('LLM + Classifier + RAG', 2000)] }),
          ],
          layout: TableLayoutType.FIXED,
        }),

        pageBreakPara(),

        subHeading('3.2  Proposed Infrastructure Sizing'),
        p([run('Below are the infrastructure requirements/prerequisites for on-premises deployment.', 20)]),
        sp(60),

        // Production servers table
        p([bold('Production Environment', 20, C_WHITE)], {
          shading: { fill: C_ORANGE, type: ShadingType.CLEAR },
          spacing: { after: 0 },
        }),
        new Table({
          width: { size: DXA_CONTENT, type: WidthType.DXA }, columnWidths: [800, 2700, 700, 600, 600, 700, 700, 1460, 800, 700],
          rows: [
            new TableRow({ children: ['Qty','Module','Server','vCPU','Core','RAM','HD (GB)','OS','DB','Web Server'].map((h, i) => hdrCell(h, [800,2700,700,600,600,700,700,1460,800,700][i])) }),
            // Loop for production servers
            new TableRow({ children: [new TableCell({ columnSpan: 10, width: { size: DXA_CONTENT, type: WidthType.DXA }, borders: ALL_BORDERS('FFFFFF', 1), children: [p([run('{{#prod_servers}}', 20)])] })] }),
            new TableRow({ children: ['{{qty}}','{{module}}','{{server}}','{{vcpu}}','{{core}}','{{ram}}','{{hd}}','{{os}}','{{db}}','{{web}}'].map((t, i) => phCell(t, [800,2700,700,600,600,700,700,1460,800,700][i])) }),
            new TableRow({ children: [new TableCell({ columnSpan: 10, width: { size: DXA_CONTENT, type: WidthType.DXA }, borders: ALL_BORDERS('FFFFFF', 1), children: [p([run('{{/prod_servers}}', 20)])] })] }),
          ],
          layout: TableLayoutType.FIXED,
        }),
        sp(80),

        p([bold('UAT Environment', 20, C_WHITE)], { shading: { fill: C_ORANGE, type: ShadingType.CLEAR }, spacing: { after: 0 } }),
        new Table({
          width: { size: DXA_CONTENT, type: WidthType.DXA }, columnWidths: [800, 2700, 700, 600, 600, 700, 700, 1460, 800, 700],
          rows: [
            new TableRow({ children: ['Qty','Module','Server','vCPU','Core','RAM','HD (GB)','OS','DB','Web Server'].map((h, i) => hdrCell(h, [800,2700,700,600,600,700,700,1460,800,700][i])) }),
            new TableRow({ children: [new TableCell({ columnSpan: 10, width: { size: DXA_CONTENT, type: WidthType.DXA }, borders: ALL_BORDERS('FFFFFF', 1), children: [p([run('{{#uat_servers}}', 20)])] })] }),
            new TableRow({ children: ['{{qty}}','{{module}}','{{server}}','{{vcpu}}','{{core}}','{{ram}}','{{hd}}','{{os}}','{{db}}','{{web}}'].map((t, i) => phCell(t, [800,2700,700,600,600,700,700,1460,800,700][i])) }),
            new TableRow({ children: [new TableCell({ columnSpan: 10, width: { size: DXA_CONTENT, type: WidthType.DXA }, borders: ALL_BORDERS('FFFFFF', 1), children: [p([run('{{/uat_servers}}', 20)])] })] }),
          ],
          layout: TableLayoutType.FIXED,
        }),
        sp(80),

        p([bold('Development Environment', 20, C_WHITE)], { shading: { fill: C_ORANGE, type: ShadingType.CLEAR }, spacing: { after: 0 } }),
        new Table({
          width: { size: DXA_CONTENT, type: WidthType.DXA }, columnWidths: [800, 2700, 700, 600, 600, 700, 700, 1460, 800, 700],
          rows: [
            new TableRow({ children: ['Qty','Module','Server','vCPU','Core','RAM','HD (GB)','OS','DB','Web Server'].map((h, i) => hdrCell(h, [800,2700,700,600,600,700,700,1460,800,700][i])) }),
            new TableRow({ children: [new TableCell({ columnSpan: 10, width: { size: DXA_CONTENT, type: WidthType.DXA }, borders: ALL_BORDERS('FFFFFF', 1), children: [p([run('{{#dev_servers}}', 20)])] })] }),
            new TableRow({ children: ['{{qty}}','{{module}}','{{server}}','{{vcpu}}','{{core}}','{{ram}}','{{hd}}','{{os}}','{{db}}','{{web}}'].map((t, i) => phCell(t, [800,2700,700,600,600,700,700,1460,800,700][i])) }),
            new TableRow({ children: [new TableCell({ columnSpan: 10, width: { size: DXA_CONTENT, type: WidthType.DXA }, borders: ALL_BORDERS('FFFFFF', 1), children: [p([run('{{/dev_servers}}', 20)])] })] }),
          ],
          layout: TableLayoutType.FIXED,
        }),

        pageBreakPara(),

        // ════ SECTION 4: POST GO LIVE ════
        sectionHeading('4  Post Go Live Support Structure'),
        subHeading('4.1 Post-production Support'),
        p([run('AutomationEdge will provide post-production support for 2 months after go-live.', 20)]),
        sp(80),
        subHeading('4.2 Product Support for 1 Year'),
        new Table({
          width: { size: DXA_CONTENT, type: WidthType.DXA }, columnWidths: [400, 4560, 2200, 2200],
          rows: [
            new TableRow({ children: ['No.','Support Type','Response Time','Resolution Time'].map((h, i) => hdrCell(h, [400,4560,2200,2200][i])) }),
            new TableRow({ children: [phCell('1',400),phCell('Critical (P1)',4560),phCell('4 hours',2200),phCell('24 hours',2200)] }),
            new TableRow({ children: [phCell('2',400),phCell('High (P2)',4560),phCell('8 hours',2200),phCell('48 hours',2200)] }),
            new TableRow({ children: [phCell('3',400),phCell('Medium (P3)',4560),phCell('24 hours',2200),phCell('72 hours',2200)] }),
            new TableRow({ children: [phCell('4',400),phCell('Low (P4)',4560),phCell('48 hours',2200),phCell('5 working days',2200)] }),
          ],
          layout: TableLayoutType.FIXED,
        }),

        pageBreakPara(),

        // ════ SECTION 5: PRICING ════
        sectionHeading('5  Pricing and Payment Terms'),
        subHeading('5.1 AutomationEdge Software Cost'),
        new Table({
          width: { size: DXA_CONTENT, type: WidthType.DXA }, columnWidths: [400, 3760, 1400, 1800, 2000],
          rows: [
            new TableRow({ children: ['No.','Line Item','Units','Unit Price (INR)','Total (INR)'].map((h, i) => hdrCell(h, [400,3760,1400,1800,2000][i])) }),
            new TableRow({ children: [phCell('1',400), phCell('AutomationEdge RPA Advanced Unassisted Bot',3760), phCell('{{num_bots}}',1400), phCell('2,50,000',1800), phCell('',2000)] }),
            new TableRow({ children: [phCell('2',400), phCell('DocEdge (IDP) – Per-page Processing',3760),         phCell('{{idp_pages}}',1400), phCell('2',1800),       phCell('',2000)] }),
            new TableRow({ children: [phCell('3',400), phCell('Agentic AI Plugins',3760),                          phCell('{{num_plugins}}',1400),phCell('3,00,000',1800),phCell('',2000)] }),
            new TableRow({ children: [
              new TableCell({ columnSpan: 4, width: { size: 400+3760+1400+1800, type: WidthType.DXA },
                borders: ALL_BORDERS('CCCCCC', 4), shading: { fill: C_AMBER, type: ShadingType.CLEAR },
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                children: [p([bold('Total', 20)])] }),
              phCell('To be confirmed', 2000),
            ]}),
          ],
          layout: TableLayoutType.FIXED,
        }),
        sp(80),

        subHeading('5.2 Payment Schedule'),
        new Table({
          width: { size: DXA_CONTENT, type: WidthType.DXA }, columnWidths: [400, 5560, 3400],
          rows: [
            new TableRow({ children: ['No.','Milestone','Payment (%)'].map((h, i) => hdrCell(h, [400,5560,3400][i])) }),
            new TableRow({ children: [phCell('1',400), phCell('On signing of contract / Purchase Order',5560), phCell('30%',3400)] }),
            new TableRow({ children: [phCell('2',400), phCell('On delivery of Development / Configuration',5560), phCell('40%',3400)] }),
            new TableRow({ children: [phCell('3',400), phCell('On Go-Live / Acceptance',5560), phCell('30%',3400)] }),
          ],
          layout: TableLayoutType.FIXED,
        }),

        pageBreakPara(),

        // ════ SECTION 6: T&C ════
        sectionHeading('6  Terms and Conditions'),
        sp(60),
        ...[
          'Scope of work for each Use Case mentioned above is tentative and will be finalised after detailed requirement gathering only.',
          'Effort estimates will vary depending on the actual complexity and deviations from assumptions.',
          'AutomationEdge is not responsible for third-party product licensing, upgrades, or procurement.',
          'Any changes to the agreed scope will require a Change Request (CR) with separate commercial approval.',
          'This proposal is valid for 30 days from the date of issue.',
          'All intellectual property developed during the project shall be owned by the client upon full payment.',
          'AutomationEdge reserves the right to assign qualified resources for project execution.',
          'The client will provide timely access to systems, data, and SMEs as required for the project.',
          'Data shared with AutomationEdge will be kept confidential and used only for the stated purposes.',
          'Dispute resolution will follow the mutually agreed contractual terms, under Indian jurisdiction.',
        ].map((t, i) => new Paragraph({
          numbering: { reference: 'tnc', level: 0 },
          children: [run(t, 20)],
          spacing: { after: 60 },
        })),

        pageBreakPara(),

        // ════ SECTION 7: ABOUT ════
        sectionHeading('7  Automation - A Universal Automation Platform'),
        sp(60),
        p([run('AutomationEdge is a Universal Automation Platform that combines Robotic Process Automation (RPA), Artificial Intelligence (AI), and Intelligent Document Processing (IDP) into a single unified platform.', 20)]),
        sp(60),
        subSubHeading('7.1 What is a Universal Automation Platform?'),
        p([run('A Universal Automation Platform integrates RPA, AI, and IDP to automate end-to-end business processes — structured and unstructured. AutomationEdge provides:', 20)]),
        ...[
          'Robotic Process Automation (RPA) – for UI-based and API-based process automation',
          'DocEdge (IDP) – for intelligent extraction and processing of documents',
          'Agentic AI – for autonomous, decision-making bots powered by LLMs',
          'HyperAutomation – for combining multiple automation technologies',
        ].map(t => new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [run(t, 20)] })),
      ],
    },
  ],
});

// ── Write output ─────────────────────────────────────────────────────────────
const outputDir  = path.join(__dirname, '..', '..', 'assets');
const outputPath = path.join(outputDir, 'AE_BusinessProposal_Template.docx');

// Fallback: write next to this script if assets/ doesn't exist
const finalPath = fs.existsSync(outputDir) ? outputPath : path.join(__dirname, 'AE_BusinessProposal_Template.docx');

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(finalPath, buf);
  console.log('✅ Template written to:', finalPath);
}).catch(err => {
  console.error('❌ Template build failed:', err.message);
  process.exit(1);
});
