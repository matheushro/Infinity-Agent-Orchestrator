// Application shell: composes the sidebar, topbar, and per-workspace canvases.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { SettingsModal } from './components/SettingsModal'
import { Topbar } from './components/Topbar'
import { WorkspaceCanvas, type WorkspaceCanvasHandle } from './components/WorkspaceCanvas'
import { useWorkspaces } from '@renderer/features/workspaces/hooks/useWorkspaces'
import { useTerminalStyles } from '@renderer/features/terminals/hooks/useTerminalStyles'
import { PtyActivityProvider } from '@renderer/features/workspaces/context/PtyActivityContext'
import { IPower } from '@renderer/components/ui'
import { useLocalStorage } from '@renderer/hooks/useLocalStorage'
import type { TerminalNodeData } from '@renderer/features/terminals/types'
import type { ShellType } from '@renderer/features/terminals/types'
import type { CanvasTheme } from '@renderer/features/canvas/types'

export default function App(): JSX.Element {
  const [maxWorkspaces, setMaxWorkspaces] = useLocalStorage<number>('maxWorkspaces', 5)
  const {
    workspaces,
    activeId,
    setActiveId,
    createWorkspace,
    renameWorkspace,
    deleteWorkspace,
    duplicateWorkspace,
    reorderWorkspaces,
    setWorkspaceEnabled,
  } = useWorkspaces(maxWorkspaces)
  const { getStyle, setStyle, removeStyle } = useTerminalStyles()
  const [defaultShell, setDefaultShell] = useLocalStorage<ShellType>('defaultShell', 'default')
  const [defaultProjectFolder, setDefaultProjectFolder] = useLocalStorage<string>(
    'defaultProjectFolder',
    '',
  )
  const [theme, setTheme] = useLocalStorage<CanvasTheme>('canvasTheme', 'dark')
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorage('sidebarCollapsed', false)
  const [settingsOpen, setSettingsOpen] = useState(false)

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
    // Bail out when the list is unchanged. WorkspaceCanvas re-reports its nodes
    // whenever its onNodesChange prop identity changes (a fresh arrow every App
    // render); always producing a new map here turned that into an infinite
    // render loop — ~2000 re-renders/s pinning a CPU core with an idle canvas.
    setNodesByWorkspace((prev) =>
      prev[workspaceId] === nodes ? prev : { ...prev, [workspaceId]: nodes },
    )
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
  // A deactivated workspace is not mounted at all — its terminals run no pty and
  // its notes are not held in memory. We show a placeholder prompting re-enable.
  const activeWorkspaceDisabled = Boolean(activeWorkspace && activeWorkspace.enabled === false)

  return (
    <PtyActivityProvider>
      <div className="flex h-full w-full" style={{ background: 'var(--bg)' }}>
        <Sidebar
          workspaces={workspaces}
          activeWorkspaceId={activeId}
          nodesByWorkspace={nodesByWorkspace}
          selectedTerminalId={selectedTerminalId}
          collapsed={sidebarCollapsed}
          maxWorkspaces={maxWorkspaces}
          onCollapsedChange={setSidebarCollapsed}
          onNewTerminal={() => {
            canvasRefs.current.get(activeId)?.openNewTerminalModal()
          }}
          onCreateWorkspace={createWorkspace}
          onRenameWorkspace={renameWorkspace}
          onDeleteWorkspace={deleteWorkspace}
          onDuplicateWorkspace={duplicateWorkspace}
          onReorderWorkspaces={reorderWorkspaces}
          onSetWorkspaceEnabled={setWorkspaceEnabled}
          onSwitchWorkspace={setActiveId}
          onSelectTerminal={handleSelectTerminal}
          onOpenSettings={() => setSettingsOpen(true)}
          onTerminalDuplicate={(workspaceId, terminalId) => {
            setActiveId(workspaceId)
            canvasRefs.current.get(workspaceId)?.duplicateTerminal(terminalId)
          }}
          onTerminalDelete={(workspaceId, terminalId) => {
            canvasRefs.current.get(workspaceId)?.deleteTerminal(terminalId)
          }}
          onTerminalToggleEnabled={(workspaceId, terminalId) => {
            canvasRefs.current.get(workspaceId)?.toggleTerminalEnabled(terminalId)
          }}
          onTerminalLink={(workspaceId, terminalId) => {
            setActiveId(workspaceId)
            canvasRefs.current.get(workspaceId)?.startLinkFrom(terminalId)
          }}
          onTerminalStyle={(workspaceId, terminalId) => {
            setActiveId(workspaceId)
            canvasRefs.current.get(workspaceId)?.openStyleEditor(terminalId)
          }}
          onTerminalEditPrompt={(workspaceId, terminalId) => {
            setActiveId(workspaceId)
            canvasRefs.current.get(workspaceId)?.openPromptEditor(terminalId)
          }}
          onTerminalOpenInVSCode={(_workspaceId, terminal) => {
            window.windowApi.openInVSCode(terminal.cwd)
          }}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          <Topbar
            workspaceName={activeWorkspaceName}
            terminalCount={activeTerminalCount}
          />

          <div className="flex-1 min-h-0 min-w-0 relative overflow-hidden">
            {activeWorkspaceDisabled && (
              <WorkspaceDisabledPlaceholder
                name={activeWorkspaceName}
                onEnable={() => setWorkspaceEnabled(activeId, true)}
              />
            )}
            {workspaces
              .filter((ws) => ws.enabled !== false)
              .map((ws) => (
              <WorkspaceCanvas
                key={ws.id}
                ref={(handle) => {
                  if (handle) canvasRefs.current.set(ws.id, handle)
                  else canvasRefs.current.delete(ws.id)
                }}
                workspace={ws}
                active={ws.id === activeId}
                shell={defaultShell}
                defaultProjectFolder={defaultProjectFolder}
                theme={theme}
                getTerminalStyle={getStyle}
                setTerminalStyle={setStyle}
                removeTerminalStyle={removeStyle}
                onNodesChange={(nodes) => handleNodesChange(ws.id, nodes)}
                pendingFocusId={
                  pendingFocus?.workspaceId === ws.id ? pendingFocus.terminalId : null
                }
                onFocusConsumed={() => setPendingFocus(null)}
                onTerminalSelected={(terminalId) => setSelectedTerminalId(terminalId)}
              />
            ))}
          </div>
        </main>

        {settingsOpen && (
          <SettingsModal
            theme={theme}
            defaultShell={defaultShell}
            defaultProjectFolder={defaultProjectFolder}
            maxWorkspaces={maxWorkspaces}
            onThemeChange={setTheme}
            onDefaultShellChange={setDefaultShell}
            onDefaultProjectFolderChange={setDefaultProjectFolder}
            onMaxWorkspacesChange={setMaxWorkspaces}
            onBackupImported={() => window.location.reload()}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </div>
    </PtyActivityProvider>
  )
}

function WorkspaceDisabledPlaceholder({
  name,
  onEnable,
}: {
  name: string
  onEnable: () => void
}): JSX.Element {
  return (
    <div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 select-none"
      style={{ background: 'var(--bg)', color: 'var(--fg-3)' }}
    >
      <span style={{ opacity: 0.5 }}>
        <IPower size={36} />
      </span>
      <div className="text-center">
        <div className="text-[14px]" style={{ color: 'var(--fg-2)' }}>
          “{name}” is deactivated
        </div>
        <div className="text-[12px] mt-1">
          Its terminals and notes are turned off to save RAM/CPU.
        </div>
      </div>
      <button
        className="text-[12.5px] px-4 py-2 rounded-[8px]"
        style={{
          border: '1px solid var(--accent)',
          color: 'var(--accent)',
          background: 'color-mix(in oklch, var(--accent) 10%, transparent)',
        }}
        onClick={onEnable}
      >
        Activate workspace
      </button>
    </div>
  )
}
