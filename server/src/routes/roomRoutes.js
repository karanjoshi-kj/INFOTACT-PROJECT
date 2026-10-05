const express = require("express");
const Room = require("../models/Room");

const router = express.Router();

// Create a new room
router.post("/", async (req, res) => {
  try {
    const { roomCode, hostId, documentId } = req.body;

    if (!roomCode || !hostId || !documentId) {
      return res.status(400).json({
        success: false,
        message: "roomCode, hostId and documentId are required",
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
    const { roomCode, userId } = req.body;

    if (!roomCode || !userId) {
      return res.status(400).json({
        success: false,
        message: "roomCode and userId are required",
      });
    }

    const room = await Room.findOne({ roomCode });

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    const alreadyMember = room.members.some(
      (member) => member.userId.toString() === userId
    );

    if (alreadyMember) {
      return res.status(409).json({
        success: false,
        message: "User is already a member of this room",
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

// Approve or keep a member pending
router.patch("/:roomCode/members/:userId", async (req, res) => {
  try {
    const { roomCode, userId } = req.params;
    const { status } = req.body;

    if (!["approved", "pending"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be approved or pending",
      });
    }

    const room = await Room.findOne({ roomCode });

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
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
    const { roomCode, userId } = req.params;

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