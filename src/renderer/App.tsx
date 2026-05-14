import { useEffect, useState } from 'react'
import Canvas from './components/Canvas'
import NewTerminalModal from './components/NewTerminalModal'
import { COMMANDS, type CommandKey } from './commands'

export type ShellType = 'default' | 'bash' | 'zsh'
export type CanvasTheme = 'dark' | 'light'

export interface TerminalNodeData {
  id: string
  x: number
  y: number
  width: number
  height: number
  shell: ShellType
  title: string
  cwd: string
  command: CommandKey
}

let counter = 0

export default function App(): JSX.Element {
  const [nodes, setNodes] = useState<TerminalNodeData[]>([])
  const [shell, setShell] = useState<ShellType>('default')
  const [theme, setTheme] = useState<CanvasTheme>(
    () => (localStorage.getItem('canvasTheme') as CanvasTheme) || 'dark'
  )
  const [modalOpen, setModalOpen] = useState(false)

  // Restore the terminals that were active in the previous session.
  useEffect(() => {
    window.dbApi.listActive().then((rows) => {
      setNodes(
        rows.map((r) => ({
          id: r.id,
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          shell: r.shell as ShellType,
          title: r.title,
          cwd: r.cwd,
          command: r.command as CommandKey
        }))
      )
    })
  }, [])

  useEffect(() => {
    localStorage.setItem('canvasTheme', theme)
  }, [theme])

  function persist(node: TerminalNodeData): void {
    window.dbApi.upsert({
      id: node.id,
      title: node.title,
      cwd: node.cwd,
      command: node.command,
      shell: node.shell,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height
    })
  }

  function createTerminal(folder: string, command: CommandKey, name: string): void {
    setModalOpen(false)
    counter += 1
    const id = `term-${Date.now()}-${counter}`
    const folderName = folder.split('/').filter(Boolean).pop() || folder
    const node: TerminalNodeData = {
      id,
      x: 40 + ((nodes.length * 30) % 300),
      y: 40 + ((nodes.length * 30) % 300),
      width: 600,
      height: 380,
      shell,
      title: name || `${COMMANDS[command].label} · ${folderName}`,
      cwd: folder,
      command
    }
    setNodes((prev) => [...prev, node])
    persist(node)
  }

  function updateNode(id: string, patch: Partial<TerminalNodeData>): void {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== id) return n
        const next = { ...n, ...patch }
        persist(next)
        return next
      })
    )
  }

  function removeNode(id: string): void {
    window.ptyApi.kill(id)
    window.dbApi.remove(id)
    setNodes((prev) => prev.filter((n) => n.id !== id))
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-slate-700 bg-slate-900 px-4 py-2">
        <h1 className="text-sm font-semibold text-slate-100">IGO</h1>
        <button
          onClick={() => setModalOpen(true)}
          className="rounded bg-emerald-600 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-500"
        >
          + New terminal
        </button>
        <label className="ml-auto flex items-center gap-2 text-xs text-slate-300">
          Shell:
          <select
            value={shell}
            onChange={(e) => setShell(e.target.value as ShellType)}
            className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-100"
          >
            <option value="default">System default</option>
            <option value="bash">bash</option>
            <option value="zsh">zsh</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-300">
          Theme:
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as CanvasTheme)}
            className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-100"
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
        <span className="text-xs text-slate-500">
          {nodes.length} {nodes.length === 1 ? 'terminal' : 'terminals'}
        </span>
      </header>

      <Canvas
        nodes={nodes}
        theme={theme}
        onUpdateNode={updateNode}
        onRemoveNode={removeNode}
      />

      {modalOpen && (
        <NewTerminalModal onCancel={() => setModalOpen(false)} onConfirm={createTerminal} />
      )}
    </div>
  )
}
