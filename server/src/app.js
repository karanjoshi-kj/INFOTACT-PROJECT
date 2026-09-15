const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");

const User = require("./models/User");
const Document = require("./models/Document");

const app = express();

app.use(cors());
app.use(express.json());

// ---- Health check ----
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "SyncDoc backend is running",
  });
});

// ---- Auth: Signup ----
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({ name, email, password: hashedPassword });

    res.status(201).json({ success: true, message: "User created", userId: newUser._id });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---- Documents: Create ----
app.post("/api/documents", async (req, res) => {
  try {
    const { title, ownerId } = req.body;

    const newDoc = await Document.create({ title, owner: ownerId });

    res.status(201).json({ success: true, document: newDoc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = app;