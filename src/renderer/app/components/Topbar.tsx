// Workspace topbar: breadcrumb, terminal count chip, fullscreen toggle.
// Theme and default-shell selectors live in the Settings modal (sidebar footer).
import { useEffect, useState } from 'react'
import {
  IChevRight,
  IFullScreenEnter,
  IFullScreenExit,
} from '@renderer/components/ui'

interface TopbarProps {
  workspaceName: string
  terminalCount: number
}

export function Topbar({
  workspaceName,
  terminalCount,
}: TopbarProps): JSX.Element {
  return (
    <header
      className="topbar flex items-center gap-3 px-4"
      style={{ height: 44, flexShrink: 0 }}
    >
      <div
        className="flex items-center gap-2 text-[12.5px]"
        style={{ color: 'var(--fg-3)' }}
      >
        <span>Workspace</span>
        <IChevRight size={11} />
        <span style={{ color: 'var(--fg)', fontWeight: 500 }}>{workspaceName}</span>
        <span className="chip ml-1">
          {terminalCount} {terminalCount === 1 ? 'terminal' : 'terminals'}
        </span>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <FullScreenToggle />
      </div>
    </header>
  )
}

function FullScreenToggle(): JSX.Element {
  const api = typeof window !== 'undefined' ? window.windowApi : undefined
  const [isFs, setIsFs] = useState(false)

  useEffect(() => {
    if (!api) return
    let cancelled = false
    api.isFullScreen().then((value) => {
      if (!cancelled) setIsFs(value)
    })
    const off = api.onFullScreenChange((value) => setIsFs(value))
    return () => {
      cancelled = true
      off()
    }
  }, [api])

  async function toggle(): Promise<void> {
    if (!api) return
    const next = await api.setFullScreen(!isFs)
    setIsFs(next)
  }

  return (
    <button
      className="icon-btn"
      onClick={toggle}
      title={isFs ? 'Exit full screen' : 'Enter full screen'}
      aria-label={isFs ? 'Exit full screen' : 'Enter full screen'}
      aria-pressed={isFs}
      disabled={!api}
    >
      {isFs ? <IFullScreenExit size={14} /> : <IFullScreenEnter size={14} />}
    </button>
  )
}
