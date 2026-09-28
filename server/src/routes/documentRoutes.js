const express = require("express");
const Document = require("../models/Document");
const textToAST = require("../textToAST");

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { title, ownerId, children } = req.body;
    const newDoc = await Document.create({ title, owner: ownerId, children });
    res.status(201).json({ success: true, document: newDoc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

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

// AST -> HTML for loading a saved document back into the editor
function astToHtml(blocks) {
  return blocks
    .map((block) => {
      const inner = block.children
        .map((node) => {
          // escape first, so saved text can never inject markup
          let t = node.content
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
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

// Save: editor html -> AST -> MongoDB
router.put("/:id", async (req, res) => {
  try {
    const { html, title } = req.body;
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "Document not found" });

    const tree = textToAST(htmlToMarkedText(html || ""));
    doc.children = tree.children.map((block, index) => ({
      ...block,
      position: index,
      parentId: null,
    }));
    if (title) doc.title = title;

    await doc.save(); // .save() so the pre-save validation hook runs
    res.json({ success: true, document: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Load: returns the document plus ready-to-use html
router.get("/:id", async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "Document not found" });
    res.json({ success: true, document: doc, html: astToHtml(doc.children) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;