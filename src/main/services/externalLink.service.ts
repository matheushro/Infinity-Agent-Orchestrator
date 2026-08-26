// Outward-bound links. Anything that is not the app's own document goes to the
// user's default browser: an Electron window has no address bar or back button,
// so a page loaded in-app is a dead end.
import { shell, type BrowserWindow } from 'electron'

/** Schemes we are willing to hand to the OS. Everything else is dropped. */
const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

export function isExternalUrl(url: string): boolean {
  try {
    return EXTERNAL_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    return false
  }
}

export async function openExternalUrl(url: string): Promise<boolean> {
  const target = url.trim()
  if (!isExternalUrl(target)) return false

  try {
    await shell.openExternal(target)
    return true
  } catch {
    return false
  }
}

/**
 * The app's own document: the packaged `file://` bundle, or the Vite dev server
 * in development. Those must keep navigating normally.
 */
function isAppUrl(url: string): boolean {
  if (url.startsWith('file:')) return true
  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  return Boolean(rendererUrl) && url.startsWith(rendererUrl as string)
}

/**
 * Catch-all for links the renderer did not route itself: `window.open`, target
 * `_blank` anchors and plain in-place navigations all end up in the browser
 * instead of replacing (or stacking a chromeless window on top of) the canvas.
 */
export function attachExternalLinkHandlers(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalUrl(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return
    event.preventDefault()
    void openExternalUrl(url)
  })
}
