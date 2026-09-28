const express = require("express");
const mongoose = require("mongoose");
const Folder = require("../models/Folder");
const Document = require("../models/Document");
const requireAuth = require("../middleware/auth");

const router = express.Router();

// Every folder route needs a logged-in user, and only touches that user's folders.
router.use(requireAuth);

// ---------- helpers ----------

function checkId(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ success: false, message: "Folder not found" });
  }
  next();
}

function fail(res, err) {
  res.status(err.status || 500).json({ success: false, message: err.message });
}

// The ids of a folder AND every folder below it (children, grandchildren...).
function collectTree(rootId, allFolders) {
  const ids = new Set([String(rootId)]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of allFolders) {
      if (f.parent && ids.has(String(f.parent)) && !ids.has(String(f._id))) {
        ids.add(String(f._id));
        grew = true;
      }
    }
  }
  return ids;
}

// A parent value must be null (top level) or one of the user's own folders.
async function resolveParent(value, userId) {
  if (value === null || value === undefined || value === "") return null;
  if (!mongoose.isValidObjectId(value)) {
    const err = new Error("Parent folder not found");
    err.status = 400;
    throw err;
  }
  const parent = await Folder.findOne({ _id: value, owner: userId }).select("_id");
  if (!parent) {
    const err = new Error("Parent folder not found");
    err.status = 400;
    throw err;
  }
  return parent._id;
}

// ---------- routes ----------

// List all folders of the logged-in user
router.get("/", async (req, res) => {
  try {
    const folders = await Folder.find({ owner: req.userId })
      .select("name parent createdAt updatedAt")
      .lean();
    res.json({ success: true, folders });
  } catch (err) {
    fail(res, err);
  }
});

// Create a folder (optionally inside another folder)
router.post("/", async (req, res) => {
  try {
    const name = (req.body.name || "").trim() || "New Folder";
    const parent = await resolveParent(req.body.parent, req.userId);
    const folder = await Folder.create({ name, owner: req.userId, parent });
    res.status(201).json({ success: true, folder });
  } catch (err) {
    fail(res, err);
  }
});

// Rename and/or move a folder. A field that is not sent is left untouched.
router.put("/:id", checkId, async (req, res) => {
  try {
    const folder = await Folder.findOne({ _id: req.params.id, owner: req.userId });
    if (!folder) return res.status(404).json({ success: false, message: "Folder not found" });

    const { name, parent } = req.body;

    if (typeof name === "string" && name.trim()) folder.name = name.trim();

    if (parent !== undefined) {
      const newParent = await resolveParent(parent, req.userId);
      if (newParent) {
        // a folder can never be moved into itself or into one of its own sub-folders
        const all = await Folder.find({ owner: req.userId }).select("parent").lean();
        if (collectTree(folder._id, all).has(String(newParent))) {
          return res.status(400).json({ success: false, message: "A folder cannot be moved into itself" });
        }
      }
      folder.parent = newParent;
    }

    await folder.save();
    res.json({ success: true, folder });
  } catch (err) {
    fail(res, err);
  }
});

// Delete a folder together with everything inside it (sub-folders + documents)
router.delete("/:id", checkId, async (req, res) => {
  try {
    const folder = await Folder.findOne({ _id: req.params.id, owner: req.userId }).select("_id");
    if (!folder) return res.status(404).json({ success: false, message: "Folder not found" });

    const all = await Folder.find({ owner: req.userId }).select("parent").lean();
    const folderIds = [...collectTree(folder._id, all)];

    const docs = await Document.find({ owner: req.userId, folder: { $in: folderIds } }).select("_id").lean();
    const documentIds = docs.map((d) => String(d._id));

    await Document.deleteMany({ _id: { $in: documentIds } });
    await Folder.deleteMany({ _id: { $in: folderIds }, owner: req.userId });

    res.json({ success: true, deletedFolderIds: folderIds, deletedDocumentIds: documentIds });
  } catch (err) {
    fail(res, err);
  }
});

module.exports = router;