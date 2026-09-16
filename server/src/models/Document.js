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

const Document = mongoose.model("Document", documentSchema);

module.exports = Document;
documentSchema.pre("save", function (next) {
  this.children.forEach((block, index) => {
    if (!block.id) {
      throw new Error(`Block at position ${index} must have an id`);
    }

    if (block.id !== `p${index + 1}`) {
      throw new Error(`Invalid block id at position ${index}`);
    }
  });

  next();
});