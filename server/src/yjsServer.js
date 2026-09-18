const http = require("http");
const { setupWSConnection } = require("y-websocket/bin/utils.js");

const server = http.createServer();

server.on("upgrade", (request, socket, head) => {
  setupWSConnection(socket, request);
});

server.listen(1234, () => {
  console.log("Yjs WebSocket server running on port 1234");
});