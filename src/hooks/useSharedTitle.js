import { useCallback, useEffect, useRef } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

const WS_URL = 'ws://localhost:1234' // same live-sync server the editor uses

// Keeps the document title the same for everyone in a room.
//
// The editor shares the document text through the Yjs room "syncdoc-room-<CODE>".
// This hook joins that SAME room and shares the title in a small Y.Map called "meta".
//   - A rename is written into the map, so the server sends it to every collaborator at once.
//   - A rename from someone else is handed to `onRemoteTitle` (the page shows it and saves it).
//   - On join / refresh / reconnect the title stored in the room is applied, so nobody keeps an old name.
//   - Only approved people read or write the title (same rule as the document text).
//   - Yjs keeps one value per key, so two people renaming at once end up with the same final title everywhere.
export default function useSharedTitle({ enabled, docId, roomCode, role, access, getTitle, onRemoteTitle }) {
  const ymetaRef = useRef(null)
  const syncedRef = useRef(false) // true once the room's current state has arrived
  const pendingRef = useRef(null) // a rename made before the first sync (sent right after it)
  const applyRef = useRef(null)

  // Always the newest values, without restarting the connection
  const accessRef = useRef(access)
  accessRef.current = access
  const getTitleRef = useRef(getTitle)
  getTitleRef.current = getTitle
  const onRemoteTitleRef = useRef(onRemoteTitle)
  onRemoteTitleRef.current = onRemoteTitle

  useEffect(() => {
    if (!enabled || !roomCode) return undefined

    const ydoc = new Y.Doc()
    const provider = new WebsocketProvider(WS_URL, `syncdoc-room-${roomCode}`, ydoc)
    provider.awareness.setLocalState(null) // not a person: stays out of the collaborator list
    const ymeta = ydoc.getMap('meta')

    ymetaRef.current = ymeta
    syncedRef.current = false
    pendingRef.current = null

    // Show the room's title here (skipped while waiting for approval, or when it is already shown)
    const applyShared = () => {
      if (accessRef.current !== 'granted') return
      const shared = ymeta.get('title')
      if (typeof shared !== 'string' || !shared.trim()) return
      if (shared === getTitleRef.current()) return
      onRemoteTitleRef.current(shared)
    }
    applyRef.current = applyShared

    // Someone else changed the title
    const onMeta = (event, transaction) => {
      if (transaction.local || !syncedRef.current) return
      applyShared()
    }

    const onSync = (isSynced) => {
      if (!isSynced) return
      syncedRef.current = true

      if (accessRef.current !== 'granted') return

      if (pendingRef.current !== null) {
        // renamed while connecting: this is the newest change, so it wins
        const title = pendingRef.current
        pendingRef.current = null
        if (ymeta.get('title') !== title) ymeta.set('title', title)
      } else if (!ymeta.has('title')) {
        // empty room (first time, or the server restarted): the host's saved title starts it
        const own = getTitleRef.current()
        if (role === 'host' && own) ymeta.set('title', own)
      } else {
        applyShared()
      }
    }

    ymeta.observe(onMeta)
    provider.on('sync', onSync)

    return () => {
      provider.off('sync', onSync)
      ymeta.unobserve(onMeta)
      ymetaRef.current = null
      syncedRef.current = false
      pendingRef.current = null
      applyRef.current = null
      provider.destroy()
      ydoc.destroy()
    }
  }, [enabled, docId, roomCode, role])

  // Approved after joining: pick up the shared title right away
  useEffect(() => {
    if (access === 'granted' && syncedRef.current && applyRef.current) applyRef.current()
  }, [access])

  // Call this when YOU rename the document
  const publishTitle = useCallback((title) => {
    const ymeta = ymetaRef.current
    if (!ymeta || !title || accessRef.current !== 'granted') return
    if (!syncedRef.current) {
      pendingRef.current = title
      return
    }
    if (ymeta.get('title') !== title) ymeta.set('title', title)
  }, [])

  return { publishTitle }
}