const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const documentRoutes = require("./routes/documentRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "SyncDoc backend is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/documents", documentRoutes);

module.exports = app;