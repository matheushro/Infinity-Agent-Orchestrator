import '@testing-library/jest-dom/vitest'

import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceRecord } from '@shared/types/workspace'
import type { TerminalNodeData } from '@renderer/features/terminals/types'
import type { CanvasTheme } from '@renderer/features/canvas/types'

// ── Mocks ─────────────────────────────────────────────────────────────────

// Reactive useLocalStorage: uses real useState so toggling theme/collapse works.
vi.mock('@renderer/hooks/useLocalStorage', async () => {
  const { useState, useCallback } = await import('react')
  return {
    useLocalStorage: <T,>(key: string, def: T) => {
      const [val, setVal] = useState<T>(() => {
        const raw = localStorage.getItem(key)
        return raw != null ? (JSON.parse(raw) as T) : def
      })
      const setter = useCallback(
        (v: T | ((prev: T) => T)) => {
          setVal((prev) => {
            const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v
            localStorage.setItem(key, JSON.stringify(next))
            return next
          })
        },
        [], // key is stable
      )
      return [val, setter] as const
    },
  }
})

// Reactive useWorkspaces: uses real useState so switching workspace re-renders App.
vi.mock('@renderer/features/workspaces/hooks/useWorkspaces', async () => {
  const { useState, useCallback } = await import('react')
  const sharedState = {
    workspaces: [{ id: 'ws-default', name: 'Default', created_at: 0 }] as WorkspaceRecord[],
    activeId: 'ws-default',
  }
  return {
    useWorkspaces: () => {
      const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>(sharedState.workspaces)
      const [activeId, setActiveIdState] = useState<string>(sharedState.activeId)
      const setActiveId = useCallback((id: string) => {
        sharedState.activeId = id
        setActiveIdState(id)
      }, [])
      const createWorkspace = useCallback(async (name: string) => {
        const ws: WorkspaceRecord = { id: `ws-${Date.now()}`, name, created_at: Date.now() }
        sharedState.workspaces = [...sharedState.workspaces, ws]
        setWorkspaces(sharedState.workspaces)
        setActiveId(ws.id)
      }, [setActiveId])
      return {
        workspaces,
        activeId,
        setActiveId,
        createWorkspace,
        renameWorkspace: vi.fn(),
        deleteWorkspace: vi.fn(),
        duplicateWorkspace: vi.fn(),
        reorderWorkspaces: vi.fn(),
      }
    },
    // expose for test setup
    __sharedState: sharedState,
  }
})

vi.mock('@renderer/features/terminals/hooks/useTerminalStyles', () => ({
  useTerminalStyles: () => ({
    getStyle: vi.fn(() => ({ theme: 'dark', fontFamily: 'mono', fontSize: 13 })),
    setStyle: vi.fn(),
    removeStyle: vi.fn(),
  }),
}))

// WorkspaceCanvas stub — calls onNodesChange once on mount.
vi.mock('./components/WorkspaceCanvas', async () => {
  const { useEffect } = await import('react')
  return {
    WorkspaceCanvas: vi.fn(({ workspace, active, onNodesChange }: {
      workspace: WorkspaceRecord
      active: boolean
      onNodesChange: (nodes: TerminalNodeData[]) => void
    }) => {
      useEffect(() => { onNodesChange([]) }, []) // eslint-disable-line react-hooks/exhaustive-deps
      return <div data-testid={`canvas-${workspace.id}`} data-active={active ? 'true' : 'false'} />
    }),
  }
})

// Sidebar stub — exposes action buttons for interaction.
vi.mock('./components/Sidebar', async () => {
  return {
    Sidebar: vi.fn(({ collapsed, onCollapsedChange, onNewTerminal, onOpenSettings, activeWorkspaceId, workspaces, onSwitchWorkspace }: {
      collapsed: boolean
      onCollapsedChange: (v: boolean) => void
      onNewTerminal: () => void
      onOpenSettings: () => void
      activeWorkspaceId: string
      workspaces: WorkspaceRecord[]
      onSwitchWorkspace: (id: string) => void
      [key: string]: unknown
    }) => (
      <aside data-testid="sidebar" data-collapsed={String(collapsed)} data-active-ws={activeWorkspaceId}>
        <button onClick={() => onCollapsedChange(!collapsed)}>Toggle collapse</button>
        <button onClick={onNewTerminal}>New terminal</button>
        <button onClick={onOpenSettings}>Open settings</button>
        {workspaces.map((ws) => (
          <button key={ws.id} onClick={() => onSwitchWorkspace(ws.id)}>Switch to {ws.name}</button>
        ))}
      </aside>
    )),
  }
})

// Topbar stub.
vi.mock('./components/Topbar', () => ({
  Topbar: vi.fn(({ terminalCount }: { terminalCount: number }) => (
    <header data-testid="topbar" data-count={terminalCount} />
  )),
}))

// SettingsModal stub — exposes a theme toggle button.
vi.mock('./components/SettingsModal', () => ({
  SettingsModal: vi.fn(({ theme, onThemeChange, onClose }: { theme: CanvasTheme; onThemeChange: (t: CanvasTheme) => void; onClose: () => void }) => (
    <div data-testid="settings-modal" data-theme={theme}>
      <button onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}>Toggle theme</button>
      <button onClick={onClose}>Close</button>
    </div>
  )),
}))

// ── Imports (after mocks) ──────────────────────────────────────────────────

import App from './App'

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  document.documentElement.classList.remove('dark', 'light')
})

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  document.documentElement.classList.remove('dark', 'light')
})

// ── Tests ──────────────────────────────────────────────────────────────────

describe('App composition', () => {
  it('renders sidebar and at least one workspace canvas', async () => {
    render(<App />)
    expect(screen.getByTestId('sidebar')).toBeTruthy()
    await waitFor(() => expect(screen.getByTestId('canvas-ws-default')).toBeTruthy())
  })

  it('active workspace canvas has data-active=true', async () => {
    render(<App />)
    await waitFor(() =>
      expect(screen.getByTestId('canvas-ws-default').getAttribute('data-active')).toBe('true'),
    )
  })

  it('theme toggle via settings modal updates the global theme', async () => {
    render(<App />)
    fireEvent.click(screen.getByText('Open settings'))
    await waitFor(() => expect(screen.getByTestId('settings-modal').getAttribute('data-theme')).toBe('dark'))
    fireEvent.click(screen.getByText('Toggle theme'))
    await waitFor(() =>
      expect(screen.getByTestId('settings-modal').getAttribute('data-theme')).toBe('light'),
    )
  })

  it('theme toggle applies the dark class to documentElement', async () => {
    render(<App />)
    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(true))
    fireEvent.click(screen.getByText('Open settings'))
    fireEvent.click(screen.getByText('Toggle theme'))
    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(false))
  })

  it('sidebar collapse toggle persists via useLocalStorage', async () => {
    render(<App />)
    expect(screen.getByTestId('sidebar').getAttribute('data-collapsed')).toBe('false')
    fireEvent.click(screen.getByText('Toggle collapse'))
    await waitFor(() =>
      expect(screen.getByTestId('sidebar').getAttribute('data-collapsed')).toBe('true'),
    )
  })

  it('New terminal button does not throw', async () => {
    render(<App />)
    await waitFor(() => screen.getByTestId('canvas-ws-default'))
    expect(() => fireEvent.click(screen.getByText('New terminal'))).not.toThrow()
  })

  it('renders one canvas per workspace', async () => {
    const { __sharedState } = await import('@renderer/features/workspaces/hooks/useWorkspaces') as { __sharedState: { workspaces: WorkspaceRecord[]; activeId: string } }
    __sharedState.workspaces = [
      { id: 'ws-a', name: 'Alpha', created_at: 0 },
      { id: 'ws-b', name: 'Beta', created_at: 1 },
    ]
    __sharedState.activeId = 'ws-a'
    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('canvas-ws-a')).toBeTruthy()
      expect(screen.getByTestId('canvas-ws-b')).toBeTruthy()
    })
    // restore
    __sharedState.workspaces = [{ id: 'ws-default', name: 'Default', created_at: 0 }]
    __sharedState.activeId = 'ws-default'
  })

  it('theme persists to localStorage', async () => {
    render(<App />)
    fireEvent.click(screen.getByText('Open settings'))
    fireEvent.click(screen.getByText('Toggle theme'))
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('canvasTheme') ?? '"dark"')
      expect(stored).toBe('light')
    })
  })

  it('switching workspace via sidebar updates activeWorkspaceId', async () => {
    const { __sharedState } = await import('@renderer/features/workspaces/hooks/useWorkspaces') as { __sharedState: { workspaces: WorkspaceRecord[]; activeId: string } }
    __sharedState.workspaces = [
      { id: 'ws-default', name: 'Default', created_at: 0 },
      { id: 'ws-2', name: 'Projects', created_at: 1 },
    ]
    __sharedState.activeId = 'ws-default'
    render(<App />)
    await waitFor(() => screen.getByText('Switch to Projects'))
    fireEvent.click(screen.getByText('Switch to Projects'))
    await waitFor(() =>
      expect(screen.getByTestId('sidebar').getAttribute('data-active-ws')).toBe('ws-2'),
    )
    // restore
    __sharedState.workspaces = [{ id: 'ws-default', name: 'Default', created_at: 0 }]
    __sharedState.activeId = 'ws-default'
  })

  it('12.10 all canvases remain mounted when switching workspace', async () => {
    const { __sharedState } = await import('@renderer/features/workspaces/hooks/useWorkspaces') as { __sharedState: { workspaces: WorkspaceRecord[]; activeId: string } }
    __sharedState.workspaces = [
      { id: 'ws-a', name: 'Alpha', created_at: 0 },
      { id: 'ws-b', name: 'Beta', created_at: 1 },
    ]
    __sharedState.activeId = 'ws-a'
    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('canvas-ws-a')).toBeTruthy()
      expect(screen.getByTestId('canvas-ws-b')).toBeTruthy()
    })
    fireEvent.click(screen.getByText('Switch to Beta'))
    await waitFor(() =>
      expect(screen.getByTestId('sidebar').getAttribute('data-active-ws')).toBe('ws-b'),
    )
    // Both canvases must still be in the DOM
    expect(screen.getByTestId('canvas-ws-a')).toBeTruthy()
    expect(screen.getByTestId('canvas-ws-b')).toBeTruthy()
    // restore
    __sharedState.workspaces = [{ id: 'ws-default', name: 'Default', created_at: 0 }]
    __sharedState.activeId = 'ws-default'
  })

  it('12.11 inactive canvas has data-active=false; only active one has data-active=true', async () => {
    const { __sharedState } = await import('@renderer/features/workspaces/hooks/useWorkspaces') as { __sharedState: { workspaces: WorkspaceRecord[]; activeId: string } }
    __sharedState.workspaces = [
      { id: 'ws-active', name: 'Active', created_at: 0 },
      { id: 'ws-inactive', name: 'Inactive', created_at: 1 },
    ]
    __sharedState.activeId = 'ws-active'
    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('canvas-ws-active').getAttribute('data-active')).toBe('true')
      expect(screen.getByTestId('canvas-ws-inactive').getAttribute('data-active')).toBe('false')
    })
    // restore
    __sharedState.workspaces = [{ id: 'ws-default', name: 'Default', created_at: 0 }]
    __sharedState.activeId = 'ws-default'
  })
})
