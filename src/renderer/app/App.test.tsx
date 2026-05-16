import '@testing-library/jest-dom/vitest'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { type ReactNode, useCallback, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EdgeRecord } from '@shared/types/terminal'
import type { CanvasTheme } from '@renderer/features/canvas/types'
import type { TerminalNodeData, TerminalStyle } from '@renderer/features/terminals/types'

const initialNodes: TerminalNodeData[] = [
  {
    id: 'node-a',
    x: 40,
    y: 50,
    width: 600,
    height: 380,
    shell: 'default',
    title: 'Alpha',
    cwd: '/tmp/alpha',
    command: 'claude',
  },
  {
    id: 'node-b',
    x: 920,
    y: 260,
    width: 600,
    height: 380,
    shell: 'default',
    title: 'Beta',
    cwd: '/tmp/beta',
    command: 'codex',
  },
]

const initialEdges: EdgeRecord[] = [
  {
    id: 'edge-ab',
    source: 'node-a',
    target: 'node-b',
  },
]

const mockState = vi.hoisted(() => {
  const terminalStyles: Record<string, Partial<TerminalStyle>> = {
    'node-a': { theme: 'light', fontSize: 17 },
  }

  const createTerminal = vi.fn()
  const moveNode = vi.fn()
  const updateNode = vi.fn()
  const removeNode = vi.fn()
  const addEdge = vi.fn()
  const removeEdge = vi.fn()
  const setStyle = vi.fn()
  const removeStyle = vi.fn()

  function Sidebar({
    terminals,
    selectedId,
    theme,
    collapsed,
    onCollapsedChange,
    onNewTerminal,
    onSelect,
    onFocus,
    onStartLink,
    onToggleTheme,
  }: {
    terminals: TerminalNodeData[]
    selectedId: string | null
    theme: CanvasTheme
    query: string
    collapsed: boolean
    onCollapsedChange: (next: boolean) => void
    onQuery: (q: string) => void
    onNewTerminal: () => void
    onSelect: (id: string) => void
    onFocus: (id: string) => void
    onStartLink: (id: string) => void
    onToggleTheme: (t: CanvasTheme) => void
  }): JSX.Element {
    return (
      <aside data-testid="sidebar">
        <div data-testid="sidebar-state">{JSON.stringify({ selectedId, theme, collapsed })}</div>
        <div data-testid="sidebar-count">{terminals.length}</div>
        <button type="button" onClick={() => onCollapsedChange(!collapsed)}>
          Toggle sidebar
        </button>
        <button type="button" onClick={onNewTerminal}>
          New terminal
        </button>
        <button type="button" onClick={() => onSelect('node-a')}>
          Select node A
        </button>
        <button type="button" onClick={() => onFocus('node-a')}>
          Focus node A
        </button>
        <button type="button" onClick={() => onStartLink('node-a')}>
          Start link from A
        </button>
        <button type="button" onClick={() => onToggleTheme(theme === 'dark' ? 'light' : 'dark')}>
          Toggle theme from sidebar
        </button>
      </aside>
    )
  }

  function Topbar({
    terminalCount,
    theme,
    shell,
    onToggleTheme,
    onShellChange,
  }: {
    terminalCount: number
    theme: CanvasTheme
    shell: 'default' | 'bash' | 'zsh'
    onToggleTheme: () => void
    onShellChange: (s: 'default' | 'bash' | 'zsh') => void
  }): JSX.Element {
    return (
      <header data-testid="topbar">
        <div data-testid="topbar-state">{JSON.stringify({ terminalCount, theme, shell })}</div>
        <button type="button" title="Toggle theme" onClick={onToggleTheme}>
          Toggle theme
        </button>
        <button type="button" onClick={() => onShellChange('bash')}>
          Bash
        </button>
      </header>
    )
  }

  function Canvas({
    nodes,
    selectedIds,
    selectedEdgeId,
    focusedId,
    linkSource,
    tool,
    onSelect,
    onSelectEdge,
    onSelectMany,
    onLinkPick,
    onSetTool,
    onNodeContextMenu,
    onCanvasContextMenu,
  }: {
    nodes: TerminalNodeData[]
    edges: EdgeRecord[]
    selectedIds: string[]
    selectedEdgeId: string | null
    focusedId: string | null
    focusRequest: string | null
    linkSource: string | null
    tool: 'select' | 'pan' | 'link' | 'delete'
    contextMenuNodeId: string | null
    onSelect: (id: string | null, additive: boolean) => void
    onSelectEdge: (id: string | null) => void
    onSelectMany: (ids: string[]) => void
    onFocusConsumed: () => void
    onMoveNode: (id: string, patch: Partial<TerminalNodeData>) => void
    onUpdateNode: (id: string, patch: Partial<TerminalNodeData>) => void
    onRemoveNode: (id: string) => void
    onLinkPick: (id: string) => void
    onSetTool: (t: 'select' | 'pan' | 'link' | 'delete') => void
    onNodeContextMenu: (id: string, x: number, y: number) => void
    onCanvasContextMenu: (worldX: number, worldY: number, clientX: number, clientY: number) => void
    getTerminalStyle: (id: string) => TerminalStyle
  }): JSX.Element {
    return (
      <section data-testid="canvas">
        <div
          data-testid="canvas-state"
          data-selected-ids={selectedIds.join(',')}
          data-selected-edge-id={selectedEdgeId ?? ''}
          data-focused-id={focusedId ?? ''}
          data-link-source={linkSource ?? ''}
          data-tool={tool}
        />
        <button type="button" onClick={() => onSelect(null, false)}>
          Clear selection
        </button>
        <button type="button" onClick={() => onSelect('node-a', false)}>
          Select A
        </button>
        <button type="button" onClick={() => onSelect('node-b', false)}>
          Select B
        </button>
        <button type="button" onClick={() => onSelect('node-a', true)}>
          Toggle A
        </button>
        <button type="button" onClick={() => onSelect('node-b', true)}>
          Toggle B
        </button>
        <button type="button" onClick={() => onSelectMany(['node-a', 'node-b'])}>
          Select A+B
        </button>
        <button type="button" onClick={() => onSelectEdge('edge-ab')}>
          Select edge
        </button>
        <button type="button" onClick={() => onLinkPick('node-a')}>
          Pick A
        </button>
        <button type="button" onClick={() => onLinkPick('node-b')}>
          Pick B
        </button>
        <button type="button" onClick={() => onSetTool('delete')}>
          Delete tool
        </button>
        <button type="button" onClick={() => onNodeContextMenu('node-a', 12, 34)}>
          Node menu A
        </button>
        <button type="button" onClick={() => onCanvasContextMenu(1110, 2220, 72, 84)}>
          Canvas menu
        </button>
        <button type="button" onClick={() => onFocusConsumed()}>
          Consume focus
        </button>
        <button type="button" onClick={() => onMoveNode('node-a', { x: 99, y: 88 })}>
          Move A
        </button>
        <button type="button" onClick={() => onUpdateNode('node-a', { title: 'Updated' })}>
          Update A
        </button>
        <button type="button" onClick={() => onRemoveNode('node-a')}>
          Remove A
        </button>
        <div data-testid="canvas-nodes">{nodes.map((node) => node.id).join(',')}</div>
      </section>
    )
  }

  function NewTerminalModal({
    onCancel,
    onConfirm,
  }: {
    onCancel: () => void
    onConfirm: (folder: string, command: 'codex' | 'claude', name: string) => void
  }): JSX.Element {
    return (
      <div data-testid="new-terminal-modal">
        <button type="button" onClick={onCancel}>
          Cancel modal
        </button>
        <button type="button" onClick={() => onConfirm('/tmp/workspace', 'claude', '')}>
          Confirm modal
        </button>
      </div>
    )
  }

  function TerminalStyleModal({
    terminalTitle,
    onChange,
    onReset,
    onClose,
  }: {
    terminalTitle: string
    value: TerminalStyle
    onChange: (patch: Partial<TerminalStyle>) => void
    onReset: () => void
    onClose: () => void
  }): JSX.Element {
    return (
      <div data-testid="style-modal">
        <div>{`Style · ${terminalTitle}`}</div>
        <button type="button" onClick={onChange.bind(null, { fontSize: 19 })}>
          Change style
        </button>
        <button type="button" onClick={onReset}>
          Reset style
        </button>
        <button type="button" onClick={onClose}>
          Close style
        </button>
      </div>
    )
  }

  return {
    createTerminal,
    moveNode,
    updateNode,
    removeNode,
    addEdge,
    removeEdge,
    setStyle,
    removeStyle,
    terminalStyles,
    Sidebar,
    Topbar,
    Canvas,
    NewTerminalModal,
    TerminalStyleModal,
  }
})

vi.mock('@renderer/app/components/Sidebar', () => ({
  Sidebar: mockState.Sidebar,
}))

vi.mock('@renderer/app/components/Topbar', () => ({
  Topbar: mockState.Topbar,
}))

vi.mock('@renderer/features/canvas/components/Canvas', () => ({
  Canvas: mockState.Canvas,
}))

vi.mock('@renderer/features/terminals/components/NewTerminalModal', () => ({
  NewTerminalModal: mockState.NewTerminalModal,
}))

vi.mock('@renderer/features/terminals/components/TerminalStyleModal', () => ({
  TerminalStyleModal: mockState.TerminalStyleModal,
}))

vi.mock('@renderer/features/terminals/hooks/useTerminals', () => ({
  useTerminals: () => {
    const [nodes, setNodes] = useState<TerminalNodeData[]>(initialNodes)

    const createTerminal = useCallback(
      (
        folder: string,
        command: 'codex' | 'claude',
        name: string,
        shell: 'default' | 'bash' | 'zsh',
        position?: { x: number; y: number },
      ) => {
        mockState.createTerminal(folder, command, name, shell, position)
        setNodes((prev) => [
          ...prev,
          {
            id: `node-${prev.length + 1}`,
            x: position?.x ?? 40,
            y: position?.y ?? 40,
            width: 600,
            height: 380,
            shell,
            title: name || 'New terminal',
            cwd: folder,
            command,
          },
        ])
      },
      [],
    )

    const moveNode = useCallback((id: string, patch: Partial<TerminalNodeData>) => {
      mockState.moveNode(id, patch)
      setNodes((prev) => prev.map((node) => (node.id === id ? { ...node, ...patch } : node)))
    }, [])

    const updateNode = useCallback((id: string, patch: Partial<TerminalNodeData>) => {
      mockState.updateNode(id, patch)
      setNodes((prev) => prev.map((node) => (node.id === id ? { ...node, ...patch } : node)))
    }, [])

    const removeNode = useCallback((id: string) => {
      mockState.removeNode(id)
      setNodes((prev) => prev.filter((node) => node.id !== id))
    }, [])

    return { nodes, createTerminal, moveNode, updateNode, removeNode }
  },
}))

vi.mock('@renderer/features/canvas/hooks/useEdges', () => ({
  useEdges: () => {
    const [edges, setEdges] = useState<EdgeRecord[]>(initialEdges)

    const addEdge = useCallback((source: string, target: string) => {
      mockState.addEdge(source, target)
      setEdges((prev) => [
        ...prev,
        {
          id: `edge-${prev.length + 1}`,
          source,
          target,
        },
      ])
    }, [])

    const removeEdge = useCallback((id: string) => {
      mockState.removeEdge(id)
      setEdges((prev) => prev.filter((edge) => edge.id !== id))
    }, [])

    return { edges, addEdge, removeEdge }
  },
}))

vi.mock('@renderer/features/terminals/hooks/useTerminalStyles', () => ({
  useTerminalStyles: () => {
    const [styles, setStyles] = useState<Record<string, Partial<TerminalStyle>>>(
      mockState.terminalStyles,
    )

    const getStyle = useCallback(
      (id: string): TerminalStyle => ({
        theme: 'dark',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 13,
        ...styles[id],
      }),
      [styles],
    )

    const setStyle = useCallback((id: string, patch: Partial<TerminalStyle>) => {
      mockState.setStyle(id, patch)
      setStyles((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          ...patch,
        },
      }))
    }, [])

    const removeStyle = useCallback((id: string) => {
      mockState.removeStyle(id)
      setStyles((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    }, [])

    return { getStyle, setStyle, removeStyle }
  },
}))

import App from './App'

function renderApp(): void {
  render(<App />)
}

function getCanvasState(): HTMLDivElement {
  const el = screen.getByTestId('canvas-state')
  if (!(el instanceof HTMLDivElement)) {
    throw new Error('canvas state element missing')
  }
  return el
}

function openNodeMenu(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Node menu A' }))
}

function openCanvasMenu(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Canvas menu' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  document.documentElement.className = ''
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('App composition', () => {
  it.each([
    ['Ctrl', { ctrlKey: true }],
    ['Cmd', { metaKey: true }],
  ] as const)('%s+N opens the new terminal modal', async (_label, keyMods) => {
    renderApp()

    fireEvent.keyDown(window, { key: 'n', ...keyMods })

    expect(await screen.findByTestId('new-terminal-modal')).toBeInTheDocument()
  })

  it('Escape in link or delete mode returns to select and clears linkSource', () => {
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: 'Start link from A' }))
    expect(getCanvasState()).toHaveAttribute('data-tool', 'link')
    expect(getCanvasState()).toHaveAttribute('data-link-source', 'node-a')

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(getCanvasState()).toHaveAttribute('data-tool', 'select')
    expect(getCanvasState()).toHaveAttribute('data-link-source', '')

    fireEvent.click(screen.getByRole('button', { name: 'Delete tool' }))
    expect(getCanvasState()).toHaveAttribute('data-tool', 'delete')

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(getCanvasState()).toHaveAttribute('data-tool', 'select')
    expect(getCanvasState()).toHaveAttribute('data-link-source', '')
  })

  it('Delete removes the selected edge before any node selection', () => {
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: 'Select A+B' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select edge' }))
    fireEvent.keyDown(window, { key: 'Delete' })

    expect(mockState.removeEdge).toHaveBeenCalledTimes(1)
    expect(mockState.removeEdge).toHaveBeenCalledWith('edge-ab')
    expect(mockState.removeNode).not.toHaveBeenCalled()
  })

  it('Delete removes every selected node and its style entries', () => {
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: 'Select A+B' }))
    fireEvent.keyDown(window, { key: 'Delete' })

    expect(mockState.removeNode).toHaveBeenCalledTimes(2)
    expect(mockState.removeNode).toHaveBeenNthCalledWith(1, 'node-a')
    expect(mockState.removeNode).toHaveBeenNthCalledWith(2, 'node-b')
    expect(mockState.removeStyle).toHaveBeenCalledTimes(2)
    expect(mockState.removeStyle).toHaveBeenNthCalledWith(1, 'node-a')
    expect(mockState.removeStyle).toHaveBeenNthCalledWith(2, 'node-b')
  })

  it.each(['input', 'textarea', 'contentEditable'] as const)(
    'Delete in %s is ignored',
    (mode) => {
      renderApp()

      fireEvent.click(screen.getByRole('button', { name: 'Select A+B' }))

      let target: HTMLElement
      if (mode === 'input') {
        target = document.createElement('input')
      } else if (mode === 'textarea') {
        target = document.createElement('textarea')
      } else {
        target = document.createElement('div')
        target.contentEditable = 'true'
        Object.defineProperty(target, 'isContentEditable', {
          value: true,
        })
      }
      document.body.appendChild(target)

      fireEvent.keyDown(target, { key: 'Delete' })

      expect(mockState.removeNode).not.toHaveBeenCalled()
      expect(mockState.removeEdge).not.toHaveBeenCalled()
      expect(mockState.removeStyle).not.toHaveBeenCalled()
    },
  )

  it('startLinkFrom activates link mode and stores the source node', () => {
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: 'Start link from A' }))

    expect(getCanvasState()).toHaveAttribute('data-tool', 'link')
    expect(getCanvasState()).toHaveAttribute('data-link-source', 'node-a')
  })

  it('handleLinkPick sets the source when linkSource is null', () => {
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: 'Pick A' }))

    expect(getCanvasState()).toHaveAttribute('data-link-source', 'node-a')
    expect(getCanvasState()).toHaveAttribute('data-tool', 'select')
  })

  it('handleLinkPick adds an edge when a source already exists and returns to select', () => {
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: 'Start link from A' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pick B' }))

    expect(mockState.addEdge).toHaveBeenCalledTimes(1)
    expect(mockState.addEdge).toHaveBeenCalledWith('node-a', 'node-b')
    expect(getCanvasState()).toHaveAttribute('data-tool', 'select')
    expect(getCanvasState()).toHaveAttribute('data-link-source', '')
  })

  it('handleLinkPick with the same id does not create a self-loop and still resets the tool', () => {
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: 'Start link from A' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pick A' }))

    expect(mockState.addEdge).not.toHaveBeenCalled()
    expect(getCanvasState()).toHaveAttribute('data-tool', 'select')
    expect(getCanvasState()).toHaveAttribute('data-link-source', '')
  })

  it('selectNode(null) clears the selection', () => {
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: 'Select A' }))
    expect(getCanvasState()).toHaveAttribute('data-selected-ids', 'node-a')

    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }))

    expect(getCanvasState()).toHaveAttribute('data-selected-ids', '')
  })

  it('selectNode(id, false) replaces the selection', () => {
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: 'Select A' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select B' }))

    expect(getCanvasState()).toHaveAttribute('data-selected-ids', 'node-b')
  })

  it('selectNode(id, true) toggles the node in the selection set', () => {
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: 'Select A' }))
    fireEvent.click(screen.getByRole('button', { name: 'Toggle B' }))
    expect(getCanvasState()).toHaveAttribute('data-selected-ids', 'node-a,node-b')

    fireEvent.click(screen.getByRole('button', { name: 'Toggle B' }))
    expect(getCanvasState()).toHaveAttribute('data-selected-ids', 'node-a')
  })

  it('selectEdge(id) clears the node selection', () => {
    renderApp()

    fireEvent.click(screen.getByRole('button', { name: 'Select A+B' }))
    expect(getCanvasState()).toHaveAttribute('data-selected-ids', 'node-a,node-b')

    fireEvent.click(screen.getByRole('button', { name: 'Select edge' }))

    expect(getCanvasState()).toHaveAttribute('data-selected-ids', '')
    expect(getCanvasState()).toHaveAttribute('data-selected-edge-id', 'edge-ab')
  })

  it('node context menu stores the node id and coordinates', async () => {
    renderApp()

    openNodeMenu()

    const menu = await screen.findByText('Link to another terminal')
    const container = menu.closest('div[style]') as HTMLDivElement | null

    expect(container).toBeTruthy()
    expect(container).toHaveStyle({ left: '12px', top: '34px' })

    fireEvent.click(menu)

    expect(getCanvasState()).toHaveAttribute('data-tool', 'link')
    expect(getCanvasState()).toHaveAttribute('data-link-source', 'node-a')
  })

  it('canvas context menu stores world and client coordinates', async () => {
    renderApp()

    openCanvasMenu()

    const menu = await screen.findByText('New terminal here')
    const container = menu.closest('div[style]') as HTMLDivElement | null

    expect(container).toBeTruthy()
    expect(container).toHaveStyle({ left: '72px', top: '84px' })

    fireEvent.click(menu)

    expect(await screen.findByTestId('new-terminal-modal')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm modal' }))

    expect(mockState.createTerminal).toHaveBeenCalledTimes(1)
    expect(mockState.createTerminal).toHaveBeenCalledWith(
      '/tmp/workspace',
      'claude',
      '',
      'default',
      { x: 1110, y: 2220 },
    )
  })

  it('theme toggle persists to localStorage and updates the document dark class', async () => {
    localStorage.setItem('canvasTheme', JSON.stringify('dark'))

    renderApp()

    await waitFor(() => expect(document.documentElement).toHaveClass('dark'))

    fireEvent.click(screen.getByRole('button', { name: 'Toggle theme' }))

    await waitFor(() => expect(document.documentElement).not.toHaveClass('dark'))
    expect(localStorage.getItem('canvasTheme')).toBe(JSON.stringify('light'))

    fireEvent.click(screen.getByRole('button', { name: 'Toggle theme' }))

    await waitFor(() => expect(document.documentElement).toHaveClass('dark'))
    expect(localStorage.getItem('canvasTheme')).toBe(JSON.stringify('dark'))
  })

  it('canceling the New terminal modal resets pendingCreatePos', async () => {
    renderApp()

    openCanvasMenu()
    fireEvent.click(await screen.findByText('New terminal here'))
    await screen.findByTestId('new-terminal-modal')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel modal' }))

    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }))
    expect(await screen.findByTestId('new-terminal-modal')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm modal' }))

    expect(mockState.createTerminal).toHaveBeenCalledTimes(1)
    expect(mockState.createTerminal).toHaveBeenCalledWith(
      '/tmp/workspace',
      'claude',
      '',
      'default',
      undefined,
    )
  })

  it('keeps the style editor mounted only while the target node still exists', async () => {
    renderApp()

    openNodeMenu()
    fireEvent.click(await screen.findByText('Customize style…'))
    expect(await screen.findByTestId('style-modal')).toBeInTheDocument()
    expect(screen.getByText('Style · Alpha')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Select node A' }))
    fireEvent.keyDown(window, { key: 'Delete' })

    await waitFor(() => expect(screen.queryByTestId('style-modal')).not.toBeInTheDocument())
  })
})
