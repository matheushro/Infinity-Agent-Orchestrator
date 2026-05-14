// Application shell: composes the toolbar, canvas and modals. Holds only
// view-level UI state — terminal domain logic lives in the terminals feature.
import { useState } from 'react'
import { Toolbar } from './components/Toolbar'
import { Canvas } from '@renderer/features/canvas/components/Canvas'
import { NewTerminalModal } from '@renderer/features/terminals/components/NewTerminalModal'
import { useTerminals } from '@renderer/features/terminals/hooks/useTerminals'
import { useLocalStorage } from '@renderer/hooks/useLocalStorage'
import type { ShellType } from '@renderer/features/terminals/types'
import type { CanvasTheme } from '@renderer/features/canvas/types'

export default function App(): JSX.Element {
  const { nodes, createTerminal, updateNode, removeNode } = useTerminals()
  const [shell, setShell] = useState<ShellType>('default')
  const [theme, setTheme] = useLocalStorage<CanvasTheme>('canvasTheme', 'dark')
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        shell={shell}
        theme={theme}
        terminalCount={nodes.length}
        onShellChange={setShell}
        onThemeChange={setTheme}
        onNewTerminal={() => setModalOpen(true)}
      />

      <Canvas
        nodes={nodes}
        theme={theme}
        onUpdateNode={updateNode}
        onRemoveNode={removeNode}
      />

      {modalOpen && (
        <NewTerminalModal
          onCancel={() => setModalOpen(false)}
          onConfirm={(folder, command, name) => {
            setModalOpen(false)
            createTerminal(folder, command, name, shell)
          }}
        />
      )}
    </div>
  )
}
