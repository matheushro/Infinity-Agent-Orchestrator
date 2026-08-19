import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceRecord } from '@shared/types/workspace'
import type { CanvasTextRecord } from '@shared/types/canvas'
import type { TerminalNodeData } from '@renderer/features/terminals/types'
import type { TerminalSettingsDraft } from '@renderer/features/terminals/components/TerminalSettingsModal'
import type { WorkspaceCanvasHandle } from './WorkspaceCanvas'

// ── Mocks ─────────────────────────────────────────────────────────────────

const { mockUseTerminals, mockUseCanvasTexts, mockUseNotes, mockUseEdges, mockUseNoteLinks } = vi.hoisted(() => ({
  mockUseTerminals: {
    nodes: [] as TerminalNodeData[],
    createTerminal: vi.fn(),
    duplicateTerminal: vi.fn(),
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

// The one dialog now covers create and edit; `createDraft` stays real so the
// create defaults (folder, agent, style) still flow through it.
vi.mock('@renderer/features/terminals/components/TerminalSettingsModal', async () => {
  const actual = await vi.importActual<
    typeof import('@renderer/features/terminals/components/TerminalSettingsModal')
  >('@renderer/features/terminals/components/TerminalSettingsModal')

  return {
    ...actual,
    TerminalSettingsModal: vi.fn(
      ({
        mode,
        initial,
        onCancel,
        onConfirm,
      }: {
        mode: 'create' | 'edit'
        initial: TerminalSettingsDraft
        onCancel: () => void
        onConfirm: (draft: TerminalSettingsDraft) => void
      }) => (
        <div data-testid="terminal-settings-modal" data-mode={mode}>
          <button onClick={onCancel}>Cancel</button>
          <button
            onClick={() =>
              onConfirm({ ...initial, prompt: 'You are a reviewer.', model: 'opus' })
            }
          >
            Confirm
          </button>
        </div>
      ),
    ),
  }
})

vi.mock('@renderer/features/terminals/components/TerminalContextMenu', () => ({
  TerminalContextMenu: vi.fn(() => null),
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

  it('10.7 openNewTerminalModal() via ref causes TerminalSettingsModal to render', async () => {
    const ref = createRef<WorkspaceCanvasHandle>()
    render(<WorkspaceCanvas {...defaultProps} ref={ref} />)

    act(() => {
      ref.current?.openNewTerminalModal()
    })

    await waitFor(() => expect(screen.getByTestId('terminal-settings-modal')).toBeTruthy())
  })

  it('opens the settings dialog in create mode with the default project folder', async () => {
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

    const { TerminalSettingsModal } = await import(
      '@renderer/features/terminals/components/TerminalSettingsModal'
    )
    await waitFor(() => {
      expect(vi.mocked(TerminalSettingsModal)).toHaveBeenLastCalledWith(
        expect.objectContaining({
          mode: 'create',
          initial: expect.objectContaining({ folder: '/home/user/project' }),
        }),
        {},
      )
    })
  })

  it('duplicates a terminal via ref and copies its visual style', () => {
    const ref = createRef<WorkspaceCanvasHandle>()
    const getTerminalStyle = vi.fn(() => ({
      theme: 'light' as const,
      fontFamily: 'JetBrains Mono',
      fontSize: 15,
    }))
    const setTerminalStyle = vi.fn()
    mockUseTerminals.duplicateTerminal.mockReturnValue('node-copy')

    render(
      <WorkspaceCanvas
        {...defaultProps}
        ref={ref}
        getTerminalStyle={getTerminalStyle}
        setTerminalStyle={setTerminalStyle}
      />,
    )

    act(() => {
      ref.current?.duplicateTerminal('node-1')
    })

    expect(mockUseTerminals.duplicateTerminal).toHaveBeenCalledWith('node-1')
    expect(getTerminalStyle).toHaveBeenCalledWith('node-1')
    expect(setTerminalStyle).toHaveBeenCalledWith('node-copy', {
      theme: 'light',
      fontFamily: 'JetBrains Mono',
      fontSize: 15,
    })
  })

  it('creates the terminal with the agent prompt and model from the dialog', async () => {
    const ref = createRef<WorkspaceCanvasHandle>()
    mockUseTerminals.createTerminal.mockReturnValue('node-new')

    render(<WorkspaceCanvas {...defaultProps} defaultProjectFolder="/repo" ref={ref} />)

    act(() => {
      ref.current?.openNewTerminalModal()
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))

    // The prompt/model reach createTerminal directly, so the very first pty
    // launches in the role instead of needing a later edit + restart.
    expect(mockUseTerminals.createTerminal).toHaveBeenCalledWith(
      '/repo',
      'claude',
      '',
      'default',
      undefined,
      { prompt: 'You are a reviewer.', model: 'opus' },
    )
    expect(screen.queryByTestId('terminal-settings-modal')).toBeNull()
  })

  it('opens the dialog in edit mode prefilled from the terminal', async () => {
    const node: TerminalNodeData = {
      id: 'node-1', x: 0, y: 0, width: 600, height: 380,
      shell: 'default', title: 'Reviewer', cwd: '/repo', command: 'codex',
      prompt: 'old prompt', model: 'gpt-5.4', workspace_id: 'ws-1', enabled: true,
    }
    const { useTerminals } = await import('@renderer/features/terminals/hooks/useTerminals')
    vi.mocked(useTerminals).mockReturnValue({ ...mockUseTerminals, nodes: [node] })

    const ref = createRef<WorkspaceCanvasHandle>()
    render(<WorkspaceCanvas {...defaultProps} ref={ref} />)

    act(() => {
      ref.current?.openTerminalSettings('node-1')
    })

    const { TerminalSettingsModal } = await import(
      '@renderer/features/terminals/components/TerminalSettingsModal'
    )
    await waitFor(() => {
      expect(vi.mocked(TerminalSettingsModal)).toHaveBeenLastCalledWith(
        expect.objectContaining({
          mode: 'edit',
          initial: expect.objectContaining({
            name: 'Reviewer',
            folder: '/repo',
            command: 'codex',
            prompt: 'old prompt',
            model: 'gpt-5.4',
            style: { theme: 'dark', fontFamily: 'mono', fontSize: 13 },
          }),
        }),
        {},
      )
    })
  })

  it('saving an edit persists every field and restarts that terminal', async () => {
    const node: TerminalNodeData = {
      id: 'node-1', x: 0, y: 0, width: 600, height: 380,
      shell: 'default', title: 'Reviewer', cwd: '/repo', command: 'codex',
      prompt: 'old prompt', model: '', workspace_id: 'ws-1', enabled: true,
    }
    const { useTerminals } = await import('@renderer/features/terminals/hooks/useTerminals')
    vi.mocked(useTerminals).mockReturnValue({ ...mockUseTerminals, nodes: [node] })
    const { Canvas } = await import('@renderer/features/canvas/components/Canvas')
    const canvasMock = vi.mocked(Canvas)

    const ref = createRef<WorkspaceCanvasHandle>()
    render(<WorkspaceCanvas {...defaultProps} ref={ref} />)

    const before = canvasMock.mock.calls[canvasMock.mock.calls.length - 1][0]
    expect(before.getRestartSignal('node-1')).toBe(0)

    act(() => {
      ref.current?.openTerminalSettings('node-1')
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))

    expect(mockUseTerminals.updateNode).toHaveBeenCalledWith('node-1', {
      title: 'Reviewer',
      cwd: '/repo',
      command: 'codex',
      model: 'opus',
      prompt: 'You are a reviewer.',
    })

    // cwd/agent/model/prompt only reach the shell at launch, so the save has to
    // rebuild the session — otherwise the edit silently does nothing.
    await waitFor(() => {
      const after = canvasMock.mock.calls[canvasMock.mock.calls.length - 1][0]
      expect(after.getRestartSignal('node-1')).toBe(1)
    })
    expect(screen.queryByTestId('terminal-settings-modal')).toBeNull()
  })

  it('drops the style entry when the dialog leaves it on the defaults', async () => {
    const ref = createRef<WorkspaceCanvasHandle>()
    const removeTerminalStyle = vi.fn()
    const setTerminalStyle = vi.fn()
    mockUseTerminals.createTerminal.mockReturnValue('node-new')

    render(
      <WorkspaceCanvas
        {...defaultProps}
        ref={ref}
        setTerminalStyle={setTerminalStyle}
        removeTerminalStyle={removeTerminalStyle}
      />,
    )

    act(() => {
      ref.current?.openNewTerminalModal()
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))

    expect(setTerminalStyle).not.toHaveBeenCalled()
    expect(removeTerminalStyle).toHaveBeenCalledWith('node-new')
  })

  it('10.8 Ctrl+N opens the modal when active=true', async () => {
    render(<WorkspaceCanvas {...defaultProps} active={true} />)
    fireEvent.keyDown(window, { key: 'n', ctrlKey: true })
    await waitFor(() => expect(screen.getByTestId('terminal-settings-modal')).toBeTruthy())
  })

  it('10.9 Ctrl+N is ignored when active=false', async () => {
    render(<WorkspaceCanvas {...defaultProps} active={false} />)
    fireEvent.keyDown(window, { key: 'n', ctrlKey: true })
    await act(async () => {})
    expect(screen.queryByTestId('terminal-settings-modal')).toBeNull()
  })

  it('opens note search only for the selected note', async () => {
    const { Canvas } = await import('@renderer/features/canvas/components/Canvas')
    const canvasMock = vi.mocked(Canvas)
    render(<WorkspaceCanvas {...defaultProps} />)

    let lastCall = canvasMock.mock.calls[canvasMock.mock.calls.length - 1]
    act(() => {
      lastCall[0].onSelectNote('note-selected')
    })

    const event = new KeyboardEvent('keydown', {
      key: 'f',
      ctrlKey: true,
      cancelable: true,
    })
    window.dispatchEvent(event)

    await waitFor(() => {
      lastCall = canvasMock.mock.calls[canvasMock.mock.calls.length - 1]
      expect(lastCall[0].searchingNoteId).toBe('note-selected')
      expect(lastCall[0].noteSearchRequestId).toBe(1)
    })
    expect(event.defaultPrevented).toBe(true)
  })

  it('sets a note theme override from its right-click context menu', async () => {
    mockUseNotes.notes = [
      {
        id: 'note-1',
        title: 'Note',
        content: '',
        theme: 'auto',
        x: 0,
        y: 0,
        width: 280,
        height: 200,
        workspace_id: 'ws-1',
        created_at: 0,
        updated_at: 0,
      },
    ]
    const { Canvas } = await import('@renderer/features/canvas/components/Canvas')
    const canvasMock = vi.mocked(Canvas)
    render(<WorkspaceCanvas {...defaultProps} />)

    const lastCall = canvasMock.mock.calls[canvasMock.mock.calls.length - 1]
    act(() => {
      lastCall[0].onNoteContextMenu('note-1', 10, 20)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }))
    expect(mockUseNotes.updateNote).toHaveBeenCalledWith('note-1', { theme: 'dark' })
  })

  it('switches a note between rendered preview and Markdown source from that menu', async () => {
    mockUseNotes.notes = [
      {
        id: 'note-1',
        title: 'Note',
        content: '| a | b |',
        theme: 'auto',
        view_mode: 'preview',
        x: 0,
        y: 0,
        width: 280,
        height: 200,
        workspace_id: 'ws-1',
        created_at: 0,
        updated_at: 0,
      },
    ]
    const { Canvas } = await import('@renderer/features/canvas/components/Canvas')
    const canvasMock = vi.mocked(Canvas)
    render(<WorkspaceCanvas {...defaultProps} />)

    act(() => {
      canvasMock.mock.calls[canvasMock.mock.calls.length - 1][0].onNoteContextMenu('note-1', 10, 20)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Markdown source' }))
    expect(mockUseNotes.updateNote).toHaveBeenCalledWith('note-1', { view_mode: 'source' })
  })

  it('does not intercept find when no note is selected', async () => {
    const { Canvas } = await import('@renderer/features/canvas/components/Canvas')
    const canvasMock = vi.mocked(Canvas)
    render(<WorkspaceCanvas {...defaultProps} />)

    const event = new KeyboardEvent('keydown', {
      key: 'f',
      metaKey: true,
      cancelable: true,
    })
    window.dispatchEvent(event)

    await act(async () => {})
    const lastCall = canvasMock.mock.calls[canvasMock.mock.calls.length - 1]
    expect(lastCall[0].searchingNoteId).toBeNull()
    expect(event.defaultPrevented).toBe(false)
  })

  it('closes note search when that note is deselected', async () => {
    const { Canvas } = await import('@renderer/features/canvas/components/Canvas')
    const canvasMock = vi.mocked(Canvas)
    render(<WorkspaceCanvas {...defaultProps} />)

    let lastCall = canvasMock.mock.calls[canvasMock.mock.calls.length - 1]
    act(() => {
      lastCall[0].onSelectNote('note-selected')
    })
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true })

    await waitFor(() => {
      lastCall = canvasMock.mock.calls[canvasMock.mock.calls.length - 1]
      expect(lastCall[0].searchingNoteId).toBe('note-selected')
    })

    act(() => {
      lastCall[0].onSelectNote(null)
    })

    await waitFor(() => {
      lastCall = canvasMock.mock.calls[canvasMock.mock.calls.length - 1]
      expect(lastCall[0].searchingNoteId).toBeNull()
    })
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
