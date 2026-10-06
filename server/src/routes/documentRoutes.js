const express = require("express");
const mongoose = require("mongoose");
const cheerio = require("cheerio");
const Document = require("../models/Document");
const Folder = require("../models/Folder");
const textToAST = require("../textToAST");
const requireAuth = require("../middleware/auth");
const { generateDocumentPdf } = require("../utils/pdfExport");

const router = express.Router();

// Every document route needs a logged-in user.
router.use(requireAuth);

// ---------- helpers ----------

// Allowed tags produced by the editor
const ALLOWED_TAGS = new Set([
  "b", "strong", "i", "em", "u", "s", "strike", "del",
  "h1", "h2", "h3", "ul", "ol", "li", "div", "p", "br", "span", "hr",
  "table", "thead", "tbody", "tr", "th", "td",
  "pre", "code", "img", "a"
]);

function sanitizeHtml(rawHtml) {
  if (!rawHtml || typeof rawHtml !== "string") return "";
  const $ = cheerio.load(rawHtml, null, false);

  $("*").each((_, el) => {
    const tag = el.name ? el.name.toLowerCase() : "";
    if (!ALLOWED_TAGS.has(tag)) {
      $(el).remove();
      return;
    }

    const attrs = el.attribs || {};
    const safeAttrs = {};

    // List numbering type (e.g. Roman numerals 'I', 'i', or '1', 'a', 'A')
    if (attrs.type && tag === "ol") {
      const t = attrs.type.trim();
      if (/^[1aAiI]$/.test(t)) safeAttrs.type = t;
    }

    // Classes used by the editor
    if (attrs.class) {
      const classes = attrs.class.split(/\s+/).filter((c) =>
        ["roman-list", "code-block", "sheet", "doc-table"].includes(c)
      );
      if (classes.length > 0) safeAttrs.class = classes.join(" ");
    }

    // Safe inline styles: text alignment, list styles, and authorship colors
    if (attrs.style) {
      const styleProps = [];
      const declarations = attrs.style.split(";");
      for (const decl of declarations) {
        const [prop, val] = decl.split(":").map((s) => s && s.trim());
        if (!prop || !val) continue;
        const p = prop.toLowerCase();
        if (p === "text-align" && ["left", "center", "right", "justify"].includes(val.toLowerCase())) {
          styleProps.push(`text-align: ${val.toLowerCase()}`);
        } else if (p === "list-style-type" && ["upper-roman", "lower-roman", "decimal", "disc", "circle", "square"].includes(val.toLowerCase())) {
          styleProps.push(`list-style-type: ${val.toLowerCase()}`);
        } else if (p === "--author-color" && /^#[0-9a-fA-F]{3,8}$/.test(val)) {
          styleProps.push(`--author-color: ${val}`);
        }
      }
      if (styleProps.length > 0) safeAttrs.style = styleProps.join("; ");
    }

    if (attrs.align && ["left", "center", "right", "justify"].includes(attrs.align.toLowerCase())) {
      safeAttrs.align = attrs.align.toLowerCase();
    }

    if (tag === "img" && attrs.src) {
      if (attrs.src.startsWith("data:image/") || /^https?:\/\//i.test(attrs.src)) {
        safeAttrs.src = attrs.src;
        if (attrs.alt) safeAttrs.alt = attrs.alt.slice(0, 200);
      }
    }

    if (tag === "a" && attrs.href) {
      if (/^https?:\/\//i.test(attrs.href) || /^mailto:/i.test(attrs.href)) {
        safeAttrs.href = attrs.href;
      }
    }

    if (attrs["data-lang"] && tag === "pre") {
      safeAttrs["data-lang"] = attrs["data-lang"].slice(0, 30);
    }

    if (attrs["data-formula"] && tag === "td") {
      safeAttrs["data-formula"] = attrs["data-formula"].slice(0, 500);
    }

    if (attrs["data-author"]) {
      safeAttrs["data-author"] = String(attrs["data-author"]).slice(0, 100);
    }
    if (attrs["data-author-name"]) {
      safeAttrs["data-author-name"] = String(attrs["data-author-name"]).slice(0, 100);
    }
    if (attrs.title) {
      safeAttrs.title = String(attrs.title).slice(0, 100);
    }

    el.attribs = safeAttrs;
  });

  return $.html();
}

// Editor HTML -> the **bold** / *italic* / __underline__ text that textToAST expects
function htmlToMarkedText(html) {
  return html
    .replace(/<(b|strong)>(.*?)<\/\1>/gi, "**$2**")
    .replace(/<(i|em)>(.*?)<\/\1>/gi, "*$2*")
    .replace(/<u>(.*?)<\/u>/gi, "__$1__")
    .replace(/<\/(div|p|h1|h2|li)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\n+$/, "");
}

// AST -> HTML. Only used for OLD documents that were saved before `html` existed.
function astToHtml(blocks) {
  return blocks
    .map((block) => {
      const inner = block.children
        .map((node) => {
          let t = node.content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          if (node.marks.includes("bold")) t = `<b>${t}</b>`;
          if (node.marks.includes("italic")) t = `<i>${t}</i>`;
          if (node.marks.includes("underline")) t = `<u>${t}</u>`;
          return t;
        })
        .join("");
      return `<div>${inner}</div>`;
    })
    .join("");
}

// Reject ids that are not valid Mongo ids (avoids a 500 "CastError")
function checkId(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ success: false, message: "Document not found" });
  }
  next();
}

// A folder value coming from the client must be null (top level) or the id of
// a folder that belongs to the logged-in user. Returns the id (or null).
async function resolveFolder(value, userId) {
  if (value === null || value === undefined || value === "") return null;
  if (!mongoose.isValidObjectId(value)) {
    const err = new Error("Folder not found");
    err.status = 400;
    throw err;
  }
  const folder = await Folder.findOne({ _id: value, owner: userId }).select("_id");
  if (!folder) {
    const err = new Error("Folder not found");
    err.status = 400;
    throw err;
  }
  return folder._id;
}

function fail(res, err) {
  res.status(err.status || 500).json({ success: false, message: err.message });
}

// ---------- routes ----------

// List every document owned by the logged-in user (for the file explorer).
// Only light fields are returned - never the html - so the list stays fast.
router.get("/", async (req, res) => {
  try {
    const documents = await Document.find({ owner: req.userId })
      .select("title folder createdAt updatedAt")
      .sort({ updatedAt: -1 })
      .lean();
    res.json({ success: true, documents });
  } catch (err) {
    fail(res, err);
  }
});

// Create a new empty document owned by the logged-in user (optionally inside a folder)
router.post("/", async (req, res) => {
  try {
    const title = (req.body.title || "").trim() || "Untitled Document";
    const folder = await resolveFolder(req.body.folder, req.userId);
    const doc = await Document.create({ title, owner: req.userId, html: "", folder });
    res.status(201).json({ success: true, document: doc });
  } catch (err) {
    fail(res, err);
  }
});

// Load: the document + ready-to-use html for the editor
router.get("/:id", checkId, async (req, res) => {
  try {
    const doc = await Document.findOne({
     _id: req.params.id,
     owner: req.userId,
    });
    if (!doc) return res.status(404).json({ success: false, message: "Document not found" });

    const html = doc.html !== null && doc.html !== undefined ? doc.html : astToHtml(doc.children);
    res.json({
      success: true,
      document: doc,
      html,
      toolState: doc.toolState || null,
      lastExportedAt: doc.lastExportedAt || null,
    });
  } catch (err) {
    fail(res, err);
  }
});

// Save: html, title, folder and/or toolState. A field that is NOT sent is left untouched
// (so renaming or moving a document can never wipe its content).
router.put("/:id", checkId, async (req, res) => {
  try {
    const { html, title, folder, toolState } = req.body;
    const doc = await Document.findOne({
      _id: req.params.id,
      owner: req.userId,
    });
    if (!doc) return res.status(404).json({ success: false, message: "Document not found" });

    if (typeof html === "string") {
      const clean = sanitizeHtml(html);
      doc.html = clean;

      // keep the structured tree (Document -> Paragraph -> Text) in sync too
      const tree = textToAST(htmlToMarkedText(clean));
      doc.children = tree.children.map((block, index) => ({
        ...block,
        position: index,
        parentId: null,
      }));
    }

    if (typeof title === "string" && title.trim()) doc.title = title.trim();

    if (toolState && typeof toolState === "object") {
      doc.toolState = { ...(doc.toolState || {}), ...toolState };
      doc.markModified("toolState");
    }

    // Moving a document between folders: only its owner may do that
    if (folder !== undefined) {
      if (String(doc.owner) !== String(req.userId)) {
        return res.status(403).json({ success: false, message: "Only the owner can move this document" });
      }
      doc.folder = await resolveFolder(folder, req.userId);
    }

    await doc.save(); // .save() so the pre-save validation hook runs
    res.json({
      success: true,
      savedAt: doc.updatedAt,
      document: {
        _id: doc._id,
        title: doc.title,
        folder: doc.folder,
        updatedAt: doc.updatedAt,
        toolState: doc.toolState,
        lastExportedAt: doc.lastExportedAt,
      },
    });
  } catch (err) {
    fail(res, err);
  }
});

// Real PDF Export (GET or POST):
// Persists the export timestamp & counter in MongoDB and streams the generated PDF back.
// POST optionally accepts the latest { html, title } to ensure the newest document state is saved before export.
async function handleExportPdf(req, res) {
  try {
    const doc = await Document.findOne({
      _id: req.params.id,
      owner: req.userId,
    });
    if (!doc) return res.status(404).json({ success: false, message: "Document not found" });

    // If client supplied unsaved title or html in POST, save it first
    if (req.method === "POST" && req.body) {
      const { html, title, toolState } = req.body;
      if (typeof html === "string") {
        const clean = sanitizeHtml(html);
        doc.html = clean;
        const tree = textToAST(htmlToMarkedText(clean));
        doc.children = tree.children.map((block, index) => ({
          ...block,
          position: index,
          parentId: null,
        }));
      }
      if (typeof title === "string" && title.trim()) {
        doc.title = title.trim();
      }
      if (toolState && typeof toolState === "object") {
        doc.toolState = { ...(doc.toolState || {}), ...toolState };
        doc.markModified("toolState");
      }
    }

    // Update document export tracking state in MongoDB
    doc.lastExportedAt = new Date();
    doc.exportCount = (doc.exportCount || 0) + 1;
    await doc.save();

    const contentHtml = doc.html !== null && doc.html !== undefined ? doc.html : astToHtml(doc.children);
    const pdfBuffer = await generateDocumentPdf({
      title: doc.title,
      html: contentHtml,
    });

    const safeFilename = encodeURIComponent((doc.title || "document").replace(/[/\\?%*:|"<>]/g, "_"));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}.pdf"; filename*=UTF-8''${safeFilename}.pdf`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader("X-SyncDoc-Exported-At", doc.lastExportedAt.toISOString());
    res.setHeader("X-SyncDoc-Export-Count", String(doc.exportCount));
    res.send(pdfBuffer);
  } catch (err) {
    fail(res, err);
  }
}

router.get("/:id/export/pdf", checkId, handleExportPdf);
router.post("/:id/export/pdf", checkId, handleExportPdf);

// Delete a document (owner only)
router.delete("/:id", checkId, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id).select("owner");
    if (!doc) return res.status(404).json({ success: false, message: "Document not found" });
    if (String(doc.owner) !== String(req.userId)) {
      return res.status(403).json({ success: false, message: "Only the owner can delete this document" });
    }
    await Document.deleteOne({ _id: doc._id });
    res.json({ success: true, deletedId: String(doc._id) });
  } catch (err) {
    fail(res, err);
  }
});

module.exports = router;
module.exports.sanitizeHtml = sanitizeHtml;