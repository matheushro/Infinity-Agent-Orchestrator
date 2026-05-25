// Owns a single terminal's runtime session: the xterm.js instance and its
// wiring to a pty process in the main process. Extracted from TerminalNode so
// the component stays declarative and the pty lifecycle lives in one place.
//
// Known limitation — xterm.js click coords at canvas zoom != 1:
// The canvas-surface applies CSS `transform: scale(zoom)`. xterm.js measures
// cell dimensions in unscaled CSS px (via `_renderService.dimensions.css.cell`)
// but reads click positions from `getBoundingClientRect()` which IS scaled.
// The two-unit mismatch means at zoom 0.5 a click on visual row 20 selects
// row 10 internally. There is no fix that preserves the current "shrink with
// zoom" UX — fixing it requires either reflowing xterm on every zoom change
// (set fontSize = baseFontSize / zoom, terminal reflows cols/rows) or moving
// terminals out of the scaled surface entirely (position them in screen px).
// For now: text selection inside terminals only works correctly at zoom 100%.
import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { COMMANDS } from '../commands'
import { DEFAULT_TERMINAL_STYLE, type TerminalNodeData, type TerminalStyle } from '../types'
import type { CanvasTheme } from '@renderer/features/canvas/types'
import { usePtyActivity } from '@renderer/features/workspaces/context/PtyActivityContext'

// Full xterm palettes. The previous version only set background+foreground and
// fell back to xterm defaults for everything else, which made dim/ANSI text
// (autocomplete menus, prompts) unreadable against our custom backgrounds.
const THEMES = {
  dark: {
    background: '#0b1120',
    foreground: '#e2e8f0',
    cursor: '#e2e8f0',
    cursorAccent: '#0b1120',
    selectionBackground: '#3b82f6',
    selectionForeground: '#ffffff',
    black: '#0b1120',
    red: '#f87171',
    green: '#4ade80',
    yellow: '#fbbf24',
    blue: '#60a5fa',
    magenta: '#c084fc',
    cyan: '#22d3ee',
    white: '#e2e8f0',
    brightBlack: '#64748b',
    brightRed: '#fca5a5',
    brightGreen: '#86efac',
    brightYellow: '#fde68a',
    brightBlue: '#93c5fd',
    brightMagenta: '#d8b4fe',
    brightCyan: '#67e8f9',
    brightWhite: '#f8fafc',
  },
  light: {
    background: '#f7f7f5',
    foreground: '#1f2430',
    cursor: '#1f2430',
    cursorAccent: '#f7f7f5',
    selectionBackground: '#2563eb',
    selectionForeground: '#ffffff',
    black: '#1f2430',
    red: '#dc2626',
    green: '#16a34a',
    yellow: '#ca8a04',
    blue: '#2563eb',
    magenta: '#9333ea',
    cyan: '#0891b2',
    white: '#e5e7eb',
    brightBlack: '#6b7280',
    brightRed: '#ef4444',
    brightGreen: '#22c55e',
    brightYellow: '#eab308',
    brightBlue: '#3b82f6',
    brightMagenta: '#a855f7',
    brightCyan: '#06b6d4',
    brightWhite: '#111827',
  },
} as const

function resolveTheme(style: TerminalStyle, globalTheme: CanvasTheme): 'dark' | 'light' {
  return style.theme === 'auto' ? globalTheme : style.theme
}

export function useTerminalSession(
  node: TerminalNodeData,
  style: TerminalStyle = DEFAULT_TERMINAL_STYLE,
  globalTheme: CanvasTheme = 'dark',
): React.RefObject<HTMLDivElement> {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const { setStatus } = usePtyActivity()

  // Initialize xterm and connect it to the pty in the main process once per node.
  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: style.fontSize,
      fontFamily: style.fontFamily,
      theme: THEMES[resolveTheme(style, globalTheme)],
      // Force-adjust low-contrast foregrounds (e.g. claude/codex emit truecolor
      // grays that assume a pure-black background and vanish on our navy).
      minimumContrastRatio: 4.5,
    })
    termRef.current = term
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    fit.fit()

    let disposed = false
    let idleTimer: ReturnType<typeof setTimeout> | null = null

    // Unique id per pty session. Do NOT reuse node.id, which is only for
    // persistence/layout: under StrictMode the effect mounts twice, and the dead
    // pty from the first mount would send `pty:exit` to the new terminal and
    // print "[process exited]".
    const ptyId = crypto.randomUUID()

    // Create the pty process before wiring listeners.
    window.ptyApi
      .create({
        id: ptyId,
        nodeId: node.id,
        shell: node.shell === 'default' ? undefined : node.shell,
        cols: term.cols,
        rows: term.rows,
        cwd: node.cwd,
        command: COMMANDS[node.command].cmd,
      })
      .then(() => {
        if (disposed) return
        setStatus(node.id, 'idle')
        term.focus()
      })

    // The renderer never executes commands: it only sends typed input.
    const inputSub = term.onData((data) => window.ptyApi.input(ptyId, data))

    const offData = window.ptyApi.onData((id, data) => {
      if (id === ptyId) {
        term.write(data)
        setStatus(node.id, 'busy')
        if (idleTimer) clearTimeout(idleTimer)
        idleTimer = setTimeout(() => setStatus(node.id, 'idle'), 1500)
      }
    })
    const offExit = window.ptyApi.onExit((id) => {
      if (id === ptyId) {
        term.write('\r\n\x1b[31m[process exited]\x1b[0m\r\n')
        if (idleTimer) clearTimeout(idleTimer)
        setStatus(node.id, 'offline')
      }
    })

    // Keep the pty synced with the container size while dragging/resizing the node.
    const observer = new ResizeObserver(() => {
      try {
        fit.fit()
        window.ptyApi.resize(ptyId, term.cols, term.rows)
      } catch {
        // container still has no useful dimensions
      }
    })
    observer.observe(containerRef.current)

    return () => {
      disposed = true
      if (idleTimer) clearTimeout(idleTimer)
      setStatus(node.id, 'offline')
      observer.disconnect()
      inputSub.dispose()
      offData()
      offExit()
      window.ptyApi.kill(ptyId)
      term.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Apply live style updates (theme, font) without rebuilding the pty session.
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.theme = THEMES[resolveTheme(style, globalTheme)]
    term.options.fontFamily = style.fontFamily
    term.options.fontSize = style.fontSize
  }, [style.theme, style.fontFamily, style.fontSize, globalTheme])

  return containerRef
}
