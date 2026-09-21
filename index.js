
const express = require("express");

const app = express();

const PORT = 5000;

app.get("/", (req, res) => {
  res.send("SyncDoc Backend Server is Running!");
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});