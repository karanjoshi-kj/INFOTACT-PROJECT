const PDFDocument = require("pdfkit");
const cheerio = require("cheerio");

function toRoman(num) {
  const romanMap = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]
  ];
  let n = Math.max(1, Math.floor(num));
  let result = "";
  for (const [val, str] of romanMap) {
    while (n >= val) {
      result += str;
      n -= val;
    }
  }
  return result;
}

/**
 * Generates a PDF buffer from document title and html content
 */
async function generateDocumentPdf({ title = "Untitled Document", html = "" }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 50,
        size: "A4",
        info: {
          Title: title,
          Author: "SyncDoc",
          Creator: "SyncDoc Document Editor",
        },
      });

      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err) => reject(err));

      doc.fillColor("#1e293b")
        .fontSize(24)
        .font("Helvetica-Bold")
        .text(title || "Untitled Document", { align: "left" });

      doc.moveDown(0.3);
      doc.fillColor("#64748b")
        .fontSize(9)
        .font("Helvetica")
        .text(`Exported from SyncDoc • ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`);

      doc.moveDown(0.6);
      doc.strokeColor("#e2e8f0").lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(1);

      if (!html || !html.trim()) {
        doc.fillColor("#94a3b8").fontSize(11).font("Helvetica-Oblique").text("(Empty document)");
        doc.end();
        return;
      }

      const $ = cheerio.load(html, null, false);

      function extractTextAndMarks(element) {
        const parts = [];

        function traverse(node, currentMarks) {
          if (node.type === "text") {
            const text = node.data;
            if (text) {
              parts.push({ text, marks: { ...currentMarks } });
            }
          } else if (node.type === "tag") {
            const tag = node.name.toLowerCase();
            const nextMarks = { ...currentMarks };
            if (tag === "b" || tag === "strong") nextMarks.bold = true;
            if (tag === "i" || tag === "em") nextMarks.italic = true;
            if (tag === "u") nextMarks.underline = true;
            if (tag === "s" || tag === "strike" || tag === "del") nextMarks.strike = true;

            for (const child of node.children || []) {
              traverse(child, nextMarks);
            }
          }
        }

        for (const child of element.children || []) {
          traverse(child, {});
        }

        return parts;
      }

      function getTextAlign(el) {
        const style = $(el).attr("style") || "";
        const alignAttr = $(el).attr("align") || "";
        if (/text-align\s*:\s*center/i.test(style) || alignAttr.toLowerCase() === "center") return "center";
        if (/text-align\s*:\s*right/i.test(style) || alignAttr.toLowerCase() === "right") return "right";
        if (/text-align\s*:\s*justify/i.test(style) || alignAttr.toLowerCase() === "justify") return "justify";
        return "left";
      }

      function renderFormattedParagraph(parts, options = {}) {
        const align = options.align || "left";
        const fontSize = options.fontSize || 11;
        const color = options.color || "#334155";
        const isHeader = !!options.isHeader;

        if (!parts || parts.length === 0) {
          doc.moveDown(0.5);
          return;
        }

        const fullText = parts.map((p) => p.text).join("");
        if (!fullText.trim()) {
          doc.moveDown(0.4);
          return;
        }

        const hasMarks = parts.some((p) => p.marks.bold || p.marks.italic || p.marks.underline || p.marks.strike);

        if (!hasMarks) {
          doc.fillColor(color)
            .fontSize(fontSize)
            .font(isHeader ? "Helvetica-Bold" : "Helvetica")
            .text(fullText, { align, lineGap: 3 });
          doc.moveDown(0.4);
          return;
        }

        parts.forEach((part, index) => {
          let fontName = "Helvetica";
          if (part.marks.bold && part.marks.italic) fontName = "Helvetica-BoldOblique";
          else if (part.marks.bold || isHeader) fontName = "Helvetica-Bold";
          else if (part.marks.italic) fontName = "Helvetica-Oblique";

          doc.fillColor(color)
            .fontSize(fontSize)
            .font(fontName)
            .text(part.text, {
              continued: index < parts.length - 1,
              align: index === 0 ? align : undefined,
              underline: !!part.marks.underline,
              strike: !!part.marks.strike,
            });
        });

        doc.text("", { continued: false });
        doc.moveDown(0.4);
      }

      const rootNodes = $.root().children();

      rootNodes.each((_, el) => {
        const tag = el.name ? el.name.toLowerCase() : "";
        const $el = $(el);

        if (tag === "h1") {
          const parts = extractTextAndMarks(el);
          doc.moveDown(0.5);
          renderFormattedParagraph(parts, { fontSize: 18, color: "#0f172a", isHeader: true, align: getTextAlign(el) });
          doc.moveDown(0.3);
        } else if (tag === "h2") {
          const parts = extractTextAndMarks(el);
          doc.moveDown(0.4);
          renderFormattedParagraph(parts, { fontSize: 14, color: "#1e293b", isHeader: true, align: getTextAlign(el) });
          doc.moveDown(0.2);
        } else if (tag === "h3") {
          const parts = extractTextAndMarks(el);
          doc.moveDown(0.3);
          renderFormattedParagraph(parts, { fontSize: 12, color: "#334155", isHeader: true, align: getTextAlign(el) });
          doc.moveDown(0.2);
        } else if (tag === "hr") {
          doc.moveDown(0.5);
          doc.strokeColor("#e2e8f0").lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
          doc.moveDown(0.5);
        } else if (tag === "pre") {
          const codeText = $el.text();
          const lang = $el.attr("data-lang") || "";

          doc.moveDown(0.4);
          const startY = doc.y;
          const boxWidth = 495;
          const lines = codeText.split("\n");
          const blockHeight = Math.max(30, lines.length * 14 + 20);

          if (startY + blockHeight > doc.page.height - 50) {
            doc.addPage();
          }

          const currentY = doc.y;
          doc.roundedRect(50, currentY, boxWidth, blockHeight, 6)
            .fillAndStroke("#f8fafc", "#e2e8f0");

          if (lang) {
            doc.fillColor("#64748b")
              .fontSize(8)
              .font("Helvetica-Bold")
              .text(lang.toUpperCase(), 50 + boxWidth - 60, currentY + 6, { width: 50, align: "right" });
          }

          doc.fillColor("#0f172a")
            .fontSize(9.5)
            .font("Courier")
            .text(codeText, 60, currentY + 14, { width: boxWidth - 20, lineGap: 3 });

          doc.y = currentY + blockHeight + 10;
        } else if (tag === "ul") {
          $el.children("li").each((_, li) => {
            const parts = extractTextAndMarks(li);
            doc.fillColor("#4f46e5").fontSize(11).font("Helvetica").text("  •  ", { continued: true });
            renderFormattedParagraph(parts, { fontSize: 11, color: "#334155" });
          });
          doc.moveDown(0.2);
        } else if (tag === "ol") {
          const type = ($el.attr("type") || "").toUpperCase();
          const isRoman = type === "I" || $el.hasClass("roman-list") || /list-style-type\s*:\s*upper-roman/i.test($el.attr("style") || "");
          let counter = 1;

          $el.children("li").each((_, li) => {
            const parts = extractTextAndMarks(li);
            const prefix = isRoman ? `  ${toRoman(counter)}.  ` : `  ${counter}.  `;
            counter++;
            doc.fillColor("#4f46e5").fontSize(11).font("Helvetica-Bold").text(prefix, { continued: true });
            renderFormattedParagraph(parts, { fontSize: 11, color: "#334155" });
          });
          doc.moveDown(0.2);
        } else if (tag === "table") {
          const rows = [];
          $el.find("tr").each((_, tr) => {
            const rowData = [];
            $(tr).find("th, td").each((_, cell) => {
              rowData.push($(cell).text().trim());
            });
            if (rowData.length > 0) rows.push(rowData);
          });

          if (rows.length > 0) {
            doc.moveDown(0.5);
            const tableWidth = 495;
            const colCount = Math.max(...rows.map((r) => r.length));
            const colWidth = tableWidth / Math.max(1, colCount);
            const rowHeight = 22;

            rows.forEach((row, rIdx) => {
              if (doc.y + rowHeight > doc.page.height - 50) doc.addPage();
              const y = doc.y;

              row.forEach((cellText, cIdx) => {
                const x = 50 + cIdx * colWidth;

                doc.rect(x, y, colWidth, rowHeight)
                  .fillAndStroke(rIdx === 0 ? "#f1f5f9" : "#ffffff", "#cbd5e1");

                doc.fillColor(rIdx === 0 ? "#1e293b" : "#334155")
                  .fontSize(9)
                  .font(rIdx === 0 ? "Helvetica-Bold" : "Helvetica")
                  .text(cellText || "", x + 4, y + 6, {
                    width: colWidth - 8,
                    height: rowHeight - 6,
                    align: "center",
                    ellipsis: true,
                  });
              });

              doc.y = y + rowHeight;
            });
            doc.moveDown(0.5);
          }
        } else if (tag === "img" || $el.find("img").length > 0) {
          const imgEl = tag === "img" ? $el : $el.find("img").first();
          const src = imgEl.attr("src") || "";
          if (src.startsWith("data:image/")) {
            try {
              const base64Data = src.split(",")[1];
              if (base64Data) {
                const imgBuf = Buffer.from(base64Data, "base64");
                doc.moveDown(0.4);
                if (doc.y + 150 > doc.page.height - 50) doc.addPage();
                doc.image(imgBuf, { fit: [450, 260], align: "center" });
                doc.moveDown(0.4);
              }
            } catch (err) {
              console.error("Failed to render image in PDF:", err.message);
            }
          }
        } else {
          const imgChild = $el.find("img");
          if (imgChild.length > 0) {
            const src = imgChild.attr("src") || "";
            if (src.startsWith("data:image/")) {
              try {
                const base64Data = src.split(",")[1];
                if (base64Data) {
                  const imgBuf = Buffer.from(base64Data, "base64");
                  doc.moveDown(0.4);
                  if (doc.y + 150 > doc.page.height - 50) doc.addPage();
                  doc.image(imgBuf, { fit: [450, 260], align: "center" });
                  doc.moveDown(0.4);
                }
              } catch {
                // ignore bad images
              }
            }
          }
          const parts = extractTextAndMarks(el);
          renderFormattedParagraph(parts, { fontSize: 11, align: getTextAlign(el) });
        }
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateDocumentPdf,
  toRoman,
};