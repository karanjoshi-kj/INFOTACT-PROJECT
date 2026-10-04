const PDFDocument = require("pdfkit");

/**
 * Transforms a Document AST Tree (Document -> Blocks -> Text with marks)
 * into a cleanly structured, formatted PDF stream.
 *
 * @param {Object} doc - Document object containing title and AST children
 * @param {WritableStream} outStream - Express res writable stream
 */
function exportASTToPDF(doc, outStream) {
  const pdf = new PDFDocument({
    margin: 50,
    size: "A4",
    info: {
      Title: doc.title || "Untitled Document",
      Author: "SyncDoc Collaborative Engine",
    },
  });

  pdf.pipe(outStream);

  // 1. Document Title
  pdf
    .fontSize(24)
    .font("Helvetica-Bold")
    .fillColor("#1e293b")
    .text(doc.title || "Untitled Document", { align: "left" })
    .moveDown(0.3);

  // 2. Metadata (Timestamp)
  const dateStr = doc.updatedAt
    ? new Date(doc.updatedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : new Date().toLocaleDateString();

  pdf
    .fontSize(10)
    .font("Helvetica")
    .fillColor("#64748b")
    .text(`Exported from SyncDoc · Last updated: ${dateStr}`, { align: "left" })
    .moveDown(0.8);

  // 3. Subtle horizontal separator line
  pdf
    .strokeColor("#e2e8f0")
    .lineWidth(1)
    .moveTo(50, pdf.y)
    .lineTo(545, pdf.y)
    .stroke()
    .moveDown(1.2);

  // 4. Transform AST Blocks (Paragraphs, Headings, Text nodes with marks)
  const blocks = Array.isArray(doc.children) ? doc.children : [];

  if (blocks.length === 0) {
    pdf
      .fontSize(11)
      .font("Helvetica-Oblique")
      .fillColor("#94a3b8")
      .text("(Empty document)")
      .moveDown(1);
  } else {
    blocks.forEach((block) => {
      // Check if block has text children
      if (!Array.isArray(block.children) || block.children.length === 0) {
        pdf.moveDown(0.5); // Empty line
        return;
      }

      // Check block type (Heading vs Paragraph)
      const isH1 = block.type === "heading" || block.type === "h1";
      const isH2 = block.type === "h2";

      const baseFontSize = isH1 ? 16 : isH2 ? 13 : 11;
      const baseLineGap = isH1 ? 6 : isH2 ? 5 : 4;
      pdf.fillColor("#334155");

      // Render inline text nodes with marks (bold / italic)
      block.children.forEach((child, idx) => {
        const isLastChild = idx === block.children.length - 1;
        const marks = Array.isArray(child.marks) ? child.marks : [];

        // Select font based on marks
        let fontName = "Helvetica";
        if (marks.includes("bold") && marks.includes("italic")) {
          fontName = "Helvetica-BoldOblique";
        } else if (marks.includes("bold") || isH1 || isH2) {
          fontName = "Helvetica-Bold";
        } else if (marks.includes("italic")) {
          fontName = "Helvetica-Oblique";
        }

        const underline = marks.includes("underline");

        pdf
          .fontSize(baseFontSize)
          .font(fontName)
          .text(child.content || "", {
            continued: !isLastChild, // Flow inline text together
            underline: underline,
            lineGap: baseLineGap,
          });
      });

      pdf.moveDown(0.6);
    });
  }

  // Finalize PDF
  pdf.end();
}

module.exports = exportASTToPDF;