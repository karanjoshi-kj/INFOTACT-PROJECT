const express = require("express");
const Document = require("../models/Document");

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

module.exports = router;