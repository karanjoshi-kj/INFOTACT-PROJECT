const mongoose = require("mongoose");

const textNodeSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      default: "text",
    },
    content: {
      type: String,
      default: "",
    },
    marks: {
      type: [String],
      default: [],
    },
  },
  { _id: false }
);

const blockSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
    },
    parentId: {
      type: String,
      default: null,
    },
    position: {
      type: Number,
     required: true,
     min: 0,
    },
    type: {
      type: String,
      required: true,
    },
    children: {
      type: [textNodeSchema],
      default: [],
    },
  },
  { _id: false }
);

const documentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      default: "document",
    },
    children: {
      type: [blockSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

function validateBlocks(blocks, parentId = null) {
  const ids = new Set();

  blocks.forEach((block, index) => {
    // Check if the block has an ID
    if (!block.id) {
      throw new Error(`Block at position ${index} must have an id`);
    }

    // Check for duplicate block IDs
    if (ids.has(block.id)) {
      throw new Error(`Duplicate block id: ${block.id}`);
    }

    ids.add(block.id);

    // Check if the position is correct
    if (block.position !== undefined && block.position !== index) {
      throw new Error(`Invalid position for block: ${block.id}`);
    }
    // Check if the parent ID is correct
    if (block.parentId !== parentId) {
      throw new Error(`Invalid parent ID for block: ${block.id}`);
    }

    // Recursively validate nested blocks
    if (block.children && block.children.length > 0) {
      const nestedBlocks = block.children.filter(
        (child) => child.id && child.type !== "text"
      );

      if (nestedBlocks.length > 0) {
        validateBlocks(nestedBlocks, block.id);
      }
    }
  });
}

documentSchema.pre("save", function (next) {
  validateBlocks(this.children);
  next();
});

const Document = mongoose.model("Document", documentSchema);

module.exports = Document;