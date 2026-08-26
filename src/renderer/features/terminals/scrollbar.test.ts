import { describe, expect, it } from 'vitest'
import { SCROLLBAR_MIN_THUMB, SCROLLBAR_WIDTH, terminalScrollbarVars } from './scrollbar'

describe('terminalScrollbarVars', () => {
  it('exposes the bar geometry as CSS custom properties', () => {
    const vars = terminalScrollbarVars(true) as Record<string, string>

    expect(vars['--term-sb-width']).toBe(`${SCROLLBAR_WIDTH}px`)
    expect(vars['--term-sb-min-thumb']).toBe(`${SCROLLBAR_MIN_THUMB}px`)
  })

  // xterm reserves the scrollbar gutter when it fits the grid, so a width that
  // moved afterwards (e.g. with the canvas zoom) would leave a column of text
  // painting over the bar — the agent's input box swallowed it.
  it('keeps the width constant so the reserved gutter stays valid', () => {
    const dark = terminalScrollbarVars(true) as Record<string, string>
    const light = terminalScrollbarVars(false) as Record<string, string>

    expect(dark['--term-sb-width']).toBe(light['--term-sb-width'])
  })

  // A light terminal inside a dark app (or the reverse) needs a thumb keyed to
  // the terminal's own background, not the app theme.
  it('inks the thumb from the terminal theme, not the app theme', () => {
    const dark = terminalScrollbarVars(true) as Record<string, string>
    const light = terminalScrollbarVars(false) as Record<string, string>

    expect(dark['--term-sb-thumb']).not.toBe(light['--term-sb-thumb'])
    expect(dark['--term-sb-thumb-hover']).not.toBe(dark['--term-sb-thumb'])
  })
})
