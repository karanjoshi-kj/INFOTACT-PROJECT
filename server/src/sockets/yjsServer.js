const http = require("http");
const WebSocket = require("ws");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Room = require("../models/Room");
const { setupWSConnection, getYDoc, docs } = require("y-websocket/bin/utils");
const RoomApproval = require("../models/RoomApproval");
const RoomState = require("../models/RoomState");
const OfflineChange = require("../models/OfflineChange");

const ROOM_PREFIX = "syncdoc-room-"; // the editor names its rooms "syncdoc-room-<CODE>"
const RESTORE_ORIGIN = "approvals-restore"; // marks changes the server itself makes
const RESTORE_TIMEOUT_MS = 3000;
const SNAPSHOT_DELAY_MS = 1500; // wait this long after the last edit before saving the room content
const FLAG_DELAY_MS = 500; // wait this long before saving "missed while offline" marks
const ACCESS_DENIED_CLOSE_CODE = 4403;
const ROOM_NOT_FOUND_CLOSE_CODE = 4404;

// doc -> room state kept by the server (see newState)
const roomStates = new WeakMap();
let activeWss = null;

function revokeRoomMember(roomCode, userId) {
  if (!activeWss) return;

  activeWss.clients.forEach((client) => {
    if (
      String(client.roomCode) === String(roomCode) &&
      String(client.userId) === String(userId) &&
      client.readyState === WebSocket.OPEN
    ) {
      client.close(ACCESS_DENIED_CLOSE_CODE, "Room access denied by host");
    }
  });
}

async function closeRoom(roomCode) {
  const docName = `${ROOM_PREFIX}${roomCode}`;
  const doc = docs.get(docName);
  const state = doc && roomStates.get(doc);

  if (state) {
    state.deleted = true;
    state.snapDirty = false;
    state.pendingFlags.clear();
    clearTimeout(state.snapTimer);
    clearTimeout(state.flagTimer);
    state.snapTimer = null;
    state.flagTimer = null;
  }

  if (activeWss) {
    activeWss.clients.forEach((client) => {
      if (
        String(client.roomCode) === String(roomCode) &&
        client.readyState === WebSocket.OPEN
      ) {
        client.close(ROOM_NOT_FOUND_CLOSE_CODE, "Room no longer exists");
      }
    });
  }

  docs.delete(docName);
  if (state) await Promise.allSettled([...state.pendingWrites]);
  if (state) roomStates.delete(doc);
  if (doc) doc.destroy();
}

async function authenticateWebSocket(req) {
  try {
    const url = new URL(req.url, "http://localhost");
    const token = url.searchParams.get("token");

    if (!token) {
      return {
        ok: false,
        code: 1008,
        message: "Authentication required",
      };
    }

    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET
    );
    if (!payload.userId) {
      return {
        ok: false,
        code: 1008,
        message: "Invalid authentication token",
      };
    }

    return {
      ok: true,
      userId: String(payload.userId),
    };
  } catch (error) {
    console.error(
      "WebSocket authentication failed:",
      error.message
    );

    return {
      ok: false,
      code: 1008,
      message: "Invalid or expired token",
    };
  }
}


async function authorizeRoom(roomCode, userId) {
  try {
    const room = await Room.findOne({ roomCode });

    if (!room) {
      return {
        ok: false,
        code: ROOM_NOT_FOUND_CLOSE_CODE,
        message: "Room not found",
      };
    }

    const isHost =
      String(room.hostId) === String(userId);

    const membership = room.members.find(
      (member) => String(member.userId) === String(userId)
    );
    const isApprovedMember = membership?.status === "approved";

    if (!isHost && !isApprovedMember) {
      console.log("WebSocket room access denied:", {
        roomCode,
        userId,
        isHost,
        isApprovedMember,
        membershipStatus: membership?.status || "none",
      });

      return {
        ok: false,
        code: membership?.status === "denied" ? ACCESS_DENIED_CLOSE_CODE : 1008,
        message:
          membership?.status === "denied"
            ? "Room access denied by host"
            : "You are not an approved member of this room",
      };
    }

    return {
      ok: true,
      room,
    };
  } catch (error) {
    console.error(
      `Could not authorize room ${roomCode}:`,
      error.message
    );

    return {
      ok: false,
      code: 1013,
      message: "Unable to verify room access",
    };
  }
}

function newState(roomCode) {
  return {
    roomCode,
    deleted: false,
    pendingWrites: new Set(),
    restored: false, // the saved approvals / colours / content were read from the database
    loading: null, // Promise while they are being read
    lastHtml: null, // the room content the last time we looked (null = not known yet)
    hostId: "", // account id of the room's host
    pendingFlags: new Map(), // userId -> who changed it (people who missed an edit, not saved yet)
    flagTimer: null,
    snapTimer: null,
    snapDirty: false,
  };
}

function trackRoomWrite(state, operation) {
  const pending = Promise.resolve(operation);
  state.pendingWrites.add(pending);
  pending.then(
    () => state.pendingWrites.delete(pending),
    () => state.pendingWrites.delete(pending)
  );
  return pending;
}

const isHexColor = (value) => typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("timed out")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ---------------------------------------------------------------
// WHO IS IN THE ROOM RIGHT NOW (from the live connections)
// ---------------------------------------------------------------

// Account ids of everyone connected to the room at this moment
function onlineUserIds(doc) {
  const ids = new Set();
  doc.awareness.getStates().forEach((state) => {
    if (state && state.user && state.user.id !== undefined && state.user.id !== null) {
      ids.add(String(state.user.id));
    }
  });
  return ids;
}

// The account behind a websocket connection (null when it is not known)
function userOfConnection(doc, conn) {
  const clientIds = conn && typeof conn === "object" ? doc.conns.get(conn) : null;
  if (!clientIds) return null;
  const states = doc.awareness.getStates();
  for (const clientId of clientIds) {
    const state = states.get(clientId);
    if (state && state.user && state.user.id !== undefined && state.user.id !== null) {
      return { id: String(state.user.id), name: String(state.user.name || "") };
    }
  }
  return null;
}

// Everyone who belongs to the room: the approved collaborators and the host
function memberUserIds(doc, state) {
  const ids = new Set();
  doc.getMap("approvals").forEach((record, userId) => {
    if (record && record.status === "approved") ids.add(String(userId));
  });
  if (state.hostId) ids.add(state.hostId);
  return ids;
}

// ---------------------------------------------------------------
// SAVED ROOM DATA -> BACK INTO THE ROOM
// ---------------------------------------------------------------

// Puts back what the server saved earlier: the people the host approved, their colours,
// the host's id and the latest content of the room.
// Returns true when the saved data was read (even if there was none).
async function restoreRoom(doc, state) {
  if (mongoose.connection.readyState !== 1) return false; // database not ready - try again on the next connection

  const { roomCode } = state;
  try {
    const [saved, snapshot] = await withTimeout(
      Promise.all([RoomApproval.find({ roomCode }).lean(), RoomState.findOne({ roomCode }).lean()]),
      RESTORE_TIMEOUT_MS
    );
    const approvals = doc.getMap("approvals");
    const colors = doc.getMap("colors");
    const ytext = doc.getText("content");

    if (snapshot && snapshot.hostId && !state.hostId) state.hostId = snapshot.hostId;

    doc.transact(() => {
      saved.forEach((entry) => {
        // Never overwrite a decision that is already in the room
        if (!approvals.has(entry.userId)) {
          approvals.set(entry.userId, {
            status: "approved",
            name: entry.name || "",
            at: entry.approvedAt ? new Date(entry.approvedAt).getTime() : Date.now(),
          });
        }
        // The saved colour always wins: a person keeps the same colour every time
        if (isHexColor(entry.color) && colors.get(entry.userId) !== entry.color) {
          colors.set(entry.userId, entry.color);
        }
      });

      // The server's copy of the content is the newest one: bring it back if the room is empty
      if (snapshot && snapshot.html && ytext.length === 0) ytext.insert(0, snapshot.html);
    }, RESTORE_ORIGIN);

    state.lastHtml = ytext.length > 0 ? ytext.toString() : null;
    return true;
  } catch (err) {
    console.error(`Could not restore room ${roomCode}:`, err.message);
    return false;
  }
}

// ---------------------------------------------------------------
// SAVING ROOM DATA
// ---------------------------------------------------------------

// Saves every approval the host gives (and forgets it if it is taken back).
function watchApprovals(doc, state) {
  const { roomCode } = state;
  const approvals = doc.getMap("approvals");
  const colors = doc.getMap("colors");

  approvals.observe((event, transaction) => {
    if (state.deleted) return;
    if (transaction.origin === RESTORE_ORIGIN) return;

    event.changes.keys.forEach((change, userId) => {
      if (typeof userId !== "string" || !userId) return;
      const record = approvals.get(userId);

      if (record && record.status === "approved") {
        const fields = { name: String(record.name || "").slice(0, 200) };
        const color = colors.get(userId);
        if (isHexColor(color)) fields.color = color;

        trackRoomWrite(state, RoomApproval.updateOne(
          { roomCode, userId },
          { $set: fields, $setOnInsert: { approvedAt: new Date() } },
          { upsert: true }
        )).catch((err) => console.error(`Could not save approval for room ${roomCode}:`, err.message));
      } else {
        // removed, or turned into a "denied" decision
        trackRoomWrite(state, RoomApproval.deleteOne({ roomCode, userId })).catch((err) =>
          console.error(`Could not remove approval for room ${roomCode}:`, err.message)
        );
        trackRoomWrite(state, OfflineChange.deleteOne({ roomCode, userId })).catch((err) =>
          console.error(`Could not clear offline mark for room ${roomCode}:`, err.message)
        );
      }
    });
  });
}

// Saves the colour of every approved collaborator (the colour is chosen once, then kept).
function watchColors(doc, state) {
  const { roomCode } = state;
  const approvals = doc.getMap("approvals");
  const colors = doc.getMap("colors");

  colors.observe((event, transaction) => {
    if (state.deleted) return;
    if (transaction.origin === RESTORE_ORIGIN) return;
    if (!state.restored) return; // never replace the saved colours with guesses made before they were read

    event.changes.keys.forEach((change, userId) => {
      const color = colors.get(userId);
      const record = approvals.get(userId);
      if (!isHexColor(color) || !record || record.status !== "approved") return;

      trackRoomWrite(state, RoomApproval.updateOne({ roomCode, userId }, { $set: { color } })).catch((err) =>
        console.error(`Could not save colour for room ${roomCode}:`, err.message)
      );
    });
  });
}

// Remembers the host: the first person who joins the room as host.
function watchHost(doc, state) {
  const { roomCode } = state;

  doc.awareness.on("change", () => {
    if (state.deleted || state.hostId || !state.restored) return;
    doc.awareness.getStates().forEach((s) => {
      if (state.hostId) return;
      if (s && s.user && s.user.role === "host" && s.user.id !== undefined && s.user.id !== null) {
        state.hostId = String(s.user.id);
        trackRoomWrite(state, RoomState.updateOne({ roomCode }, { $set: { hostId: state.hostId } }, { upsert: true })).catch((err) =>
          console.error(`Could not save host for room ${roomCode}:`, err.message)
        );
      }
    });
  });
}

async function flushSnapshot(doc, state) {
  clearTimeout(state.snapTimer);
  state.snapTimer = null;
  if (state.deleted || !state.snapDirty || !state.restored) return;
  state.snapDirty = false;

  try {
    const html = doc.getText("content").toString();
    await trackRoomWrite(state, RoomState.updateOne({ roomCode: state.roomCode }, { $set: { html } }, { upsert: true }));
  } catch (err) {
    state.snapDirty = true;
    console.error(`Could not save content of room ${state.roomCode}:`, err.message);
  }
}

function scheduleSnapshot(doc, state) {
  if (state.deleted) return;
  state.snapDirty = true;
  if (state.snapTimer) return;
  state.snapTimer = setTimeout(() => flushSnapshot(doc, state), SNAPSHOT_DELAY_MS);
}

// Saves the "this person missed a change" marks.
async function flushFlags(doc, state) {
  clearTimeout(state.flagTimer);
  state.flagTimer = null;
  if (state.deleted || state.pendingFlags.size === 0) return;

  // Someone who is back online by now already received the newest content: no mark for them
  const online = onlineUserIds(doc);
  const entries = Array.from(state.pendingFlags.entries()).filter(([userId]) => !online.has(userId));
  state.pendingFlags.clear();
  if (entries.length === 0) return;

  try {
    await trackRoomWrite(state, OfflineChange.bulkWrite(
      entries.map(([userId, info]) => ({
        updateOne: {
          filter: { roomCode: state.roomCode, userId },
          update: {
            $set: {
              changedAt: info.changedAt,
              changedById: info.changedById,
              changedByName: info.changedByName,
            },
          },
          upsert: true,
        },
      }))
    ));
  } catch (err) {
    console.error(`Could not save offline marks for room ${state.roomCode}:`, err.message);
    entries.forEach(([userId, info]) => {
      if (!state.pendingFlags.has(userId)) state.pendingFlags.set(userId, info);
    });
  }
}

// Watches the shared text: every real change is saved, and everybody who belongs to the room
// but is NOT connected at that moment gets a "changed while you were offline" mark.
function watchContent(doc, state) {
  const ytext = doc.getText("content");

  ytext.observe((event, transaction) => {
    if (state.deleted) return;
    if (transaction.origin === RESTORE_ORIGIN) return;

    const html = ytext.toString();
    if (html === state.lastHtml) return; // nothing really changed (e.g. the same text was written again)

    const firstContent = state.lastHtml === null; // the room's first text (the host loading the document), not an edit
    state.lastHtml = html;

    if (!state.restored) return; // saved data not read yet: do not write anything based on a guess
    scheduleSnapshot(doc, state);
    if (firstContent) return;

    const author = userOfConnection(doc, transaction.origin);
    const online = onlineUserIds(doc);
    let added = false;

    memberUserIds(doc, state).forEach((userId) => {
      if ((author && userId === author.id) || online.has(userId)) return; // they have the change already
      state.pendingFlags.set(userId, {
        changedAt: new Date(),
        changedById: author ? author.id : "",
        changedByName: author ? author.name.slice(0, 200) : "",
      });
      added = true;
    });

    if (added && !state.flagTimer) {
      state.flagTimer = setTimeout(() => flushFlags(doc, state), FLAG_DELAY_MS);
    }
  });
}

// Makes sure a room's saved data is loaded. Returns a Promise while it is still
// loading (first connection to the room), or null when there is nothing to wait for.
function prepareRoom(docName) {
  if (!docName.startsWith(ROOM_PREFIX)) return null;

  const roomCode = docName.slice(ROOM_PREFIX.length);
  if (!roomCode) return null;

  // Same document the websocket connection is about to use (it is kept in memory by y-websocket)
  const doc = getYDoc(docName);

  let state = roomStates.get(doc);
  if (!state) {
    state = newState(roomCode);
    roomStates.set(doc, state);
    watchApprovals(doc, state);
    watchColors(doc, state);
    watchHost(doc, state);
    watchContent(doc, state);
  }

  if (state.restored) return null;

  if (!state.loading) {
    state.loading = restoreRoom(doc, state).then((ok) => {
      state.restored = ok;
      state.loading = null;
    });
  }
  return state.loading;
}

// When a connection closes, save what is still waiting (the last edit, the offline marks)
function saveOnClose(ws, docName, doc) {
  if (!docName.startsWith(ROOM_PREFIX)) return;
  const state = roomStates.get(doc);
  if (!state) return;

  ws.on("close", () => {
    flushFlags(doc, state);
    flushSnapshot(doc, state);
  });
}

function startYjsServer(port) {
  const server = http.createServer();
  const wss = new WebSocket.Server({ server });
  activeWss = wss;

  wss.on("connection", async (ws, req) => {
    const docName = (req.url || "/").slice(1).split("?")[0];

    // WebsocketProvider sends its first Yjs sync message immediately on open.
    // Authentication and room restoration below are asynchronous, so buffer from
    // the start or that first sync step can be lost before setupWSConnection listens.
    const held = [];
    const hold = (data, isBinary) => {
      held.push([data, isBinary]);
    };
    const discardHeld = () => {
      ws.off("message", hold);
      held.length = 0;
    };
    ws.on("message", hold);

    const startYjsConnection = () => {
      ws.off("message", hold);
      if (ws.readyState !== WebSocket.OPEN) {
        held.length = 0;
        return false;
      }

      setupWSConnection(ws, req);
      saveOnClose(ws, docName, getYDoc(docName));

      // setupWSConnection must install its listener before replaying the messages
      // received while authentication / room restoration was in progress.
      held.splice(0).forEach(([data, isBinary]) => {
        ws.emit("message", data, isBinary);
      });
      return true;
    };

    ws.on("close", () => {
      discardHeld();
    });

    ws.on("error", (error) => {
      console.error("Yjs WebSocket error:", error.message);
    });

    try {
      if (!docName.startsWith(ROOM_PREFIX)) {
        discardHeld();
        ws.close(1008, "Invalid room");
        return;
      }

      const roomCode =
        docName.slice(ROOM_PREFIX.length);
      // Mark the socket early so deletion can also close connections still
      // waiting on JWT/MongoDB checks.
      ws.roomCode = roomCode;

      // 1. Check JWT
      const auth =
        await authenticateWebSocket(req);

      if (!auth.ok) {
        discardHeld();
        ws.close(auth.code, auth.message);
        return;
      }

      // 2. Check room membership
      const authorization =
        await authorizeRoom(
          roomCode,
          auth.userId
        );

      if (!authorization.ok) {
        discardHeld();
        ws.close(
          authorization.code,
          authorization.message
        );
        return;
      }

      if (ws.readyState !== WebSocket.OPEN) {
        discardHeld();
        return;
      }

      ws.userId = auth.userId;

      // 3. Existing room preparation
      const waiting = prepareRoom(docName);
      await waiting;

      if (
        ws.readyState !== WebSocket.OPEN
      ) {
        discardHeld();
        return;
      }

      // Recheck after restore: the Room could have been deleted while this
      // connection was waiting for its saved Yjs state to load.
      const latestAuthorization = await authorizeRoom(roomCode, auth.userId);
      if (!latestAuthorization.ok) {
        discardHeld();
        ws.close(latestAuthorization.code, latestAuthorization.message);
        return;
      }

      // 4. Start Yjs only after authentication
      startYjsConnection();
    } catch (error) {
      discardHeld();
      console.error(
        "WebSocket connection error:",
        error
      );

      if (
        ws.readyState === WebSocket.OPEN
      ) {
        ws.close(
          1011,
          "Internal server error"
        );
      }
    }
  });

  server.listen(port, () => {
    console.log(`Yjs WebSocket server running on port ${port}`);
  });
}

startYjsServer.revokeRoomMember = revokeRoomMember;
startYjsServer.closeRoom = closeRoom;

module.exports = startYjsServer;
