// Tracks the PTY status of each terminal node.
// Populated by useTerminalSession; read by the Sidebar to show status dots.
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

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

  const setStatus = useCallback((nodeId: string, status: PtyStatus) => {
    setStatusMap((prev) => ({ ...prev, [nodeId]: status }))
  }, [])

  const getStatus = useCallback(
    (nodeId: string): PtyStatus => statusMap[nodeId] ?? 'offline',
    [statusMap],
  )

  return (
    <PtyActivityContext.Provider value={{ getStatus, setStatus }}>
      {children}
    </PtyActivityContext.Provider>
  )
}

export function usePtyActivity(): PtyActivityCtx {
  return useContext(PtyActivityContext)
}
