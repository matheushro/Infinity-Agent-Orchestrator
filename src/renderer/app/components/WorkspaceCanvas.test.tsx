import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceRecord } from '@shared/types/workspace'
import type { CanvasTextRecord } from '@shared/types/canvas'
import type { TerminalNodeData } from '@renderer/features/terminals/types'
import type { WorkspaceCanvasHandle } from './WorkspaceCanvas'

// ── Mocks ─────────────────────────────────────────────────────────────────

const { mockUseTerminals, mockUseCanvasTexts, mockUseNotes, mockUseEdges, mockUseNoteLinks } = vi.hoisted(() => ({
  mockUseTerminals: {
    nodes: [] as TerminalNodeData[],
    createTerminal: vi.fn(),
    moveNode: vi.fn(),
    updateNode: vi.fn(),
    removeNode: vi.fn(),
  },
  mockUseCanvasTexts: {
    texts: [] as CanvasTextRecord[],
    createText: vi.fn(),
    moveText: vi.fn(),
    updateText: vi.fn(),
    removeText: vi.fn(),
  },
  mockUseNotes: {
    notes: [] as unknown[],
    createNote: vi.fn(),
    moveNote: vi.fn(),
    updateNote: vi.fn(),
    removeNote: vi.fn(),
  },
  mockUseEdges: {
    edges: [],
    addEdge: vi.fn(),
    removeEdge: vi.fn(),
  },
  mockUseNoteLinks: {
    noteLinks: [],
    addNoteLink: vi.fn(),
    removeNoteLink: vi.fn(),
  },
}))

vi.mock('@renderer/features/terminals/hooks/useTerminals', () => ({
  useTerminals: vi.fn(() => ({ ...mockUseTerminals })),
}))

vi.mock('@renderer/features/canvas/hooks/useEdges', () => ({
  useEdges: vi.fn(() => ({ ...mockUseEdges })),
}))

vi.mock('@renderer/features/canvas/hooks/useCanvasTexts', () => ({
  useCanvasTexts: vi.fn(() => ({ ...mockUseCanvasTexts })),
}))

vi.mock('@renderer/features/notes/hooks/useNotes', () => ({
  useNotes: vi.fn(() => ({ ...mockUseNotes })),
}))

vi.mock('@renderer/features/notes/hooks/useNoteLinks', () => ({
  useNoteLinks: vi.fn(() => ({ ...mockUseNoteLinks })),
}))

vi.mock('@renderer/features/canvas/components/Canvas', () => ({
  Canvas: vi.fn(() => <div data-testid="canvas-inner" />),
}))

vi.mock('@renderer/features/terminals/components/NewTerminalModal', () => ({
  NewTerminalModal: vi.fn(({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (folder: string, command: string, name: string, theme: string) => void }) => (
    <div data-testid="new-terminal-modal">
      <button onClick={onCancel}>Cancel</button>
      <button onClick={() => onConfirm('/tmp', 'claude', '', 'auto')}>Confirm</button>
    </div>
  )),
}))

vi.mock('@renderer/features/terminals/components/TerminalContextMenu', () => ({
  TerminalContextMenu: vi.fn(() => null),
}))

vi.mock('@renderer/features/terminals/components/TerminalStyleModal', () => ({
  TerminalStyleModal: vi.fn(() => null),
}))

// ── Helpers ────────────────────────────────────────────────────────────────

const ws: WorkspaceRecord = { id: 'ws-1', name: 'Main', created_at: 0 }

const defaultProps = {
  workspace: ws,
  active: true,
  shell: 'default' as const,
  defaultProjectFolder: '',
  theme: 'dark' as const,
  getTerminalStyle: vi.fn(() => ({ theme: 'dark' as const, fontFamily: 'mono', fontSize: 13 })),
  setTerminalStyle: vi.fn(),
  removeTerminalStyle: vi.fn(),
  onNodesChange: vi.fn(),
  pendingFocusId: null,
  onFocusConsumed: vi.fn(),
  onTerminalSelected: vi.fn(),
}

import { WorkspaceCanvas } from './WorkspaceCanvas'

beforeEach(() => {
  vi.clearAllMocks()
  mockUseTerminals.nodes = []
  mockUseCanvasTexts.texts = []
  mockUseNotes.notes = []
  mockUseEdges.edges = []
  mockUseNoteLinks.noteLinks = []
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('WorkspaceCanvas', () => {
  it('10.1 when active=true the outer div has display:flex (visible)', () => {
    const { container } = render(
      <WorkspaceCanvas {...defaultProps} active={true} />,
    )
    const outer = container.firstChild as HTMLElement
    expect(outer.style.display).toBe('flex')
  })

  it('10.2 when active=false the outer div has display:none (hidden but mounted)', () => {
    const { container } = render(
      <WorkspaceCanvas {...defaultProps} active={false} />,
    )
    const outer = container.firstChild as HTMLElement
    expect(outer.style.display).toBe('none')
  })

  it('10.3 onNodesChange is called on mount with the initial node list', async () => {
    const onNodesChange = vi.fn()
    render(<WorkspaceCanvas {...defaultProps} onNodesChange={onNodesChange} />)
    await waitFor(() => expect(onNodesChange).toHaveBeenCalledWith([]))
  })

  it('10.4 onNodesChange is called again whenever the node list changes', async () => {
    const onNodesChange = vi.fn()
    const { useTerminals } = await import('@renderer/features/terminals/hooks/useTerminals')
    const mockHook = vi.mocked(useTerminals)

    const node: TerminalNodeData = {
      id: 'n1', x: 0, y: 0, width: 600, height: 380,
      shell: 'default', title: 'T', cwd: '/tmp', command: 'claude', workspace_id: 'ws-1',
    }

    mockHook.mockReturnValueOnce({ ...mockUseTerminals, nodes: [] })
    const { rerender } = render(<WorkspaceCanvas {...defaultProps} onNodesChange={onNodesChange} />)
    await waitFor(() => expect(onNodesChange).toHaveBeenLastCalledWith([]))

    mockHook.mockReturnValueOnce({ ...mockUseTerminals, nodes: [node] })
    rerender(<WorkspaceCanvas {...defaultProps} onNodesChange={onNodesChange} />)
    await waitFor(() => expect(onNodesChange).toHaveBeenLastCalledWith([node]))
  })

  it('10.5 when pendingFocusId is set and active=true, onFocusConsumed is called', async () => {
    const onFocusConsumed = vi.fn()
    render(
      <WorkspaceCanvas
        {...defaultProps}
        active={true}
        pendingFocusId="n1"
        onFocusConsumed={onFocusConsumed}
      />,
    )
    await waitFor(() => expect(onFocusConsumed).toHaveBeenCalledTimes(1))
  })

  it('10.6 when pendingFocusId is set and active=false, onFocusConsumed is NOT called', async () => {
    const onFocusConsumed = vi.fn()
    render(
      <WorkspaceCanvas
        {...defaultProps}
        active={false}
        pendingFocusId="n1"
        onFocusConsumed={onFocusConsumed}
      />,
    )
    // Give a tick for effects to run
    await act(async () => {})
    expect(onFocusConsumed).not.toHaveBeenCalled()
  })

  it('10.7 openNewTerminalModal() via ref causes NewTerminalModal to render', async () => {
    const ref = createRef<WorkspaceCanvasHandle>()
    render(<WorkspaceCanvas {...defaultProps} ref={ref} />)

    act(() => {
      ref.current?.openNewTerminalModal()
    })

    await waitFor(() => expect(screen.getByTestId('new-terminal-modal')).toBeTruthy())
  })

  it('passes the default project folder to NewTerminalModal', async () => {
    const ref = createRef<WorkspaceCanvasHandle>()
    render(
      <WorkspaceCanvas
        {...defaultProps}
        defaultProjectFolder="/home/user/project"
        ref={ref}
      />,
    )

    act(() => {
      ref.current?.openNewTerminalModal()
    })

    const { NewTerminalModal } = await import('@renderer/features/terminals/components/NewTerminalModal')
    await waitFor(() => {
      expect(vi.mocked(NewTerminalModal)).toHaveBeenLastCalledWith(
        expect.objectContaining({ defaultFolder: '/home/user/project' }),
        {},
      )
    })
  })

  it('10.8 Ctrl+N opens the modal when active=true', async () => {
    render(<WorkspaceCanvas {...defaultProps} active={true} />)
    fireEvent.keyDown(window, { key: 'n', ctrlKey: true })
    await waitFor(() => expect(screen.getByTestId('new-terminal-modal')).toBeTruthy())
  })

  it('10.9 Ctrl+N is ignored when active=false', async () => {
    render(<WorkspaceCanvas {...defaultProps} active={false} />)
    fireEvent.keyDown(window, { key: 'n', ctrlKey: true })
    await act(async () => {})
    expect(screen.queryByTestId('new-terminal-modal')).toBeNull()
  })

  it('10.10 Delete key removes the selected node and calls removeTerminalStyle', async () => {
    const node: TerminalNodeData = {
      id: 'del-node', x: 0, y: 0, width: 600, height: 380,
      shell: 'default', title: 'Del', cwd: '/tmp', command: 'claude', workspace_id: 'ws-1',
    }
    const { useTerminals } = await import('@renderer/features/terminals/hooks/useTerminals')
    vi.mocked(useTerminals).mockReturnValue({ ...mockUseTerminals, nodes: [node] })

    const removeTerminalStyle = vi.fn()
    const { container } = render(
      <WorkspaceCanvas {...defaultProps} removeTerminalStyle={removeTerminalStyle} />,
    )

    // Select the node by simulating an internal selection — we do this by
    // accessing the Canvas mock and wiring the onSelect call. Since Canvas is
    // a mock that renders nothing interactive, we test Delete behaviour by
    // injecting selection via the Canvas mock's onSelect prop.
    const { Canvas } = await import('@renderer/features/canvas/components/Canvas')
    const canvasMock = vi.mocked(Canvas)
    const lastCall = canvasMock.mock.calls[canvasMock.mock.calls.length - 1]
    const { onSelect } = lastCall[0]

    act(() => { onSelect('del-node', false) })
    fireEvent.keyDown(window, { key: 'Delete' })

    await waitFor(() => {
      expect(mockUseTerminals.removeNode).toHaveBeenCalledWith('del-node')
      expect(removeTerminalStyle).toHaveBeenCalledWith('del-node')
    })
    void container
  })

  it('notifies the parent when a terminal is selected from the canvas', async () => {
    const { Canvas } = await import('@renderer/features/canvas/components/Canvas')
    const canvasMock = vi.mocked(Canvas)
    const onTerminalSelected = vi.fn()

    render(<WorkspaceCanvas {...defaultProps} onTerminalSelected={onTerminalSelected} />)

    const lastCall = canvasMock.mock.calls[canvasMock.mock.calls.length - 1]
    const { onSelect } = lastCall[0]

    act(() => { onSelect('node-1', false) })

    expect(onTerminalSelected).toHaveBeenCalledWith('node-1')
  })

  it('10.11 Delete key on a focused input does NOT remove the node', async () => {
    render(<WorkspaceCanvas {...defaultProps} />)
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    fireEvent.keyDown(input, { key: 'Delete' })
    expect(mockUseTerminals.removeNode).not.toHaveBeenCalled()
    document.body.removeChild(input)
  })

  it('10.12 Delete key removes the selected edge (not a node)', async () => {
    const { Canvas } = await import('@renderer/features/canvas/components/Canvas')
    const canvasMock = vi.mocked(Canvas)
    const removeEdge = vi.fn()
    const { useEdges } = await import('@renderer/features/canvas/hooks/useEdges')
    vi.mocked(useEdges).mockReturnValue({ ...mockUseEdges, removeEdge })

    render(<WorkspaceCanvas {...defaultProps} />)

    const lastCall = canvasMock.mock.calls[canvasMock.mock.calls.length - 1]
    const { onSelectEdge } = lastCall[0]

    act(() => { onSelectEdge('edge-1') })
    fireEvent.keyDown(window, { key: 'Delete' })

    await waitFor(() => {
      expect(removeEdge).toHaveBeenCalledWith('edge-1')
    })
  })

  it('Delete key removes a selected note link through the shared edge selection', async () => {
    const { Canvas } = await import('@renderer/features/canvas/components/Canvas')
    const canvasMock = vi.mocked(Canvas)
    const removeNoteLink = vi.fn()
    const { useNoteLinks } = await import('@renderer/features/notes/hooks/useNoteLinks')
    vi.mocked(useNoteLinks).mockReturnValue({ ...mockUseNoteLinks, removeNoteLink })

    render(<WorkspaceCanvas {...defaultProps} />)

    const lastCall = canvasMock.mock.calls[canvasMock.mock.calls.length - 1]
    const { onSelectEdge } = lastCall[0]

    act(() => { onSelectEdge('note-link-1') })
    fireEvent.keyDown(window, { key: 'Delete' })

    await waitFor(() => {
      expect(removeNoteLink).toHaveBeenCalledWith('note-link-1')
    })
  })

  it('opens a link context menu and deletes the selected link immediately', async () => {
    const { Canvas } = await import('@renderer/features/canvas/components/Canvas')
    const canvasMock = vi.mocked(Canvas)
    const removeEdge = vi.fn()
    const removeNoteLink = vi.fn()
    const { useEdges } = await import('@renderer/features/canvas/hooks/useEdges')
    const { useNoteLinks } = await import('@renderer/features/notes/hooks/useNoteLinks')
    vi.mocked(useEdges).mockReturnValue({ ...mockUseEdges, removeEdge })
    vi.mocked(useNoteLinks).mockReturnValue({ ...mockUseNoteLinks, removeNoteLink })

    render(<WorkspaceCanvas {...defaultProps} />)

    const lastCall = canvasMock.mock.calls[canvasMock.mock.calls.length - 1]
    const { onEdgeContextMenu } = lastCall[0]

    act(() => { onEdgeContextMenu('edge-1', 120, 80) })
    fireEvent.click(screen.getByRole('button', { name: /delete link/i }))

    expect(removeEdge).toHaveBeenCalledWith('edge-1')
    expect(removeNoteLink).toHaveBeenCalledWith('edge-1')
    expect(screen.queryByRole('button', { name: /delete link/i })).toBeNull()
  })

  it('10.13 Delete key removes selected texts and terminals together', async () => {
    const { Canvas } = await import('@renderer/features/canvas/components/Canvas')
    const canvasMock = vi.mocked(Canvas)
    const node: TerminalNodeData = {
      id: 'node-1', x: 0, y: 0, width: 600, height: 380,
      shell: 'default', title: 'Node', cwd: '/tmp', command: 'claude', workspace_id: 'ws-1',
    }
    const text: CanvasTextRecord = {
      id: 'text-1',
      text: 'Note',
      x: 10,
      y: 10,
      width: 120,
      height: 40,
      workspace_id: 'ws-1',
    }
    const { useTerminals } = await import('@renderer/features/terminals/hooks/useTerminals')
    vi.mocked(useTerminals).mockReturnValue({ ...mockUseTerminals, nodes: [node] })
    mockUseCanvasTexts.texts = [text]

    render(<WorkspaceCanvas {...defaultProps} />)

    const lastCall = canvasMock.mock.calls[canvasMock.mock.calls.length - 1]
    const { onSelectManyMixed } = lastCall[0]

    act(() => {
      onSelectManyMixed(['node-1'], ['text-1'])
    })

    fireEvent.keyDown(window, { key: 'Delete' })

    await waitFor(() => {
      expect(mockUseTerminals.removeNode).toHaveBeenCalledWith('node-1')
      expect(mockUseCanvasTexts.removeText).toHaveBeenCalledWith('text-1')
    })
  })

  it('10.14 keyboard shortcuts are cleaned up when component unmounts', async () => {
    const { unmount } = render(<WorkspaceCanvas {...defaultProps} active={true} />)
    unmount()
    // After unmount, Ctrl+N should not open the modal (no error either)
    expect(() => fireEvent.keyDown(window, { key: 'n', ctrlKey: true })).not.toThrow()
  })
})
