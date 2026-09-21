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

module.exports = {
  lockBlock,
  unlockBlock,
  getBlockLock,
};