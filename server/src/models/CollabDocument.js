const mongoose = require("mongoose");

// One document per (user, document) that has a room the user created or joined.
// A document that has no entry here is a normal single-user document and is NOT a "Collab File".
const collabDocumentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: true,
    },
    // The room that was created / joined for this document
    roomCode: {
      type: String,
      required: true,
      trim: true,
    },
    // "host" = you created the room, "collab" = you joined someone else's room
    role: {
      type: String,
      enum: ["host", "collab"],
      default: "host",
    },
  },
  { timestamps: true }
);

collabDocumentSchema.index({ userId: 1, documentId: 1 }, { unique: true });

module.exports = mongoose.models.CollabDocument || mongoose.model("CollabDocument", collabDocumentSchema);