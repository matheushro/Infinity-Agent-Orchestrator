// Canvas background palettes, selectable between dark and light.
import type { CanvasPalette, CanvasTheme } from './types'

export const CANVAS_THEMES: Record<CanvasTheme, CanvasPalette> = {
  dark: { bg: '#020617', dot: 'rgba(148,163,184,0.15)', empty: '#475569' },
  light: { bg: '#e2e8f0', dot: 'rgba(71,85,105,0.28)', empty: '#64748b' }
}
