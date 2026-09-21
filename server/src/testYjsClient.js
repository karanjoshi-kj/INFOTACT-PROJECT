const WebSocket = require("ws");
const Y = require("yjs");
const { WebsocketProvider } = require("y-websocket");
global.WebSocket = WebSocket;

const clientName = process.argv[2] || "Client";
const ydoc = new Y.Doc();
const provider = new WebsocketProvider("ws://localhost:1234", "test-document", ydoc);

const ytext = ydoc.getText("shared-text");

provider.on("status", (event) => {
  console.log(`[${clientName}] Connection status:`, event.status);
});

ytext.observe(() => {
  console.log(`[${clientName}] Document content is now:`, ytext.toString());
});

setTimeout(() => {
  ytext.insert(ytext.length, `Hello from ${clientName}! `);
}, 3000);