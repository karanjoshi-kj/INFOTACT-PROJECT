const express = require("express");
const mongoose = require("mongoose");
const Document = require("../models/Document");
const Folder = require("../models/Folder");
const textToAST = require("../textToAST");
const requireAuth = require("../middleware/auth");
const DOMPurify = require("isomorphic-dompurify");
const exportASTToPDF = require("../astToPdf");

const router = express.Router();

// Every document route needs a logged-in user.
router.use(requireAuth);

// ---------- helpers ----------

// The editor only ever produces these tags. Anything else is removed, and ALL
// attributes (onclick, style, href...) are dropped, so saved html can never carry a script.
const ALLOWED_TAGS = new Set(["b", "strong", "i", "em", "u", "h1", "h2", "ul", "ol", "li", "div", "p", "br", "span"]);
function sanitizeHtml(html) {
  if (!html) return "";
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "b", "strong", "i", "em", "u", "s", "h1", "h2", "h3",
      "p", "div", "span", "ul", "ol", "li", "br", "table",
      "thead", "tbody", "tr", "th", "td", "pre", "code", "img"
    ],
    ALLOWED_ATTR: ["class", "contenteditable", "data-block-id", "src", "alt", "data-lang"]
  });
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
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "Document not found" });

    const html = doc.html !== null && doc.html !== undefined ? doc.html : astToHtml(doc.children);
    res.json({ success: true, document: doc, html });
  } catch (err) {
    fail(res, err);
  }
});

// Save: html, title and/or folder. A field that is NOT sent is left untouched
// (so renaming or moving a document can never wipe its content).
router.put("/:id", checkId, async (req, res) => {
  try {
    const { html, title, folder } = req.body;
    const doc = await Document.findById(req.params.id);
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
      document: { _id: doc._id, title: doc.title, folder: doc.folder, updatedAt: doc.updatedAt },
    });
  } catch (err) {
    fail(res, err);
  }
});

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
// Export document AST as PDF
router.get("/:id/export/pdf", checkId, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }

    // Clean filename
    const safeTitle = (doc.title || "document").replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `${safeTitle}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    exportASTToPDF(doc, res);
  } catch (err) {
    console.error("PDF export error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
module.exports.sanitizeHtml = sanitizeHtml;