// Owns a single terminal's runtime session: the xterm.js instance and its
// wiring to a pty process in the main process. Extracted from TerminalNode so
// the component stays declarative and the pty lifecycle lives in one place.
//
import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { openExternalUrl } from '@renderer/lib/externalLinks'
import { COMMANDS } from '../commands'
import { ALT_BUFFER_CLASS } from '../scrollbar'
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

// Wheel scrolling: lines per notch, plain and with the fast-scroll modifier.
const SCROLL_LINES_PER_NOTCH = 3
const FAST_SCROLL_LINES_PER_NOTCH = 12

interface XtermMouseService {
  getCoords: (
    event: { clientX: number; clientY: number },
    element: HTMLElement,
    colCount: number,
    rowCount: number,
    isSelection?: boolean,
  ) => [number, number] | undefined
  getMouseReportCoords?: (
    event: MouseEvent,
    element: HTMLElement,
  ) => { col: number; row: number; x: number; y: number } | undefined
}

interface XtermCoreAccess {
  _core?: {
    _mouseService?: XtermMouseService
  }
}

function resolveTheme(style: TerminalStyle, globalTheme: CanvasTheme): 'dark' | 'light' {
  return style.theme === 'auto' ? globalTheme : style.theme
}

function eventWithUnscaledClientPosition<T extends { clientX: number; clientY: number }>(
  event: T,
  element: HTMLElement,
  scale: number,
): T {
  if (scale === 1) return event

  const rect = element.getBoundingClientRect()
  return {
    ...event,
    clientX: rect.left + (event.clientX - rect.left) / scale,
    clientY: rect.top + (event.clientY - rect.top) / scale,
  }
}

function patchXtermMouseCoordinates(
  term: Terminal,
  scaleRef: React.MutableRefObject<number>,
): () => void {
  const mouseService = (term as Terminal & XtermCoreAccess)._core?._mouseService
  if (!mouseService) return () => {}

  const originalGetCoords = mouseService.getCoords.bind(mouseService)
  const originalGetMouseReportCoords = mouseService.getMouseReportCoords?.bind(mouseService)

  mouseService.getCoords = (event, element, colCount, rowCount, isSelection) =>
    originalGetCoords(
      eventWithUnscaledClientPosition(event, element, scaleRef.current),
      element,
      colCount,
      rowCount,
      isSelection,
    )

  if (originalGetMouseReportCoords) {
    mouseService.getMouseReportCoords = (event, element) =>
      originalGetMouseReportCoords(
        eventWithUnscaledClientPosition(event, element, scaleRef.current),
        element,
      )
  }

  return () => {
    mouseService.getCoords = originalGetCoords
    if (originalGetMouseReportCoords) {
      mouseService.getMouseReportCoords = originalGetMouseReportCoords
    }
  }
}

// Re-measure the grid against the container and keep the pty in sync. Fitting
// throws while the container has no usable dimensions (hidden node, teardown),
// which must never escape into a React effect.
function refit(fit: FitAddon | null, term: Terminal, ptyId: string | null): void {
  if (!fit || !ptyId) return
  try {
    fit.fit()
    window.ptyApi.resize(ptyId, term.cols, term.rows)
  } catch {
    // container still has no useful dimensions
  }
}

// Identity of everything the live-style effect applies. Used to skip the pass
// right after a session is built — the Terminal was constructed with these very
// values, and re-fitting there would resize the pty twice on every mount.
function styleSignature(style: TerminalStyle, globalTheme: CanvasTheme): string {
  return [
    resolveTheme(style, globalTheme),
    style.fontFamily,
    style.fontSize,
    style.lineHeight,
  ].join('|')
}

function shellQuotePath(path: string): string {
  if (!path) return ''
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(path)) return path
  return `'${path.replace(/'/g, `'\\''`)}'`
}

function droppedFiles(event: DragEvent): File[] {
  const files = event.dataTransfer?.files
  return files ? Array.from(files) : []
}

function hasDraggedFiles(event: DragEvent): boolean {
  const dataTransfer = event.dataTransfer
  if (!dataTransfer) return false
  if (dataTransfer.files.length > 0) return true
  if (Array.from(dataTransfer.items).some((item) => item.kind === 'file')) return true
  return Array.from(dataTransfer.types).includes('Files')
}

export function useTerminalSession(
  node: TerminalNodeData,
  style: TerminalStyle = DEFAULT_TERMINAL_STYLE,
  globalTheme: CanvasTheme = 'dark',
  scale = 1,
  // Bumping this tears down the current pty/xterm and rebuilds a fresh session,
  // exactly as if the terminal had just been opened.
  restartSignal = 0,
  // When false the terminal is "off": no xterm, no pty — the node stays on the
  // canvas but consumes no shell/RAM/CPU. Flipping it back on rebuilds a session.
  enabled = true,
): React.RefObject<HTMLDivElement> {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const ptyIdRef = useRef<string | null>(null)
  const appliedStyleRef = useRef<string | null>(null)
  const scaleRef = useRef(scale)
  const { setStatus } = usePtyActivity()

  scaleRef.current = scale

  // Initialize xterm and connect it to the pty in the main process once per node.
  useEffect(() => {
    // Powered-off terminals never spawn a shell. Keep them strictly inert.
    if (!enabled || !containerRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: style.fontSize,
      fontFamily: style.fontFamily,
      // Rows are clipped to exactly this box by xterm's DOM renderer, so the
      // default 1.0 shaves glyph tops/bottoms once the canvas zoom puts the row
      // boundary on a fractional pixel. See TerminalStyle.lineHeight.
      lineHeight: style.lineHeight,
      theme: THEMES[resolveTheme(style, globalTheme)],
      // One notch = one line is painfully slow through a long agent transcript.
      // Three lines matches what native terminals do; alt+wheel goes fast.
      scrollSensitivity: SCROLL_LINES_PER_NOTCH,
      fastScrollSensitivity: FAST_SCROLL_LINES_PER_NOTCH,
      // Force-adjust low-contrast foregrounds (e.g. claude/codex emit truecolor
      // grays that assume a pure-black background and vanish on our navy).
      minimumContrastRatio: 4.5,
      // Agents print OSC 8 hyperlinks. xterm's default activation is
      // `window.open`, which Electron would answer with a chromeless in-app
      // window — send them to the user's browser instead.
      linkHandler: {
        activate: (_event, uri) => openExternalUrl(uri),
      },
    })
    termRef.current = term

    // Unique id per pty session. Do NOT reuse node.id, which is only for
    // persistence/layout: under StrictMode the effect mounts twice, and the dead
    // pty from the first mount would send `pty:exit` to the new terminal and
    // print "[process exited]".
    const ptyId = crypto.randomUUID()
    ptyIdRef.current = ptyId
    appliedStyleRef.current = styleSignature(style, globalTheme)

    // Copy/paste shortcuts. Ctrl+C in a terminal sends SIGINT, so we follow the
    // gnome-terminal/iTerm convention: Ctrl+Shift+C copies, Ctrl+Shift+V pastes.
    // Also: if Ctrl+C is pressed while text is selected, copy instead of SIGINT
    // (selection is the user's explicit intent to copy).
    //
    // We call preventDefault on the handled shortcuts because returning false only
    // stops xterm from processing the key — the browser's native clipboard action
    // still fires. On Linux/Chromium, Ctrl+Shift+V is the native "paste as plain
    // text" shortcut, which triggers a paste event on xterm's textarea and sends
    // the text to the pty a second time (double paste).
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && e.shiftKey && e.code === 'KeyC') {
        const sel = term.getSelection()
        if (sel) void navigator.clipboard.writeText(sel)
        e.preventDefault()
        return false
      }
      if (ctrl && e.shiftKey && e.code === 'KeyV') {
        void navigator.clipboard.readText().then((text) => {
          if (text) window.ptyApi.input(ptyId, text)
        })
        e.preventDefault()
        return false
      }
      if (ctrl && !e.shiftKey && e.code === 'KeyC') {
        const sel = term.getSelection()
        if (sel) {
          void navigator.clipboard.writeText(sel)
          term.clearSelection()
          e.preventDefault()
          return false
        }
      }
      return true
    })

    const fit = new FitAddon()
    fitRef.current = fit
    term.loadAddon(fit)
    term.open(containerRef.current)
    const restoreMouseCoordinates = patchXtermMouseCoordinates(term, scaleRef)
    fit.fit()

    // xterm's viewport reports a scrollbar width of 0 until its first refresh,
    // so the fit above hands the grid one column too many — the last column
    // then lives under the scrollbar and whatever the agent paints there (the
    // codex/claude input box) covers the bar. Re-fit on the next frame, once
    // the real gutter has been measured.
    const gutterFrame = requestAnimationFrame(() => refit(fit, term, ptyId))

    const container = containerRef.current

    // Full-screen agents (claude) switch to the alternate screen buffer, where
    // xterm holds no scrollback: the transcript is scrolled by the agent itself
    // (the wheel reaches it as a mouse report). Flag the surface so the empty
    // scrollbar stops advertising a scroll that can never happen.
    const syncAltBuffer = (): void => {
      container.classList.toggle(ALT_BUFFER_CLASS, term.buffer.active.type === 'alternate')
    }
    const bufferSub = term.buffer.onBufferChange(syncAltBuffer)
    syncAltBuffer()

    const handleDragOver = (event: DragEvent): void => {
      if (!hasDraggedFiles(event)) return
      event.preventDefault()
    }
    const handleDrop = (event: DragEvent): void => {
      const files = droppedFiles(event)
      if (files.length === 0) return

      event.preventDefault()
      const paths = files
        .map((file) => window.ptyApi.getPathForFile(file))
        .filter((path) => path.length > 0)
        .map(shellQuotePath)

      if (paths.length > 0) window.ptyApi.input(ptyId, paths.join(' '))
    }
    container.addEventListener('dragover', handleDragOver)
    container.addEventListener('drop', handleDrop)

    let disposed = false
    let idleTimer: ReturnType<typeof setTimeout> | null = null

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
        prompt: node.prompt,
        model: node.model,
        effort: node.effort,
      })
      .then(() => {
        if (disposed) return
        setStatus(node.id, 'idle')
        term.focus()
      })

    // The renderer never executes commands: it only sends typed input. The
    // prompt lives in the agent's context file, so `/clear` needs no special
    // handling — the agent re-reads its role from the file on its own.
    const inputSub = term.onData((data) => {
      window.ptyApi.input(ptyId, data)
    })

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
      refit(fit, term, ptyId)
    })
    observer.observe(containerRef.current)

    return () => {
      disposed = true
      cancelAnimationFrame(gutterFrame)
      if (idleTimer) clearTimeout(idleTimer)
      setStatus(node.id, 'offline')
      observer.disconnect()
      bufferSub.dispose()
      container.classList.remove(ALT_BUFFER_CLASS)
      container.removeEventListener('dragover', handleDragOver)
      container.removeEventListener('drop', handleDrop)
      inputSub.dispose()
      offData()
      offExit()
      window.ptyApi.kill(ptyId)
      restoreMouseCoordinates()
      // Teardown must never throw out of a React cleanup: an exception during
      // the unmount commit unmounts the entire app — the canvas goes white on
      // a simple delete.
      try {
        term.dispose()
      } catch (err) {
        console.error('[terminal] xterm dispose failed:', err)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restartSignal, enabled])

  // Apply live style updates (theme, font, line height) without rebuilding the
  // pty session. Font metrics change the cell size, so the grid has to be
  // re-measured and the pty told about it — skipping the refit used to leave
  // xterm with more rows/cols than fit the node, and the surplus rows were
  // clipped against the node's edges.
  useEffect(() => {
    const term = termRef.current
    if (!term) return

    const signature = styleSignature(style, globalTheme)
    if (appliedStyleRef.current === signature) return
    appliedStyleRef.current = signature

    term.options.theme = THEMES[resolveTheme(style, globalTheme)]
    term.options.fontFamily = style.fontFamily
    term.options.fontSize = style.fontSize
    term.options.lineHeight = style.lineHeight
    ;(term as Terminal & { refresh: (start: number, end: number) => void }).refresh(0, term.rows)
    refit(fitRef.current, term, ptyIdRef.current)
  }, [style.theme, style.fontFamily, style.fontSize, style.lineHeight, globalTheme])

  return containerRef
}
