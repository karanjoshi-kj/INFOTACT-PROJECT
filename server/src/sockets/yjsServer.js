const http = require("http");
const WebSocket = require("ws");
const jwt = require("jsonwebtoken");
const { setupWSConnection } = require("y-websocket/bin/utils");

function startYjsServer(port) {
  const server = http.createServer();
  const wss = new WebSocket.Server({ server });

  wss.on("connection", (ws, req) => {
    // Require the same JWT the REST API uses - reject anonymous connections.
    const url = new URL(req.url, "http://localhost");
    const token = url.searchParams.get("token");
    try {
      jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      ws.close(4001, "Unauthorized");
      return;
    }
    setupWSConnection(ws, req);
  });

  server.listen(port, () => {
    console.log(`Yjs WebSocket server running on port ${port}`);
  });
}

module.exports = startYjsServer;