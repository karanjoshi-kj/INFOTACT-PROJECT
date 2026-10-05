const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

function createReportPDF(outputPath) {
  const doc = new PDFDocument({
    margin: 45,
    size: "A4",
    bufferPages: true,
    info: {
      Title: "SyncDoc Project Updates Report",
      Author: "Kilo Engineering Team",
      Subject: "SyncDoc Feature Implementation & Architecture Summary",
      Keywords: "SyncDoc, PDF Export, Roman Numbering, Spreadsheets, Toolbar",
    },
  });

  const writeStream = fs.createWriteStream(outputPath);
  doc.pipe(writeStream);

  const colors = {
    primary: "#4338ca",
    primaryLight: "#e0e7ff",
    secondary: "#0ea5e9",
    dark: "#0f172a",
    body: "#334155",
    muted: "#64748b",
    border: "#cbd5e1",
    bgLight: "#f8fafc",
    cardBg: "#f1f5f9",
    success: "#16a34a",
    accent: "#d97706",
  };

  function header() {
    doc.fillColor(colors.primary)
      .fontSize(22)
      .font("Helvetica-Bold")
      .text("SyncDoc Project Updates Report", { align: "left" });

    doc.moveDown(0.2);
    doc.fillColor(colors.muted)
      .fontSize(9.5)
      .font("Helvetica")
      .text("Comprehensive Feature Documentation, Architecture & Real-Time Persistence Details");

    doc.moveDown(0.4);
    doc.strokeColor(colors.primary).lineWidth(2).moveTo(45, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.8);
  }

  function sectionTitle(num, title) {
    if (doc.y > 680) doc.addPage();
    doc.moveDown(0.4);
    doc.fillColor(colors.primary)
      .fontSize(13)
      .font("Helvetica-Bold")
      .text(`${num}. ${title}`);
    doc.moveDown(0.2);
    doc.strokeColor(colors.border).lineWidth(0.8).moveTo(45, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.4);
  }

  function subTitle(title) {
    if (doc.y > 700) doc.addPage();
    doc.moveDown(0.2);
    doc.fillColor(colors.dark)
      .fontSize(10.5)
      .font("Helvetica-Bold")
      .text(title);
    doc.moveDown(0.15);
  }

  function paragraph(text) {
    if (doc.y > 710) doc.addPage();
    doc.fillColor(colors.body)
      .fontSize(9)
      .font("Helvetica")
      .text(text, { align: "justify", lineGap: 2.5 });
    doc.moveDown(0.3);
  }

  function bullet(label, desc) {
    if (doc.y > 710) doc.addPage();
    doc.fillColor(colors.primary)
      .fontSize(9)
      .font("Helvetica-Bold")
      .text("  •  ", { continued: true });
    doc.fillColor(colors.dark)
      .font("Helvetica-Bold")
      .text(`${label}: `, { continued: true });
    doc.fillColor(colors.body)
      .font("Helvetica")
      .text(desc, { lineGap: 2 });
    doc.moveDown(0.2);
  }

  function infoBox(title, lines) {
    if (doc.y > 670) doc.addPage();
    const startY = doc.y;
    const boxWidth = 505;
    const estimatedHeight = lines.length * 14 + 28;

    doc.roundedRect(45, startY, boxWidth, estimatedHeight, 6)
      .fillAndStroke(colors.bgLight, colors.border);

    doc.fillColor(colors.primary)
      .fontSize(9.5)
      .font("Helvetica-Bold")
      .text(title, 55, startY + 8);

    let curY = startY + 22;
    lines.forEach((line) => {
      doc.fillColor(colors.body)
        .fontSize(8.5)
        .font("Helvetica")
        .text(line, 55, curY, { width: boxWidth - 20, lineGap: 1.5 });
      curY += 13;
    });

    doc.y = startY + estimatedHeight + 8;
  }

  // ---- Page 1 Content ----
  header();

  sectionTitle("1", "Executive Summary");
  paragraph(
    "This report outlines the architecture and implementation of the four major updates delivered to the SyncDoc collaborative editing platform. All updates integrate natively with the existing Yjs real-time CRDT WebSocket engine, Express REST API, and MongoDB document persistence models without artificial mocks or local-only workarounds."
  );

  infoBox("Key Implementation Highlights", [
    "1. PDF Export: Native PDF generation using PDFKit & Cheerio with MongoDB export tracking metadata.",
    "2. Roman Numbering: Added Roman numeral (I, II, III...) list style with DOM transformation, real-time sync & DB persistence.",
    "3. Formula Bar Streamlining: Removed separate formula syntax hints while preserving 100% calculation engine functionality.",
    "4. Toolbar Selection & Persistence: Visual active states for all tools, synchronized via Yjs and persisted to MongoDB toolState.",
  ]);

  sectionTitle("2", "PDF Export Implementation");
  subTitle("Toolbar & Frontend Integration");
  paragraph(
    "A dedicated PDF export button has been added to the far right of the formatting toolbar (Row 2), separated by a flexible layout spacer. When clicked, it disables interaction, triggers an animated pulse state, snapshots the editor's latest HTML and document title, and invokes the backend export API."
  );

  subTitle("Backend Rendering Engine & Database Tracking");
  paragraph(
    "The backend endpoint (POST /api/documents/:id/export/pdf) receives the document payload, saves any pending edits to MongoDB, and passes the sanitized HTML to a custom PDF generator powered by PDFKit and Cheerio. The generator parses headings, marked text (bold, italic, underline, strikethrough), bullet lists, numbered lists, Roman lists, tables/spreadsheets, code blocks, and embedded base64 images into a publication-ready PDF document."
  );
  bullet("Document State Handling", "Upon each export, MongoDB persists lastExportedAt (timestamp) and increments exportCount, providing an audit trail of export events directly on the document document model.");
  bullet("Streaming Delivery", "The generated binary PDF buffer is streamed directly to the browser with appropriate Content-Disposition headers for seamless client-side download.");

  // ---- Page 2 Content ----
  doc.addPage();

  sectionTitle("3", "Roman Numbering (I, II, III...) Implementation");
  subTitle("Dropdown Option & DOM Transformation");
  paragraph(
    "The list options dropdown in the toolbar now features 'Roman numerals (I, II, III...)' as its third option alongside Bullet and Numbered lists. Selecting Roman numbering executes a custom handler (handleInsertRomanList) in Editor.jsx that inspects the current selection context:"
  );
  bullet("Context Conversion", "If inside a bullet list (<ul>), it converts the node to an ordered list (<ol>). If inside an existing numbered list, it toggles between decimal and Roman numbering.");
  bullet("DOM Structure", "Roman lists are structured with type=\"I\", class=\"roman-list\", and style=\"list-style-type: upper-roman\". Browser native list numbering automatically increments subsequent items (I, II, III...) upon pressing Enter.");

  subTitle("Sanitization & Real-Time CRDT Sync");
  paragraph(
    "Because Roman lists are represented directly in the semantic DOM, updates are propagated in real time through the shared Yjs text instance (ydoc.getText('content')) across all connected collaborators. The backend HTML sanitizer was updated to allow safe list attributes (type=\"I\", list-style-type: upper-roman), ensuring that Roman lists persist accurately to MongoDB and remain intact across page reloads."
  );

  sectionTitle("4", "Spreadsheet Formula Bar Streamlining");
  subTitle("UI Simplification");
  paragraph(
    "In the spreadsheet contextual tool strip, the redundant textual hint ('Formulas: =SUM(A1:A3)') located below/beside the controls was removed. The main Formula Bar — featuring the selected cell reference badge, formula function selector dropdown, fx indicator, formula expression input, and Apply button — is retained in its primary position beside 'Insert spreadsheet'."
  );

  subTitle("Preservation of Calculation Logic");
  paragraph(
    "All underlying formula parsing, lexical tokenization, multi-pass spreadsheet dependency recalculation, and cell formula storage via data-formula attributes remain completely functional and intact across all collaborative sessions."
  );

  sectionTitle("5", "Toolbar Selection & State Persistence");
  subTitle("Visual Selected State");
  paragraph(
    "Toolbar controls now feature a prominent active visual state with themed background highlights, borders, and bold typography. Visual feedback is provided for Text Formatting (Bold, Italic, Underline, Strikethrough), Alignment (Left, Center, Right, Justify), List Styles (Bullet, Numbered, Roman), Mode Tabs (Photograph, Code, Spreadsheet), and Code Block Language."
  );

  subTitle("State Persistence & Collaborative Synchronization");
  paragraph(
    "Toolbar state is persisted in MongoDB under Document.toolState (including activeTab, codeLang, zoom, listStyle, and textAlign). In addition, active tool states are shared across participants via a synchronized Yjs map (ydoc.getMap('toolState')), allowing collaborators to maintain consistent editor configurations."
  );

  // ---- Page 3 Content ----
  doc.addPage();

  sectionTitle("6", "Frontend ↔ Backend ↔ Database Architecture");
  paragraph(
    "The diagram below outlines the communication pathways and real-time synchronization model governing SyncDoc:"
  );

  infoBox("Architecture & Data Flow Overview", [
    "• Real-Time Collaborative Layer (Yjs CRDT + WebSockets):",
    "   - Port 1234 y-websocket server manages real-time document rooms.",
    "   - Document HTML content is synchronized via ytext ('content').",
    "   - Active formatting & toolbar states synchronize via ytool ('toolState').",
    "   - Room access approvals and author color highlights synchronize via ydoc maps.",
    "",
    "• Persistence Layer (Express REST API + MongoDB):",
    "   - Debounced REST PUT calls (/api/documents/:id) save latest content & toolState.",
    "   - Backend applies Cheerio-based safe HTML sanitization preserving formatting tags & styles.",
    "   - AST text transformation synchronizes the block/mark database hierarchy.",
    "",
    "• Export Layer (PDFKit + Stream Response):",
    "   - POST /api/documents/:id/export/pdf updates export metadata & generates PDF buffer.",
    "   - Browser receives binary PDF stream and triggers automatic download.",
  ]);

  sectionTitle("7", "Summary of Modified Files");

  const tableTop = doc.y + 4;
  const colX = [45, 230, 550];
  const rowHeight = 20;

  doc.rect(colX[0], tableTop, colX[2] - colX[0], rowHeight).fill(colors.primary);
  doc.fillColor("#ffffff").fontSize(8.5).font("Helvetica-Bold");
  doc.text("File Path", colX[0] + 6, tableTop + 5);
  doc.text("Description of Changes", colX[1] + 6, tableTop + 5);

  const fileRows = [
    ["server/package.json", "Added dependencies for PDFKit (PDF rendering) and Cheerio (DOM parsing)."],
    ["server/src/models/Document.js", "Extended schema with lastExportedAt, exportCount, and toolState schema."],
    ["server/src/routes/documentRoutes.js", "Added PDF export endpoints, enhanced HTML sanitizer, and toolState persistence."],
    ["server/src/utils/pdfExport.js", "Implemented modular HTML-to-PDF generation utility with Roman numeral support."],
    ["src/services/api.js", "Added exportDocumentPdf API call and toolState payload support in saveDocument."],
    ["src/components/Editor/Editor.jsx", "Added Roman list handler, PDF export handler, Yjs tool state map & sync."],
    ["src/components/Editor/Editor.css", "Added CSS styling for Roman numeral lists and ordered list markers."],
    ["src/components/Editor/Toolbar.jsx", "Added PDF export button, Roman dropdown option, active states, removed formula hint."],
    ["src/components/Editor/Toolbar.css", "Enhanced active button styles, added export button styling and pulse animation."],
    ["src/pages/EditorPage.jsx", "Wired document title, toolState loading/saving, and state persistence flow."],
  ];

  let curRowY = tableTop + rowHeight;
  fileRows.forEach(([fPath, fDesc], index) => {
    const isEven = index % 2 === 0;
    doc.rect(colX[0], curRowY, colX[2] - colX[0], rowHeight)
      .fillAndStroke(isEven ? colors.bgLight : "#ffffff", colors.border);

    doc.fillColor(colors.dark).fontSize(7.5).font("Courier-Bold")
      .text(fPath, colX[0] + 6, curRowY + 5, { width: 175 });

    doc.fillColor(colors.body).fontSize(7.5).font("Helvetica")
      .text(fDesc, colX[1] + 6, curRowY + 5, { width: 305 });

    curRowY += rowHeight;
  });

  // Footer for all pages
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.fillColor(colors.muted)
      .fontSize(8)
      .font("Helvetica")
      .text(
        `SyncDoc Engineering Report • Page ${i + 1} of ${range.count}`,
        45,
        790,
        { align: "center", width: 505 }
      );
  }

  doc.end();
  return new Promise((resolve, reject) => {
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
  });
}

const outPath = path.resolve(__dirname, "../../SyncDoc_Project_Updates_Report.pdf");
createReportPDF(outPath)
  .then(() => console.log("PDF report generated successfully at:", outPath))
  .catch((err) => {
    console.error("Failed to generate PDF:", err);
    process.exit(1);
  });
