// Owns a single terminal's runtime session: the xterm.js instance and its
// wiring to a pty process in the main process. Extracted from TerminalNode so
// the component stays declarative and the pty lifecycle lives in one place.
import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { COMMANDS } from '../commands'
import type { TerminalNodeData } from '../types'

export function useTerminalSession(
  node: TerminalNodeData
): React.RefObject<HTMLDivElement> {
  const containerRef = useRef<HTMLDivElement>(null)

  // Initialize xterm and connect it to the pty in the main process once per node.
  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      theme: { background: '#0b1120', foreground: '#e2e8f0' }
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    fit.fit()

    let disposed = false

    // Unique id per pty session. Do NOT reuse node.id, which is only for
    // persistence/layout: under StrictMode the effect mounts twice, and the dead
    // pty from the first mount would send `pty:exit` to the new terminal and
    // print "[process exited]".
    const ptyId = crypto.randomUUID()

    // Create the pty process before wiring listeners.
    window.ptyApi
      .create({
        id: ptyId,
        shell: node.shell === 'default' ? undefined : node.shell,
        cols: term.cols,
        rows: term.rows,
        cwd: node.cwd,
        command: COMMANDS[node.command].cmd
      })
      .then(() => {
        if (disposed) return
        term.focus()
      })

    // The renderer never executes commands: it only sends typed input.
    const inputSub = term.onData((data) => window.ptyApi.input(ptyId, data))

    const offData = window.ptyApi.onData((id, data) => {
      if (id === ptyId) term.write(data)
    })
    const offExit = window.ptyApi.onExit((id) => {
      if (id === ptyId) term.write('\r\n\x1b[31m[process exited]\x1b[0m\r\n')
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
      observer.disconnect()
      inputSub.dispose()
      offData()
      offExit()
      window.ptyApi.kill(ptyId)
      term.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return containerRef
}
