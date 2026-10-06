const mongoose = require("mongoose");

// One document = "this person missed a change in this room while they were offline".
// It is created by the live-sync server when someone edits while the person is not connected,
// and removed again once the person has received the latest content.
const offlineChangeSchema = new mongoose.Schema({
  roomCode: {
    type: String,
    required: true,
    trim: true,
  },
  // The account that missed the change
  userId: {
    type: String,
    required: true,
  },
  changedAt: {
    type: Date,
    default: Date.now,
  },
  // Who made the change (for information)
  changedById: {
    type: String,
    default: "",
  },
  changedByName: {
    type: String,
    default: "",
  },
});

offlineChangeSchema.index({ roomCode: 1, userId: 1 }, { unique: true });

module.exports = mongoose.models.OfflineChange || mongoose.model("OfflineChange", offlineChangeSchema);