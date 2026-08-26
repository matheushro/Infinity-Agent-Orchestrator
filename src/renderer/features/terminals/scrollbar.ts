// Sizing/colors for a terminal's scrollbar, as CSS custom properties consumed
// by the `.terminal-surface` rules in styles/index.css.
//
// The width is deliberately *fixed* in world px rather than counter-scaled with
// the canvas zoom: xterm reserves the gutter at fit time, so a width that moved
// with the zoom would leave the grid one column too wide and the agent's input
// box would paint straight over the bar. What still needs solving is the thumb
// length — a long agent transcript fills the scrollback and the browser shrinks
// the thumb proportionally until it is a few unclickable pixels tall.
import type { CSSProperties } from 'react'

/** Bar width in world px — wide enough to grab, narrow enough to ignore. */
export const SCROLLBAR_WIDTH = 14
/** Shortest the thumb may get, however deep the scrollback. */
export const SCROLLBAR_MIN_THUMB = 40

/**
 * CSS variables for a terminal surface. The colors are derived from the
 * terminal's own resolved theme, not the app theme — a light terminal inside a
 * dark app still needs a dark thumb to be visible.
 */
export function terminalScrollbarVars(isDark: boolean): CSSProperties {
  const ink = isDark ? '226, 232, 240' : '31, 36, 48'
  return {
    '--term-sb-width': `${SCROLLBAR_WIDTH}px`,
    '--term-sb-min-thumb': `${SCROLLBAR_MIN_THUMB}px`,
    '--term-sb-track': `rgba(${ink}, 0.07)`,
    '--term-sb-thumb': `rgba(${ink}, 0.32)`,
    '--term-sb-thumb-hover': `rgba(${ink}, 0.55)`,
  } as CSSProperties
}
