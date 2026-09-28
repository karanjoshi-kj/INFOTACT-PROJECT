const WebSocket = require("ws");
const Y = require("yjs");
const { WebsocketProvider } = require("y-websocket");

global.WebSocket = WebSocket;

const NUM_CLIENTS = Number(process.argv[2]) || 10;
const ROOM = `stress-test-${Date.now()}`; // fresh room every run

const clients = [];
const synced = new Set();

for (let i = 1; i <= NUM_CLIENTS; i++) {
  const ydoc = new Y.Doc();
  const provider = new WebsocketProvider("ws://localhost:1234", ROOM, ydoc);
  const ytext = ydoc.getText("shared-text");
  const id = `Client${i}`;
  clients.push({ id, ydoc, provider, ytext });

  provider.on("sync", (isSynced) => {
    if (!isSynced || synced.has(id)) return;
    synced.add(id);
    if (synced.size === NUM_CLIENTS) fireEdits();
  });
}

function fireEdits() {
  console.log(`All ${NUM_CLIENTS} clients synced. Sending edits at the same time...\n`);
  clients.forEach((c) => c.ytext.insert(c.ytext.length, `[${c.id}] `));
  setTimeout(report, 3000);
}

function report() {
  const texts = clients.map((c) => c.ytext.toString());
  console.log("Final document (Client1's view):\n", texts[0], "\n");

  let allPresent = true;
  clients.forEach((c) => {
    const ok = texts[0].includes(`[${c.id}]`);
    if (!ok) allPresent = false;
    console.log(`${c.id}: ${ok ? "edit present" : "EDIT MISSING"}`);
  });

  const allSame = texts.every((t) => t === texts[0]);
  console.log(`\nAll ${NUM_CLIENTS} clients hold identical text: ${allSame}`);
  console.log(allPresent && allSame ? "PASS: no edit lost, all clients converged." : "FAIL");
  process.exit(allPresent && allSame ? 0 : 1);
}

// safety net: if some client never syncs
setTimeout(() => {
  console.log(`FAIL: only ${synced.size}/${NUM_CLIENTS} clients synced within 10s`);
  process.exit(1);
}, 10000);