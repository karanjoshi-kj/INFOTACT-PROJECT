const express = require("express");
const Room = require("../models/Room");
const Document = require("../models/Document");
const User = require("../models/User");
const startYjsServer = require("../sockets/yjsServer");
const requireAuth = require("../middleware/auth");

const router = express.Router();

// Every room route requires a logged-in user
router.use(requireAuth);

// Create a new room
router.post("/", async (req, res) => {
  try {
    const { roomCode, documentId } = req.body;

    // The host is always the authenticated user.
    // Never trust hostId from the client.
    const hostId = req.userId;

    if (!roomCode || !documentId) {
      return res.status(400).json({
        success: false,
        message: "roomCode and documentId are required",
      });
    }

    // Make sure the document belongs to the logged-in user.
    const document = await Document.findOne({
      _id: documentId,
      owner: req.userId,
    });

    if (!document) {
      return res.status(403).json({
        success: false,
        message: "You can only create a room for your own document",
      });
    }

    const existingRoom = await Room.findOne({ roomCode });

    if (existingRoom) {
      return res.status(409).json({
        success: false,
        message: "Room code already exists",
      });
    }

    const room = await Room.create({
      roomCode,
      hostId,
      documentId,
      members: [
        {
          userId: hostId,
          status: "approved",
        },
      ],
    });

    res.status(201).json({
      success: true,
      message: "Room created successfully",
      room,
    });
  } catch (error) {
    console.error("Create room error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create room",
    });
  }
});

// Join an existing room
router.post("/join", async (req, res) => {
  try {
    const { roomCode } = req.body;

    // The joining user is always the authenticated user.
    // Never trust userId from the client.
    const userId = req.userId;

    if (!roomCode) {
      return res.status(400).json({
        success: false,
        message: "roomCode is required",
      });
    }

    const room = await Room.findOne({ roomCode });

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    const existingMember = room.members.find(
      (member) => String(member.userId) === userId
    );

    if (existingMember) {
      return res.status(200).json({
        success: true,
        message: "User already has a room membership",
        status: existingMember.status,
      });
    }

    room.members.push({
      userId,
      status: "pending",
    });

    await room.save();

    res.status(200).json({
      success: true,
      message: "Join request sent successfully",
      room,
    });
  } catch (error) {
    console.error("Join room error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to join room",
    });
  }
});

// Pending requests are read from MongoDB because rejected WebSocket clients
// cannot publish Yjs awareness to the host.
router.get("/:roomCode/requests", async (req, res) => {
  try {
    const room = await Room.findOne({ roomCode: req.params.roomCode });

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    if (String(room.hostId) !== String(req.userId)) {
      return res.status(403).json({
        success: false,
        message: "Only the room host can view join requests",
      });
    }

    const pendingMembers = room.members.filter((member) => member.status === "pending");
    const users = await User.find({
      _id: { $in: pendingMembers.map((member) => member.userId) },
    })
      .select("name")
      .lean();
    const nameById = new Map(users.map((user) => [String(user._id), user.name]));

    res.json({
      success: true,
      requests: pendingMembers.map((member) => ({
        id: String(member.userId),
        name: nameById.get(String(member.userId)) || "Collaborator",
      })),
    });
  } catch (error) {
    console.error("List room join requests error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load room join requests",
    });
  }
});

// Approve or keep a member pending
router.patch("/:roomCode/members/:userId", async (req, res) => {
  try {
    const { roomCode, userId } = req.params;
    const { status } = req.body;

    if (!["approved", "pending", "denied"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be approved, pending, or denied",
      });
    }

    const room = await Room.findOne({ roomCode });

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    // Only the room host can manage member status.
    if (String(room.hostId) !== String(req.userId)) {
      return res.status(403).json({
        success: false,
        message: "Only the room host can manage members",
      });
    }

    const member = room.members.find(
      (member) => member.userId.toString() === userId
    );

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Member not found in this room",
      });
    }

    member.status = status;

    await room.save();

    if (status === "denied") {
      startYjsServer.revokeRoomMember(roomCode, userId);
    }

    res.status(200).json({
      success: true,
      message: "Member status updated successfully",
      room,
    });
  } catch (error) {
    console.error("Update member status error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update member status",
    });
  }
});

// Leave a room
router.delete("/:roomCode/members/:userId", async (req, res) => {
  try {
    const { roomCode } = req.params;

    // A user can only remove themselves.
    // Never trust userId from the URL.
    const userId = req.userId;

    const room = await Room.findOne({ roomCode });

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    const memberExists = room.members.some(
      (member) => member.userId.toString() === userId
    );

    if (!memberExists) {
      return res.status(404).json({
        success: false,
        message: "User is not a member of this room",
      });
    }

    room.members = room.members.filter(
      (member) => member.userId.toString() !== userId
    );

    await room.save();

    res.status(200).json({
      success: true,
      message: "User left the room successfully",
      room,
    });
  } catch (error) {
    console.error("Leave room error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to leave room",
    });
  }
});

module.exports = router;
