// Owns a single terminal's runtime session: the xterm.js instance and its
// wiring to a pty process in the main process. Extracted from TerminalNode so
// the component stays declarative and the pty lifecycle lives in one place.
import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { COMMANDS } from '../commands'
import { DEFAULT_TERMINAL_STYLE, type TerminalNodeData, type TerminalStyle } from '../types'
import { usePtyActivity } from '@renderer/features/workspaces/context/PtyActivityContext'

const THEMES = {
  dark: { background: '#0b1120', foreground: '#e2e8f0' },
  light: { background: '#f7f7f5', foreground: '#1f2430' },
} as const

export function useTerminalSession(
  node: TerminalNodeData,
  style: TerminalStyle = DEFAULT_TERMINAL_STYLE,
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
      theme: THEMES[style.theme],
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
    term.options.theme = THEMES[style.theme]
    term.options.fontFamily = style.fontFamily
    term.options.fontSize = style.fontSize
  }, [style.theme, style.fontFamily, style.fontSize])

  return containerRef
}
