const mongoose = require("mongoose");

// One document per person the host has approved for a room.
// It lets an approved collaborator come back to the same room code later
// (page refresh, closed editor, server restart) without asking the host again.
const roomApprovalSchema = new mongoose.Schema({
  roomCode: {
    type: String,
    required: true,
    trim: true,
  },
  // The collaborator's account id (the same id the editor uses in the room)
  userId: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    default: "",
  },
  // The collaborator's colour in this room. Saved with the approval, so the same account
  // gets the same colour every time it comes back to the room.
  color: {
    type: String,
    default: "",
  },
  approvedAt: {
    type: Date,
    default: Date.now,
  },
});

roomApprovalSchema.index({ roomCode: 1, userId: 1 }, { unique: true });

module.exports = mongoose.models.RoomApproval || mongoose.model("RoomApproval", roomApprovalSchema);