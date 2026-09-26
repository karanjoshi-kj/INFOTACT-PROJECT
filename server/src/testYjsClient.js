const WebSocket = require("ws");
const Y = require("yjs");
const { WebsocketProvider } = require("y-websocket");

global.WebSocket = WebSocket;

const CLIENT_COUNT = 10;
const SERVER_URL = "ws://localhost:1234";
const DOCUMENT_ID = "shared-doc";
const TEXT_NAME = "content";

const clients = [];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createClient(id) {
  const ydoc = new Y.Doc();

  const provider = new WebsocketProvider(
    SERVER_URL,
    DOCUMENT_ID,
    ydoc
  );

  const ytext = ydoc.getText(TEXT_NAME);

  provider.on("status", (event) => {
    console.log(`[Client-${id}] ${event.status}`);
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Client-${id} sync timeout`));
    }, 10000);

    provider.on("sync", (isSynced) => {
      if (isSynced) {
        clearTimeout(timeout);

        clients.push({
          id,
          ydoc,
          provider,
          ytext,
        });

        resolve();
      }
    });
  });
}

async function runTest() {
  console.log("\n==============================");
  console.log("   SyncDoc 10 Client Test");
  console.log("==============================\n");

  // Create 10 clients
  for (let i = 1; i <= CLIENT_COUNT; i++) {
    await createClient(i);
  }

  console.log("\nAll 10 clients connected.");
  console.log("Sending concurrent edits...\n");

  // All clients edit the same Yjs document
  clients.forEach((client) => {
    client.ydoc.transact(() => {
      client.ytext.insert(
        client.ytext.length,
        `[Client-${client.id}] `
      );
    });
  });

  // Wait for synchronization
  await wait(3000);

  const finalText = clients[0].ytext.toString();

  console.log("\nFinal document:");
  console.log(finalText);

  let received = 0;

  for (let i = 1; i <= CLIENT_COUNT; i++) {
    if (finalText.includes(`[Client-${i}]`)) {
      received++;
    }
  }

  console.log("\n==============================");
  console.log(`Clients connected : ${CLIENT_COUNT}`);
  console.log(`Edits sent        : ${CLIENT_COUNT}`);
  console.log(`Edits received    : ${received}`);
  console.log(`Lost edits        : ${CLIENT_COUNT - received}`);
  console.log("==============================");

  if (received === CLIENT_COUNT) {
    console.log("\nPASS: All 10 edits synchronized successfully.");
  } else {
    console.log("\nFAIL: Some edits were lost.");
  }

  // Cleanup
  clients.forEach((client) => {
    client.provider.destroy();
    client.ydoc.destroy();
  });
}

runTest().catch((error) => {
  console.error("\nStress test failed:");
  console.error(error);

  clients.forEach((client) => {
    client.provider.destroy();
    client.ydoc.destroy();
  });
});