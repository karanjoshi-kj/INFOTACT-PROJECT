const express = require("express");
const mongoose = require("mongoose");
const Document = require("../models/Document");
const textToAST = require("../textToAST");
const requireAuth = require("../middleware/auth");

const router = express.Router();

// Every document route needs a logged-in user.
router.use(requireAuth);

// ---------- helpers ----------

// The editor only ever produces these tags. Anything else is removed, and ALL
// attributes (onclick, style, href...) are dropped, so saved html can never carry a script.
const ALLOWED_TAGS = new Set(["b", "strong", "i", "em", "u", "h1", "h2", "ul", "ol", "li", "div", "p", "br", "span"]);

function sanitizeHtml(html) {
  return String(html).replace(/<[^<>]*>|[<>]/g, (token) => {
    const m = token.match(/^<(\/?)([a-zA-Z][a-zA-Z0-9]*)[^<>]*>$/);
    if (m && ALLOWED_TAGS.has(m[2].toLowerCase())) {
      return `<${m[1]}${m[2].toLowerCase()}>`;
    }
    if (token === "<") return "&lt;";
    if (token === ">") return "&gt;";
    return ""; // a disallowed tag
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

// ---------- routes ----------

// Create a new empty document owned by the logged-in user
router.post("/", async (req, res) => {
  try {
    const title = (req.body.title || "").trim() || "Untitled Document";
    const doc = await Document.create({ title, owner: req.userId, html: "" });
    res.status(201).json({ success: true, document: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
  }
});

// Save: html and/or title. A field that is NOT sent is left untouched
// (so renaming the document can never wipe its content).
router.put("/:id", checkId, async (req, res) => {
  try {
    const { html, title } = req.body;
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

    await doc.save(); // .save() so the pre-save validation hook runs
    res.json({ success: true, savedAt: doc.updatedAt });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
module.exports.sanitizeHtml = sanitizeHtml;