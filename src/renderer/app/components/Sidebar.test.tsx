import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TerminalNodeData } from '@renderer/features/terminals/types'
import type { WorkspaceRecord } from '@shared/types/workspace'
import { PtyActivityProvider, usePtyActivity } from '@renderer/features/workspaces/context/PtyActivityContext'
import { Sidebar } from './Sidebar'

const mockDbApi = {
  reorderTerminals: vi.fn(),
}

const WS_1: WorkspaceRecord = { id: 'ws-1', name: 'Main', created_at: 1000 }
const WS_2: WorkspaceRecord = { id: 'ws-2', name: 'Side', created_at: 2000 }

const term1: TerminalNodeData = {
  id: 'alpha',
  x: 0, y: 0, width: 320, height: 220,
  shell: 'default', title: 'Alpha Shell',
  cwd: '/home/me/AlphaApp', command: 'claude',
  workspace_id: 'ws-1',
}
const term2: TerminalNodeData = {
  id: 'beta',
  x: 20, y: 20, width: 320, height: 220,
  shell: 'default', title: 'Beta Terminal',
  cwd: '/home/me/Beta', command: 'claude',
  workspace_id: 'ws-2',
}
const term3: TerminalNodeData = {
  id: 'gamma',
  x: 40, y: 40, width: 320, height: 220,
  shell: 'default', title: 'Gamma Shell',
  cwd: '/home/me/GammaApp', command: 'codex',
  workspace_id: 'ws-1',
}

function StatusSetter({ nodeId, status }: { nodeId: string; status: 'idle' | 'busy' | 'offline' }): null {
  const { setStatus } = usePtyActivity()
  useEffect(() => {
    setStatus(nodeId, status)
  }, [nodeId, status, setStatus])
  return null
}

function renderSidebar(overrides: Partial<ComponentProps<typeof Sidebar>> = {}) {
  const props: ComponentProps<typeof Sidebar> = {
    workspaces: [WS_1, WS_2],
    activeWorkspaceId: 'ws-1',
    nodesByWorkspace: { 'ws-1': [term1], 'ws-2': [term2] },
    selectedTerminalId: 'alpha',
    collapsed: false,
    maxWorkspaces: 5,
    onCollapsedChange: vi.fn(),
    onNewTerminal: vi.fn(),
    onCreateWorkspace: vi.fn(),
    onRenameWorkspace: vi.fn(),
    onDeleteWorkspace: vi.fn(),
    onDuplicateWorkspace: vi.fn(),
    onReorderWorkspaces: vi.fn(),
    onSwitchWorkspace: vi.fn(),
    onSelectTerminal: vi.fn(),
    onOpenSettings: vi.fn(),
    onTerminalDuplicate: vi.fn(),
    onTerminalDelete: vi.fn(),
    onTerminalLink: vi.fn(),
    onTerminalStyle: vi.fn(),
    onTerminalOpenInVSCode: vi.fn(),
    ...overrides,
  }

  return {
    ...render(
      <PtyActivityProvider>
        <Sidebar {...props} />
      </PtyActivityProvider>,
    ),
    props,
  }
}

function renderSidebarWithStatus(
  status: 'idle' | 'busy' | 'offline',
  overrides: Partial<ComponentProps<typeof Sidebar>> = {},
) {
  const props: ComponentProps<typeof Sidebar> = {
    workspaces: [WS_1],
    activeWorkspaceId: 'ws-1',
    nodesByWorkspace: { 'ws-1': [term1] },
    selectedTerminalId: 'alpha',
    collapsed: false,
    maxWorkspaces: 5,
    onCollapsedChange: vi.fn(),
    onNewTerminal: vi.fn(),
    onCreateWorkspace: vi.fn(),
    onRenameWorkspace: vi.fn(),
    onDeleteWorkspace: vi.fn(),
    onDuplicateWorkspace: vi.fn(),
    onReorderWorkspaces: vi.fn(),
    onSwitchWorkspace: vi.fn(),
    onSelectTerminal: vi.fn(),
    onOpenSettings: vi.fn(),
    onTerminalDuplicate: vi.fn(),
    onTerminalDelete: vi.fn(),
    onTerminalLink: vi.fn(),
    onTerminalStyle: vi.fn(),
    onTerminalOpenInVSCode: vi.fn(),
    ...overrides,
  }

  return render(
    <PtyActivityProvider>
      <StatusSetter nodeId="alpha" status={status} />
      <Sidebar {...props} />
    </PtyActivityProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'dbApi', {
    configurable: true,
    value: mockDbApi,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Sidebar', () => {
  it('renders workspace names in the list', () => {
    renderSidebar()
    expect(screen.getByText('Main')).toBeTruthy()
    expect(screen.getByText('Side')).toBeTruthy()
  })

  it('renders terminal titles under their workspace', () => {
    renderSidebar()
    expect(screen.getByText('Alpha Shell')).toBeTruthy()
    expect(screen.getByText('Beta Terminal')).toBeTruthy()
  })

  it('renders each terminal agent in the sidebar', () => {
    renderSidebar()
    expect(screen.getAllByText(/Claude Code/).length).toBeGreaterThan(0)
  })

  it('renders terminal folders as shortened path labels', () => {
    renderSidebar()
    const alphaItem = screen.getByText('Alpha Shell').closest('.term-item')!
    expect(alphaItem.textContent).toContain('.../AlphaApp')
    expect(screen.queryByText('/home/me/AlphaApp')).toBeNull()
  })

  it('calls onNewTerminal when the New terminal button is clicked', () => {
    const { props } = renderSidebar()
    fireEvent.click(screen.getByText('New terminal'))
    expect(props.onNewTerminal).toHaveBeenCalledTimes(1)
  })

  it('calls onSelectTerminal when a terminal item is clicked', () => {
    const { props } = renderSidebar()
    fireEvent.click(screen.getByText('Alpha Shell'))
    expect(props.onSelectTerminal).toHaveBeenCalledWith('ws-1', 'alpha')
  })

  it('calls onSwitchWorkspace when clicking a terminal in another workspace', () => {
    const { props } = renderSidebar()
    fireEvent.click(screen.getByText('Beta Terminal'))
    expect(props.onSwitchWorkspace).toHaveBeenCalledWith('ws-2')
    expect(props.onSelectTerminal).toHaveBeenCalledWith('ws-2', 'beta')
  })

  it('clicking the Settings footer button calls onOpenSettings', () => {
    const { props } = renderSidebar()
    fireEvent.click(screen.getByText('Settings'))
    expect(props.onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it('shows New workspace button when workspaces are below the configured limit', () => {
    renderSidebar()
    expect(screen.getByText('New workspace')).toBeTruthy()
    expect(screen.getByText('2/5')).toBeTruthy()
  })

  it('hides New workspace button when at the configured workspace limit', () => {
    const threeWorkspaces: WorkspaceRecord[] = Array.from({ length: 3 }, (_, i) => ({
      id: `ws-${i}`,
      name: `WS ${i}`,
      created_at: i * 1000,
    }))
    renderSidebar({ workspaces: threeWorkspaces, nodesByWorkspace: {}, maxWorkspaces: 3 })
    expect(screen.queryByText('New workspace')).toBeNull()
    expect(screen.getByText('3/3')).toBeTruthy()
  })

  it('entering new workspace mode and confirming calls onCreateWorkspace', () => {
    const { props } = renderSidebar()
    fireEvent.click(screen.getByText('New workspace'))
    const input = screen.getByPlaceholderText('Workspace name…')
    fireEvent.change(input, { target: { value: 'My Project' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(props.onCreateWorkspace).toHaveBeenCalledWith('My Project')
  })

  it('toggles collapsed state through onCollapsedChange', () => {
    const { props } = renderSidebar()
    fireEvent.click(screen.getAllByTitle('Collapse sidebar')[0])
    expect(props.onCollapsedChange).toHaveBeenCalledWith(true)
  })

  it('shows a compact icon rail when collapsed', () => {
    renderSidebar({ collapsed: true })
    expect(screen.queryByText('New terminal')).toBeNull()
    expect(screen.queryByText('Main')).toBeNull()
  })

  it('clicking collapsed rail open button calls onCollapsedChange(false)', () => {
    const { props } = renderSidebar({ collapsed: true })
    fireEvent.click(screen.getByTitle('Open sidebar'))
    expect(props.onCollapsedChange).toHaveBeenCalledWith(false)
  })

  it('highlights the selected terminal item with active class', () => {
    renderSidebar({ selectedTerminalId: 'alpha' })
    const items = document.querySelectorAll('.term-item')
    const activeItem = Array.from(items).find((el) => el.classList.contains('active'))
    expect(activeItem).toBeTruthy()
    expect(activeItem?.textContent).toContain('Alpha Shell')
  })

  it('does not render a center-on-canvas button for terminal rows', () => {
    renderSidebar()
    expect(screen.queryByTitle('Center on canvas')).toBeNull()
  })

  it('reorders terminal rows in the sidebar without mutating the source node order', () => {
    const nodes = [term1, term3]
    const { props } = renderSidebar({
      workspaces: [WS_1],
      nodesByWorkspace: { 'ws-1': nodes },
    })

    const alphaItem = screen.getByText('Alpha Shell').closest('.term-item')!
    const gammaItem = screen.getByText('Gamma Shell').closest('.term-item')!
    const alphaRow = alphaItem.parentElement!
    const gammaRow = gammaItem.parentElement!
    vi.spyOn(alphaRow, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      bottom: 30,
      left: 0,
      right: 220,
      width: 220,
      height: 30,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    vi.spyOn(gammaRow, 'getBoundingClientRect').mockReturnValue({
      top: 30,
      bottom: 60,
      left: 0,
      right: 220,
      width: 220,
      height: 30,
      x: 0,
      y: 30,
      toJSON: () => ({}),
    })

    fireEvent.pointerDown(screen.getAllByLabelText('Drag to reorder terminal')[0], {
      button: 0,
      clientX: 10,
      clientY: 10,
    })
    fireEvent.pointerMove(window, { clientX: 10, clientY: 100 })
    fireEvent.pointerUp(window, { clientX: 10, clientY: 100 })

    const renderedTitles = Array.from(document.querySelectorAll('.term-item')).map((item) =>
      item.textContent,
    )
    expect(renderedTitles[0]).toContain('Gamma Shell')
    expect(renderedTitles[1]).toContain('Alpha Shell')
    expect(props.nodesByWorkspace['ws-1']).toEqual(nodes)
    expect(mockDbApi.reorderTerminals).toHaveBeenCalledWith('ws-1', ['gamma', 'alpha'])
  })

  it('pressing Escape inside the new-workspace input cancels without calling onCreateWorkspace', () => {
    const { props } = renderSidebar()
    fireEvent.click(screen.getByText('New workspace'))
    const input = screen.getByPlaceholderText('Workspace name…')
    fireEvent.change(input, { target: { value: 'Canceled' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(props.onCreateWorkspace).not.toHaveBeenCalled()
    expect(screen.queryByPlaceholderText('Workspace name…')).toBeNull()
  })

  it('submitting a blank name does not call onCreateWorkspace', () => {
    const { props } = renderSidebar()
    fireEvent.click(screen.getByText('New workspace'))
    const input = screen.getByPlaceholderText('Workspace name…')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(props.onCreateWorkspace).not.toHaveBeenCalled()
  })

  describe('inline workspace rename', () => {
    it('clicking workspace name shows a rename input pre-filled with current name', () => {
      renderSidebar()
      fireEvent.click(screen.getByText('Main'))
      expect(screen.getByDisplayValue('Main')).toBeTruthy()
    })

    it('pressing Enter in rename input calls onRenameWorkspace with the new name', () => {
      const { props } = renderSidebar()
      fireEvent.click(screen.getByText('Main'))
      const input = screen.getByDisplayValue('Main')
      fireEvent.change(input, { target: { value: 'Renamed' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(props.onRenameWorkspace).toHaveBeenCalledWith('ws-1', 'Renamed')
    })

    it('pressing Escape cancels the rename without calling onRenameWorkspace', () => {
      const { props } = renderSidebar()
      fireEvent.click(screen.getByText('Main'))
      const input = screen.getByDisplayValue('Main')
      fireEvent.change(input, { target: { value: 'Nope' } })
      fireEvent.keyDown(input, { key: 'Escape' })
      expect(props.onRenameWorkspace).not.toHaveBeenCalled()
      expect(screen.queryByDisplayValue('Nope')).toBeNull()
    })
  })

  describe('terminal right-click context menu', () => {
    it('right-clicking a terminal shows the context menu', () => {
      renderSidebar()
      const termItem = screen.getByText('Alpha Shell').closest('.term-item')!
      fireEvent.contextMenu(termItem)
      expect(screen.getByText('Delete terminal')).toBeTruthy()
      expect(screen.getByText('Duplicate terminal')).toBeTruthy()
      expect(screen.getByText('Link to terminal/note')).toBeTruthy()
      expect(screen.getByText('Open on VS Code')).toBeTruthy()
      expect(screen.getByText('Customize style…')).toBeTruthy()
    })

    it('clicking Delete terminal calls onTerminalDelete', () => {
      const { props } = renderSidebar()
      const termItem = screen.getByText('Alpha Shell').closest('.term-item')!
      fireEvent.contextMenu(termItem)
      fireEvent.click(screen.getByText('Delete terminal'))
      expect(props.onTerminalDelete).toHaveBeenCalledWith('ws-1', 'alpha')
    })

    it('clicking Duplicate terminal calls onTerminalDuplicate', () => {
      const { props } = renderSidebar()
      const termItem = screen.getByText('Alpha Shell').closest('.term-item')!
      fireEvent.contextMenu(termItem)
      fireEvent.click(screen.getByText('Duplicate terminal'))
      expect(props.onTerminalDuplicate).toHaveBeenCalledWith('ws-1', 'alpha')
    })

    it('clicking Link to terminal/note calls onTerminalLink', () => {
      const { props } = renderSidebar()
      const termItem = screen.getByText('Alpha Shell').closest('.term-item')!
      fireEvent.contextMenu(termItem)
      fireEvent.click(screen.getByText('Link to terminal/note'))
      expect(props.onTerminalLink).toHaveBeenCalledWith('ws-1', 'alpha')
    })

    it('clicking Open on VS Code calls onTerminalOpenInVSCode', () => {
      const { props } = renderSidebar()
      const termItem = screen.getByText('Alpha Shell').closest('.term-item')!
      fireEvent.contextMenu(termItem)
      fireEvent.click(screen.getByText('Open on VS Code'))
      expect(props.onTerminalOpenInVSCode).toHaveBeenCalledWith('ws-1', term1)
    })

    it('clicking Customize style calls onTerminalStyle', () => {
      const { props } = renderSidebar()
      const termItem = screen.getByText('Alpha Shell').closest('.term-item')!
      fireEvent.contextMenu(termItem)
      fireEvent.click(screen.getByText('Customize style…'))
      expect(props.onTerminalStyle).toHaveBeenCalledWith('ws-1', 'alpha')
    })
  })

  describe('workspace right-click context menu', () => {
    it('right-clicking a workspace header shows the workspace context menu', () => {
      renderSidebar()
      const wsHeader = screen.getByText('Main').closest('[oncontextmenu]') ??
        document.querySelector('.mb-1 > div')!
      fireEvent.contextMenu(wsHeader)
      expect(screen.getByText('Rename')).toBeTruthy()
      expect(screen.getByText('Duplicate')).toBeTruthy()
      expect(screen.getByText('Delete workspace')).toBeTruthy()
    })

    it('clicking Rename in workspace context menu activates inline rename', () => {
      renderSidebar()
      const wsHeader = document.querySelector('.mb-1 > div')!
      fireEvent.contextMenu(wsHeader)
      fireEvent.click(screen.getByText('Rename'))
      expect(screen.getByDisplayValue('Main')).toBeTruthy()
    })

    it('clicking Delete workspace calls onDeleteWorkspace', () => {
      const { props } = renderSidebar()
      const wsHeader = document.querySelector('.mb-1 > div')!
      fireEvent.contextMenu(wsHeader)
      fireEvent.click(screen.getByText('Delete workspace'))
      expect(props.onDeleteWorkspace).toHaveBeenCalledWith('ws-1')
    })

    it('clicking Duplicate calls onDuplicateWorkspace', () => {
      const { props } = renderSidebar()
      const wsHeader = document.querySelector('.mb-1 > div')!
      fireEvent.contextMenu(wsHeader)
      fireEvent.click(screen.getByText('Duplicate'))
      expect(props.onDuplicateWorkspace).toHaveBeenCalledWith('ws-1')
    })
  })

  describe('PTY status dots', () => {
    it('11.14 shows a status dot next to a terminal whose node id is active in PtyActivityContext', () => {
      renderSidebarWithStatus('idle')
      const dot = document.querySelector('.term-item span[title="Available"]') as HTMLElement
      expect(dot).toBeTruthy()
      expect(dot.style.background).toBeTruthy()
    })

    it('shows yellow dot when terminal is busy', () => {
      renderSidebarWithStatus('busy')
      const dot = document.querySelector('.term-item span[title="Working"]') as HTMLElement
      expect(dot).toBeTruthy()
      expect(dot.style.background).toBeTruthy()
    })

    it('11.16 no dot when terminal is offline (dot has gray background)', () => {
      renderSidebarWithStatus('offline')
      const dot = document.querySelector('.term-item span[title="Offline"]') as HTMLElement
      expect(dot).toBeTruthy()
    })

    it('11.15 workspace dot renders when at least one terminal is busy', () => {
      renderSidebarWithStatus('busy')
      const wsDot = document.querySelector('span[title="Working"]')
      expect(wsDot).toBeTruthy()
    })

    it('workspace dot is green when terminals are idle but not busy', () => {
      renderSidebarWithStatus('idle')
      const dots = screen.getAllByTitle('Available')
      expect(dots.length).toBeGreaterThan(0)
    })

    it('workspace dot is absent when all terminals are offline', () => {
      renderSidebarWithStatus('offline')
      // workspace header should not show an idle/busy dot
      const wsDot = document.querySelector('.mb-1 > div span[title="Working"]')
      expect(wsDot).toBeNull()
    })
  })
})
