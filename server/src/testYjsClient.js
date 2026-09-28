const WebSocket = require("ws");
const Y = require("yjs");
const { WebsocketProvider } = require("y-websocket");

global.WebSocket = WebSocket;

const clientName = process.argv[2] || "Client";

const ydoc = new Y.Doc();

const provider = new WebsocketProvider(
  "ws://localhost:1234",
  "shared-doc",
  ydoc
);

const ytext = ydoc.getText("content");

provider.on("status", (event) => {
  console.log(`[${clientName}] Connection status:`, event.status);
});

provider.on("sync", (isSynced) => {
  if (isSynced) {
    console.log(`[${clientName}] Connected and synced`);
  }
});

ytext.observe(() => {
  console.log(
    `[${clientName}] Document content:`,
    ytext.toString()
  );
});

setTimeout(() => {
  ytext.insert(
    ytext.length,
    `Hello from ${clientName}! `
  );
}, 3000);