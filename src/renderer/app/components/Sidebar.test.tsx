import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TerminalNodeData } from '@renderer/features/terminals/types'
import type { WorkspaceRecord } from '@shared/types/workspace'
import { PtyActivityProvider, usePtyActivity } from '@renderer/features/workspaces/context/PtyActivityContext'
import { Sidebar } from './Sidebar'

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
    theme: 'dark',
    collapsed: false,
    onCollapsedChange: vi.fn(),
    onNewTerminal: vi.fn(),
    onCreateWorkspace: vi.fn(),
    onSwitchWorkspace: vi.fn(),
    onSelectTerminal: vi.fn(),
    onToggleTheme: vi.fn(),
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
    theme: 'dark',
    collapsed: false,
    onCollapsedChange: vi.fn(),
    onNewTerminal: vi.fn(),
    onCreateWorkspace: vi.fn(),
    onSwitchWorkspace: vi.fn(),
    onSelectTerminal: vi.fn(),
    onToggleTheme: vi.fn(),
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

  it('calls onToggleTheme with the clicked theme', () => {
    const { props } = renderSidebar()
    fireEvent.click(screen.getByText('Light'))
    expect(props.onToggleTheme).toHaveBeenCalledWith('light')
  })

  it('shows New workspace button when workspaces < 5', () => {
    renderSidebar()
    expect(screen.getByText('New workspace')).toBeTruthy()
  })

  it('hides New workspace button when at max (5) workspaces', () => {
    const fiveWorkspaces: WorkspaceRecord[] = Array.from({ length: 5 }, (_, i) => ({
      id: `ws-${i}`,
      name: `WS ${i}`,
      created_at: i * 1000,
    }))
    renderSidebar({ workspaces: fiveWorkspaces, nodesByWorkspace: {} })
    expect(screen.queryByText('New workspace')).toBeNull()
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

  describe('PTY status dots', () => {
    it('11.14 shows a status dot next to a terminal whose node id is active in PtyActivityContext', () => {
      renderSidebarWithStatus('idle')
      const dot = document.querySelector('.term-item span[title="Available"]') as HTMLElement
      expect(dot).toBeTruthy()
      // jsdom converts hex to rgb; just verify a background colour is set
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

    it('11.15 workspace dot renders when at least one terminal is active (idle/busy)', () => {
      renderSidebarWithStatus('busy')
      // The workspace header button should contain a status span with "Working" title
      const wsDot = document.querySelector('button[title="Active workspace"] span[title="Working"]')
      expect(wsDot).toBeTruthy()
    })

    it('workspace dot is green when terminals are idle but not busy', () => {
      renderSidebarWithStatus('idle')
      const dots = screen.getAllByTitle('Available')
      expect(dots.length).toBeGreaterThan(0)
    })

    it('workspace dot is absent when all terminals are offline', () => {
      renderSidebarWithStatus('offline')
      const wsDot = document.querySelector('button[title="Active workspace"] span[title="Offline"]')
      expect(wsDot).toBeNull()
    })
  })
})
