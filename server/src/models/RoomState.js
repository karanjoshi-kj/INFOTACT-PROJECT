const mongoose = require("mongoose");

// The latest shared content of a live room, kept by the server.
// It lets a room come back exactly as it was after a server restart, so a collaborator who
// was offline always receives the newest text (and an old saved copy never replaces it).
const roomStateSchema = new mongoose.Schema(
  {
    roomCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    // The editor html of the room
    html: {
      type: String,
      default: "",
    },
    // Account id of the room's host (the first person who joined the room as host)
    hostId: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.models.RoomState || mongoose.model("RoomState", roomStateSchema);