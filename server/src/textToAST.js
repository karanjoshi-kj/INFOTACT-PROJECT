function textToAST(typedText) {
  const documentTree = {
    type: "document",
    children: []
  };

  const paragraphs = typedText.split("\n");

  paragraphs.forEach((paragraphText) => {
    const paragraphNode = {
      type: "paragraph",
      children: []
    };

    const textPattern = /(\*\*.*?\*\*|\*.*?\*|__.*?__|[^*_]+)/g;
    const textParts = paragraphText.match(textPattern) || [];

    textParts.forEach((part) => {
      let textNode = {
        type: "text",
        content: part,
        marks: []
      };

      if (part.startsWith("**") && part.endsWith("**")) {
        textNode.content = part.slice(2, -2);
        textNode.marks.push("bold");
      } else if (part.startsWith("*") && part.endsWith("*")) {
        textNode.content = part.slice(1, -1);
        textNode.marks.push("italic");
      } else if (part.startsWith("__") && part.endsWith("__")) {
        textNode.content = part.slice(2, -2);
        textNode.marks.push("underline");
      }

      paragraphNode.children.push(textNode);
    });

    documentTree.children.push(paragraphNode);
  });

  return documentTree;
}
module.exports = textToAST;
