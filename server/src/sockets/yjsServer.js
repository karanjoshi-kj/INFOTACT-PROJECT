const http = require("http");
const WebSocket = require("ws");
const { setupWSConnection } = require("y-websocket/bin/utils");

function startYjsServer(port) {
  const server = http.createServer();
  const wss = new WebSocket.Server({ server });

  wss.on("connection", (ws, req) => {
    setupWSConnection(ws, req);
  });

  server.listen(port, () => {
    console.log(`Yjs WebSocket server running on port ${port}`);
  });
}

module.exports = startYjsServer;