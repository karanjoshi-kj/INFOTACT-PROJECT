const Document = require("../models/Document");
const Room = require("../models/Room");
const RoomState = require("../models/RoomState");
const RoomApproval = require("../models/RoomApproval");
const OfflineChange = require("../models/OfflineChange");
const CollabDocument = require("../models/CollabDocument");
const startYjsServer = require("../sockets/yjsServer");

// Delete owner-authorized documents and the collaboration data for rooms they host.
// Room-code references on collaborator copies are cleared too, but those users' own
// documents and any room hosted by someone else are left intact.
async function deleteDocumentsWithCollaboration(documents) {
  const documentIds = [...new Set(documents.map((doc) => String(doc._id)))];
  if (documentIds.length === 0) return [];

  const documentIdSet = new Set(documentIds);
  const documentRoomCodes = [...new Set(
    documents.map((doc) => String(doc.roomCode || "").trim()).filter(Boolean)
  )];

  const relatedRooms = await Room.find({
    $or: [
      { documentId: { $in: documentIds } },
      ...(documentRoomCodes.length ? [{ roomCode: { $in: documentRoomCodes } }] : []),
    ],
  }).select("roomCode documentId").lean();

  const roomsHostedByDeletedDocuments = relatedRooms.filter((room) =>
    documentIdSet.has(String(room.documentId))
  );
  const hostedRoomCodes = new Set(
    roomsHostedByDeletedDocuments.map((room) => String(room.roomCode))
  );
  const existingRoomCodes = new Set(relatedRooms.map((room) => String(room.roomCode)));

  // A stored document roomCode with no Room row is a legacy orphan. It is safe to
  // clean its child records; a code that belongs to somebody else's Room is not.
  const orphanedRoomCodes = documentRoomCodes.filter((code) => !existingRoomCodes.has(code));
  const roomCodes = [...new Set([...hostedRoomCodes, ...orphanedRoomCodes])];

  if (roomsHostedByDeletedDocuments.length) {
    await Room.deleteMany({ documentId: { $in: documentIds } });
  }

  // Close live Yjs sessions before deleting persisted state. This also prevents a
  // connected room from writing a final snapshot back after cleanup.
  await Promise.all(roomCodes.map((roomCode) => startYjsServer.closeRoom(roomCode)));

  if (roomCodes.length) {
    await Promise.all([
      RoomState.deleteMany({ roomCode: { $in: roomCodes } }),
      RoomApproval.deleteMany({ roomCode: { $in: roomCodes } }),
      OfflineChange.deleteMany({ roomCode: { $in: roomCodes } }),
      CollabDocument.deleteMany({
        $or: [
          { documentId: { $in: documentIds } },
          { roomCode: { $in: roomCodes } },
        ],
      }),
      Document.updateMany(
        { roomCode: { $in: roomCodes } },
        { $set: { roomCode: null } }
      ),
    ]);
  } else {
    await CollabDocument.deleteMany({ documentId: { $in: documentIds } });
  }

  await Document.deleteMany({ _id: { $in: documentIds } });
  return documentIds;
}

module.exports = deleteDocumentsWithCollaboration;
