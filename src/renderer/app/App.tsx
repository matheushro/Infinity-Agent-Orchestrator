// Application shell: composes the sidebar, topbar, and per-workspace canvases.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { WorkspaceCanvas, type WorkspaceCanvasHandle } from './components/WorkspaceCanvas'
import { useWorkspaces } from '@renderer/features/workspaces/hooks/useWorkspaces'
import { useTerminalStyles } from '@renderer/features/terminals/hooks/useTerminalStyles'
import { PtyActivityProvider } from '@renderer/features/workspaces/context/PtyActivityContext'
import { useLocalStorage } from '@renderer/hooks/useLocalStorage'
import type { TerminalNodeData } from '@renderer/features/terminals/types'
import type { ShellType } from '@renderer/features/terminals/types'
import type { CanvasTheme } from '@renderer/features/canvas/types'

export default function App(): JSX.Element {
  const { workspaces, activeId, setActiveId, createWorkspace } = useWorkspaces()
  const { getStyle, setStyle, removeStyle } = useTerminalStyles()
  const [shell, setShell] = useState<ShellType>('default')
  const [theme, setTheme] = useLocalStorage<CanvasTheme>('canvasTheme', 'dark')
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorage('sidebarCollapsed', false)

  // Aggregated node list from all workspace canvases — used by the Sidebar.
  const [nodesByWorkspace, setNodesByWorkspace] = useState<Record<string, TerminalNodeData[]>>({})
  const [selectedTerminalId, setSelectedTerminalId] = useState<string | null>(null)

  // When sidebar clicks a terminal in another workspace, we switch workspace
  // and request a focus animation on the canvas.
  const [pendingFocus, setPendingFocus] = useState<{
    workspaceId: string
    terminalId: string
  } | null>(null)

  // Refs to each WorkspaceCanvas so the sidebar "New terminal" button can open
  // the modal of the currently active canvas.
  const canvasRefs = useRef<Map<string, WorkspaceCanvasHandle>>(new Map())

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const handleNodesChange = useCallback((workspaceId: string, nodes: TerminalNodeData[]): void => {
    setNodesByWorkspace((prev) => ({ ...prev, [workspaceId]: nodes }))
  }, [])

  function handleSelectTerminal(workspaceId: string, terminalId: string): void {
    if (workspaceId !== activeId) {
      setActiveId(workspaceId)
    }
    setSelectedTerminalId(terminalId)
    setPendingFocus({ workspaceId, terminalId })
  }

  const activeWorkspace = workspaces.find((ws) => ws.id === activeId)
  const activeWorkspaceName = activeWorkspace?.name ?? ''
  const activeTerminalCount = nodesByWorkspace[activeId]?.length ?? 0

  return (
    <PtyActivityProvider>
      <div className="flex h-full w-full" style={{ background: 'var(--bg)' }}>
        <Sidebar
          workspaces={workspaces}
          activeWorkspaceId={activeId}
          nodesByWorkspace={nodesByWorkspace}
          selectedTerminalId={selectedTerminalId}
          theme={theme}
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          onNewTerminal={() => {
            canvasRefs.current.get(activeId)?.openNewTerminalModal()
          }}
          onCreateWorkspace={createWorkspace}
          onSwitchWorkspace={setActiveId}
          onSelectTerminal={handleSelectTerminal}
          onToggleTheme={setTheme}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          <Topbar
            workspaceName={activeWorkspaceName}
            terminalCount={activeTerminalCount}
            theme={theme}
            shell={shell}
            onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            onShellChange={setShell}
          />

          <div className="flex flex-1 min-h-0 relative">
            {workspaces.map((ws) => (
              <WorkspaceCanvas
                key={ws.id}
                ref={(handle) => {
                  if (handle) canvasRefs.current.set(ws.id, handle)
                  else canvasRefs.current.delete(ws.id)
                }}
                workspace={ws}
                active={ws.id === activeId}
                shell={shell}
                theme={theme}
                getTerminalStyle={getStyle}
                setTerminalStyle={setStyle}
                removeTerminalStyle={removeStyle}
                onNodesChange={(nodes) => handleNodesChange(ws.id, nodes)}
                pendingFocusId={
                  pendingFocus?.workspaceId === ws.id ? pendingFocus.terminalId : null
                }
                onFocusConsumed={() => setPendingFocus(null)}
              />
            ))}
          </div>
        </main>
      </div>
    </PtyActivityProvider>
  )
}
