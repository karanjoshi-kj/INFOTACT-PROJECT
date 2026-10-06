const express = require("express");
const mongoose = require("mongoose");
const Document = require("../models/Document");
const CollabDocument = require("../models/CollabDocument");
const requireAuth = require("../middleware/auth");

const router = express.Router();

// Every collab route needs a logged-in user.
router.use(requireAuth);

function fail(res, err) {
  res.status(err.status || 500).json({ success: false, message: err.message });
}

// List the documents of the logged-in user that have a created / joined room ("Collab Files").
router.get("/", async (req, res) => {
  try {
    const entries = await CollabDocument.find({ userId: req.userId }).sort({ updatedAt: -1 }).lean();

    const docs = entries.length
      ? await Document.find({ _id: { $in: entries.map((e) => e.documentId) }, owner: req.userId })
          .select("title")
          .lean()
      : [];
    const titleById = new Map(docs.map((d) => [String(d._id), d.title]));

    // entries whose document was deleted are cleaned up here
    const orphanIds = entries.filter((e) => !titleById.has(String(e.documentId))).map((e) => e._id);
    if (orphanIds.length) await CollabDocument.deleteMany({ _id: { $in: orphanIds } });

    const collabDocuments = entries
      .filter((e) => titleById.has(String(e.documentId)))
      .map((e) => ({
        id: String(e.documentId),
        title: titleById.get(String(e.documentId)),
        room: e.roomCode,
        role: e.role,
      }));

    res.json({ success: true, collabDocuments });
  } catch (err) {
    fail(res, err);
  }
});

// Mark a document as collaborative (a room was created or joined for it).
router.put("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }

    const { roomCode, role } = req.body;
    if (typeof roomCode !== "string" || !/^[A-Z0-9]{4,12}$/.test(roomCode)) {
      return res.status(400).json({ success: false, message: "Invalid room code" });
    }
    if (role !== "host" && role !== "collab") {
      return res.status(400).json({ success: false, message: "Role must be host or collab" });
    }

    const doc = await Document.findOne({ _id: req.params.id, owner: req.userId }).select("_id").lean();
    if (!doc) return res.status(404).json({ success: false, message: "Document not found" });

    await CollabDocument.findOneAndUpdate(
      { userId: req.userId, documentId: doc._id },
      { $set: { roomCode, role } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true });
  } catch (err) {
    fail(res, err);
  }
});

// The document is no longer collaborative (for example you left the room).
router.delete("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }
    await CollabDocument.deleteMany({ userId: req.userId, documentId: req.params.id });
    res.json({ success: true });
  } catch (err) {
    fail(res, err);
  }
});

module.exports = router;