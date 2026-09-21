const blockLocks = new Map();

function lockBlock(blockId, userId) {
  if (blockLocks.has(blockId)) {
    return false;
  }

  blockLocks.set(blockId, userId);
  return true;
}

function unlockBlock(blockId, userId) {
  if (blockLocks.get(blockId) !== userId) {
    return false;
  }

  blockLocks.delete(blockId);
  return true;
}

function getBlockLock(blockId) {
  return blockLocks.get(blockId) || null;
}

function unlockAllByUser(userId) {
  for (const [blockId, lockedBy] of blockLocks.entries()) {
    if (lockedBy === userId) {
      blockLocks.delete(blockId);
    }
  }
}

module.exports = {
  lockBlock,
  unlockBlock,
  getBlockLock,
  unlockAllByUser,
};