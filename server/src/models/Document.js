const mongoose = require("mongoose");

const textNodeSchema = new mongoose.Schema(
  {
    type: { type: String, default: "text" },
    content: { type: String, default: "" },
    marks: {
      type: [String], 
      default: [],
    },
  },
  { _id: false }
);

const blockSchema = new mongoose.Schema(
  {
    id: { type: String, required: true }, 
    type: { type: String, required: true, default: "paragraph" }, 
    children: {
      type: [textNodeSchema],
      default: [],
    },
  },
  { _id: false }
);

const documentSchema = new mongoose.Schema(
  {
    type: { type: String, default: "document" },
    title: { type: String, required: true, default: "Untitled document" },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    children: {
      type: [blockSchema],
      default: [{ id: "p1", type: "paragraph", children: [{ type: "text", content: "", marks: [] }] }],
    },
  },
  {
    timestamps: true,
  }
);

function validateBlocks(blocks, seenIds) {
  for (const block of blocks) {
    if (!block.id || block.id.trim() === "") {
      throw new Error("Every block must have a non-empty id");
    }
    if (seenIds.has(block.id)) {
      throw new Error(`Duplicate block id found: "${block.id}"`);
    }
    seenIds.add(block.id);

    if (Array.isArray(block.children) && block.children.length > 0) {
      const nestedBlocks = block.children.filter((c) => c.type && c.type !== "text");
      if (nestedBlocks.length > 0) {
        validateBlocks(nestedBlocks, seenIds);
      }
    }
  }
}

documentSchema.pre("save", async function () {
  validateBlocks(this.children, new Set());
});

module.exports = mongoose.model("Document", documentSchema);