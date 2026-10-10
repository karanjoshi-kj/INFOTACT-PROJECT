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

      // ---------------------------------------------------------------
      // Shared helpers for code boxes, spreadsheet cells and images
      // ---------------------------------------------------------------
      const PAGE_BOTTOM = () => doc.page.height - 50;

      // text-align written on an element itself (style or align attribute), or null
      function explicitAlign(el) {
        const style = $(el).attr("style") || "";
        const m = style.match(/text-align\s*:\s*(left|center|right|justify)/i);
        if (m) return m[1].toLowerCase();
        const a = ($(el).attr("align") || "").toLowerCase();
        return ["left", "center", "right", "justify"].includes(a) ? a : null;
      }

      function fontFor(marks, forceBold) {
        const bold = forceBold || marks.bold;
        const italic = marks.italic;
        if (marks.code) {
          if (bold && italic) return "Courier-BoldOblique";
          if (bold) return "Courier-Bold";
          if (italic) return "Courier-Oblique";
          return "Courier";
        }
        if (bold && italic) return "Helvetica-BoldOblique";
        if (bold) return "Helvetica-Bold";
        if (italic) return "Helvetica-Oblique";
        return "Helvetica";
      }

      // Text of a <pre> with its line breaks kept (<br> and block children become new lines)
      function preText(el) {
        let out = "";
        const walk = (node) => {
          if (node.type === "text") {
            out += node.data;
            return;
          }
          if (node.type !== "tag") return;
          const tag = node.name.toLowerCase();
          if (tag === "br") {
            out += "\n";
            return;
          }
          const block = tag === "div" || tag === "p";
          if (block && out && !out.endsWith("\n")) out += "\n";
          (node.children || []).forEach(walk);
          if (block && !out.endsWith("\n")) out += "\n";
        };
        (el.children || []).forEach(walk);
        return out.replace(/\u00a0/g, " ").replace(/\n$/, "");
      }

      // Draws a code snippet inside its bordered box. The language label sits in a header
      // strip at the top-right INSIDE the box (so it never overlaps the code). Long lines are
      // wrapped and long snippets continue in a new box on the next page (label repeated).
      function drawCodeBox(codeText, lang) {
        const boxX = 50;
        const boxW = 495;
        const padX = 12;
        const headerH = lang ? 26 : 12;
        const padBottom = 10;
        const fontSize = 9;
        const lineH = 13;

        doc.font("Courier").fontSize(fontSize);
        const charW = doc.widthOfString("M");
        const maxChars = Math.max(10, Math.floor((boxW - padX * 2) / charW));

        const visualLines = [];
        String(codeText)
          .replace(/\r\n?/g, "\n")
          .replace(/\t/g, "  ")
          .split("\n")
          .forEach((line) => {
            if (line.length === 0) {
              visualLines.push("");
              return;
            }
            for (let i = 0; i < line.length; i += maxChars) visualLines.push(line.slice(i, i + maxChars));
          });
        while (visualLines.length > 1 && visualLines[visualLines.length - 1] === "") visualLines.pop();

        doc.x = boxX;
        doc.moveDown(0.4);

        let idx = 0;
        while (idx < visualLines.length) {
          const remaining = visualLines.length - idx;
          const fit = Math.floor((PAGE_BOTTOM() - doc.y - headerH - padBottom) / lineH);
          if (fit < Math.min(3, remaining)) {
            doc.addPage();
            continue;
          }

          const chunk = visualLines.slice(idx, idx + fit);
          const boxH = headerH + chunk.length * lineH + padBottom;
          const y0 = doc.y;

          doc.save();
          doc.lineWidth(1).roundedRect(boxX, y0, boxW, boxH, 6).fillAndStroke("#f8fafc", "#cbd5e1");

          if (lang) {
            doc.font("Helvetica-Bold").fontSize(8);
            const labelW = doc.widthOfString(lang);
            const pillW = labelW + 14;
            const pillX = boxX + boxW - 10 - pillW;
            doc.lineWidth(0.75).roundedRect(pillX, y0 + 6, pillW, 14, 4).fillAndStroke("#ffffff", "#cbd5e1");
            doc.fillColor("#475569").text(lang, pillX + 7, y0 + 10, { lineBreak: false });
          }

          doc.fillColor("#0f172a").font("Courier").fontSize(fontSize);
          chunk.forEach((line, i) => {
            if (line) doc.text(line, boxX + padX, y0 + headerH + i * lineH, { lineBreak: false });
          });
          doc.restore();

          doc.x = boxX;
          doc.y = y0 + boxH + 10;
          idx += chunk.length;
          if (idx < visualLines.length) doc.addPage();
        }
        doc.x = boxX;
      }

      // Draws an inline image (data URL) keeping it on one page
      function drawImage(imgEl) {
        const src = imgEl.attr("src") || "";
        if (!src.startsWith("data:image/")) return;
        try {
          const base64Data = src.split(",")[1];
          if (!base64Data) return;
          const imgBuf = Buffer.from(base64Data, "base64");
          const img = doc.openImage(imgBuf);
          const scale = Math.min(450 / img.width, 260 / img.height);
          const h = img.height * scale;
          doc.x = 50;
          doc.moveDown(0.4);
          if (doc.y + h > PAGE_BOTTOM()) doc.addPage();
          doc.image(img, { fit: [450, 260], align: "center" });
          doc.moveDown(0.4);
        } catch (err) {
          console.error("Failed to render image in PDF:", err.message);
        }
      }

      // ---- spreadsheet / table cells ----
      const CELL_FS = 9;
      const CELL_GAP = 2;
      const CELL_IMG_MAX_H = 200;
      const CELL_BLOCKS = new Set([
        "div", "p", "li", "ul", "ol", "h1", "h2", "h3", "pre", "blockquote",
        "table", "thead", "tbody", "tr", "td", "th",
      ]);

      // A cell becomes a list of items (text blocks with their runs/alignment, or images)
      function readCell(cell) {
        const items = [];
        let runs = [];
        let align = explicitAlign(cell);

        const flush = () => {
          if (runs.some((r) => r.text.trim() !== "")) {
            runs[0].text = runs[0].text.replace(/^\n+/, "");
            runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\s+$/, "");
            items.push({ kind: "text", runs, align });
          }
          runs = [];
        };

        const walk = (node, marks) => {
          if (node.type === "text") {
            const t = (marks.pre ? node.data : node.data.replace(/\s+/g, " ")).replace(/\u00a0/g, " ");
            if (t) runs.push({ text: t, marks });
            return;
          }
          if (node.type !== "tag") return;
          const tag = node.name.toLowerCase();

          if (tag === "br") {
            runs.push({ text: "\n", marks });
            return;
          }

          if (tag === "img") {
            flush();
            const src = $(node).attr("src") || "";
            let img = null;
            if (src.startsWith("data:image/")) {
              try {
                const b64 = src.split(",")[1];
                if (b64) img = doc.openImage(Buffer.from(b64, "base64"));
              } catch {
                img = null;
              }
            }
            if (img) items.push({ kind: "image", img, align });
            else items.push({ kind: "text", runs: [{ text: "[image]", marks: { italic: true } }], align });
            return;
          }

          const next = { ...marks };
          if (tag === "b" || tag === "strong") next.bold = true;
          if (tag === "i" || tag === "em") next.italic = true;
          if (tag === "u") next.underline = true;
          if (tag === "s" || tag === "strike" || tag === "del") next.strike = true;
          if (tag === "code") next.code = true;
          if (tag === "pre") {
            next.code = true;
            next.pre = true;
          }

          if (CELL_BLOCKS.has(tag)) {
            flush();
            const previous = align;
            align = explicitAlign(node) || align;
            if (tag === "li") runs.push({ text: "\u2022 ", marks: next });
            (node.children || []).forEach((c) => walk(c, next));
            flush();
            align = previous;
          } else {
            (node.children || []).forEach((c) => walk(c, next));
          }
        };

        (cell.children || []).forEach((c) => walk(c, {}));
        flush();
        return items;
      }

      function measureItem(item, width, baseBold) {
        if (item.kind === "image") {
          const scale = Math.min(width / item.img.width, CELL_IMG_MAX_H / item.img.height, 1);
          return { w: item.img.width * scale, h: item.img.height * scale + 4 };
        }
        const text = item.runs.map((r) => r.text).join("");
        const anyCode = item.runs.some((r) => r.marks.code);
        const anyBold = baseBold || item.runs.some((r) => r.marks.bold);
        doc.font(anyCode ? "Courier" : anyBold ? "Helvetica-Bold" : "Helvetica").fontSize(CELL_FS);
        return { h: doc.heightOfString(text, { width, lineGap: CELL_GAP }) };
      }

      function drawItem(item, metric, x, y, width, baseBold, color, defaultAlign) {
        const align = item.align || defaultAlign;
        if (item.kind === "image") {
          const dx = align === "center" ? (width - metric.w) / 2 : align === "right" ? width - metric.w : 0;
          doc.image(item.img, x + dx, y, { width: metric.w, height: metric.h - 4 });
          return;
        }
        item.runs.forEach((r, i) => {
          doc.fillColor(color)
            .font(fontFor(r.marks, baseBold))
            .fontSize(CELL_FS)
            .text(r.text, i === 0 ? x : undefined, i === 0 ? y : undefined, {
              width,
              align,
              lineGap: CELL_GAP,
              continued: i < item.runs.length - 1,
              underline: !!r.marks.underline,
              strike: !!r.marks.strike,
            });
        });
      }

      // In a collaboration room the editor may keep a spreadsheet or code block INSIDE a
      // wrapper (a <div> / <p> that also holds the person's text). The renderer below only
      // looks at top-level blocks, so such a wrapper is opened up first: its tables and code
      // blocks become top-level blocks (drawn by the same code as in a solo document) and its
      // loose text becomes an ordinary paragraph.
      const CONTAINER_TAGS = new Set(["div", "p", "span", "blockquote"]);
      const OWN_BLOCK_TAGS = new Set(["div", "p", "ul", "ol", "h1", "h2", "h3", "hr", "blockquote"]);
      const holdsTableOrCode = (node) => $(node).find("table, pre").length > 0;

      function openContainer(container) {
        const blocks = [];
        let run = [];
        const style = $(container).attr("style");
        const align = $(container).attr("align");

        const flushRun = () => {
          const hasContent = run.some((n) =>
            n.type === "text" ? n.data.trim() !== "" : n.type === "tag" && n.name.toLowerCase() !== "br"
          );
          if (hasContent) {
            const wrapper = $("<div></div>");
            if (style) wrapper.attr("style", style);
            if (align) wrapper.attr("align", align);
            wrapper.append(run);
            blocks.push(wrapper[0]);
          }
          run = [];
        };

        $(container).contents().toArray().forEach((child) => {
          const name = child.type === "tag" ? child.name.toLowerCase() : "";
          if (name === "table" || name === "pre") {
            flushRun();
            blocks.push(child);
          } else if (CONTAINER_TAGS.has(name) && holdsTableOrCode(child)) {
            flushRun();
            blocks.push(...openContainer(child));
          } else if (OWN_BLOCK_TAGS.has(name)) {
            flushRun();
            blocks.push(child);
          } else {
            run.push(child);
          }
        });
        flushRun();
        return blocks;
      }

      const rootBlocks = $.root()
        .children()
        .toArray()
        .flatMap((el) => {
          const name = el.name ? el.name.toLowerCase() : "";
          return CONTAINER_TAGS.has(name) && holdsTableOrCode(el) ? openContainer(el) : [el];
        });
      const rootNodes = $(rootBlocks);

      rootNodes.each((_, el) => {
        const tag = el.name ? el.name.toLowerCase() : "";
        const $el = $(el);
        doc.x = 50;

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
          drawCodeBox(preText(el), $el.attr("data-lang") || "");
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
          const isSheet = $el.hasClass("sheet");
          const rows = [];
          $el.find("tr").each((_, tr) => {
            const cells = [];
            $(tr).children("th, td").each((_, cell) => {
              cells.push({ isTh: cell.name.toLowerCase() === "th", items: readCell(cell) });
            });
            if (cells.length > 0) rows.push(cells);
          });

          if (rows.length > 0) {
            doc.moveDown(0.5);
            const tableX = 50;
            const tableWidth = 495;
            const colCount = Math.max(...rows.map((r) => r.length));
            const narrowFirst = isSheet && colCount > 1;
            const firstW = narrowFirst ? 30 : tableWidth / colCount;
            const otherW = narrowFirst ? (tableWidth - firstW) / (colCount - 1) : tableWidth / colCount;
            const colW = (i) => (i === 0 ? firstW : otherW);
            const colX = (i) => tableX + (i === 0 ? 0 : firstW + (i - 1) * otherW);

            rows.forEach((row, rIdx) => {
              let rowH = 22;
              const layout = row.map((cell, cIdx) => {
                const pad = colW(cIdx) < 40 ? 2 : 5;
                const innerW = colW(cIdx) - pad * 2;
                const baseBold = cell.isTh || (!isSheet && rIdx === 0);
                const metrics = cell.items.map((it) => measureItem(it, innerW, baseBold));
                const contentH = metrics.reduce((sum, m) => sum + m.h, 0);
                rowH = Math.max(rowH, contentH + 12);
                return { pad, innerW, baseBold, metrics };
              });

              if (doc.y + rowH > PAGE_BOTTOM()) doc.addPage();
              const y = doc.y;

              for (let cIdx = 0; cIdx < colCount; cIdx++) {
                const cell = row[cIdx];
                const x = colX(cIdx);
                const header = cell ? cell.isTh || (!isSheet && rIdx === 0) : false;

                doc.lineWidth(1).rect(x, y, colW(cIdx), rowH).fillAndStroke(header ? "#f1f5f9" : "#ffffff", "#cbd5e1");
                if (!cell) continue;

                const { pad, innerW, baseBold, metrics } = layout[cIdx];
                let cy = y + 6;
                cell.items.forEach((item, k) => {
                  drawItem(item, metrics[k], x + pad, cy, innerW, baseBold, header ? "#1e293b" : "#334155", cell.isTh ? "center" : "left");
                  cy += metrics[k].h;
                });
              }

              doc.x = 50;
              doc.y = y + rowH;
            });
            doc.x = 50;
            doc.moveDown(0.5);
          }
        } else {
          const imgs = tag === "img" ? $el : $el.find("img");
          if (imgs.length > 0) {
            imgs.each((_, im) => drawImage($(im)));
            if (tag !== "img") {
              const parts = extractTextAndMarks(el);
              if (parts.some((p) => p.text.trim() !== "")) {
                renderFormattedParagraph(parts, { fontSize: 11, align: getTextAlign(el) });
              }
            }
          } else {
            const parts = extractTextAndMarks(el);
            renderFormattedParagraph(parts, { fontSize: 11, align: getTextAlign(el) });
          }
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