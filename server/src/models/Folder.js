const mongoose = require("mongoose");

// A folder in the file explorer. Folders can be nested: `parent` points to
// another Folder (or is null when the folder sits at the top level).
const folderSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, default: "New Folder" },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Folder",
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Folder", folderSchema);