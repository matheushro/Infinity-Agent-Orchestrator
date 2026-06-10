// Tracks the PTY status of each terminal node.
// Populated by useTerminalSession; read by the Sidebar to show status dots.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export type PtyStatus = 'offline' | 'idle' | 'busy'

interface PtyActivityCtx {
  getStatus: (nodeId: string) => PtyStatus
  setStatus: (nodeId: string, status: PtyStatus) => void
}

const PtyActivityContext = createContext<PtyActivityCtx>({
  getStatus: () => 'offline',
  setStatus: () => {},
})

export function PtyActivityProvider({ children }: { children: ReactNode }): JSX.Element {
  const [statusMap, setStatusMap] = useState<Record<string, PtyStatus>>({})

  // setStatus fires on EVERY pty data chunk ('busy'), so it must bail out when
  // the status is unchanged: returning the same map reference lets React skip
  // the update entirely. Without this, 7 streaming agents re-render every
  // context consumer (all terminal nodes + sidebar) hundreds of times/second.
  const setStatus = useCallback((nodeId: string, status: PtyStatus) => {
    setStatusMap((prev) =>
      (prev[nodeId] ?? 'offline') === status ? prev : { ...prev, [nodeId]: status },
    )
  }, [])

  const getStatus = useCallback(
    (nodeId: string): PtyStatus => statusMap[nodeId] ?? 'offline',
    [statusMap],
  )

  const value = useMemo(() => ({ getStatus, setStatus }), [getStatus, setStatus])

  return (
    <PtyActivityContext.Provider value={value}>
      {children}
    </PtyActivityContext.Provider>
  )
}

export function usePtyActivity(): PtyActivityCtx {
  return useContext(PtyActivityContext)
}
