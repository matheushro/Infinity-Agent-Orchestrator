import { describe, expect, it } from 'vitest'
import { toggleTaskAt } from './markdown'

describe('toggleTaskAt', () => {
  it('checks an unchecked task at the given index', () => {
    const md = '- [ ] one\n- [ ] two'
    expect(toggleTaskAt(md, 0)).toBe('- [x] one\n- [ ] two')
  })

  it('unchecks a checked task at the given index', () => {
    const md = '- [ ] one\n- [x] two'
    expect(toggleTaskAt(md, 1)).toBe('- [ ] one\n- [ ] two')
  })

  it('only toggles the task at the requested ordinal', () => {
    const md = '- [ ] a\n- [ ] b\n- [ ] c'
    expect(toggleTaskAt(md, 2)).toBe('- [ ] a\n- [ ] b\n- [x] c')
  })

  it('treats uppercase X as checked', () => {
    expect(toggleTaskAt('- [X] done', 0)).toBe('- [ ] done')
  })

  it('preserves the bullet style and indentation', () => {
    expect(toggleTaskAt('  * [ ] nested', 0)).toBe('  * [x] nested')
    expect(toggleTaskAt('1. [ ] ordered', 0)).toBe('1. [x] ordered')
  })

  it('returns the content unchanged when the index is out of range', () => {
    const md = '- [ ] only'
    expect(toggleTaskAt(md, 5)).toBe(md)
  })

  it('leaves non-task list items untouched', () => {
    const md = '- a bullet\n- [ ] a task'
    expect(toggleTaskAt(md, 0)).toBe('- a bullet\n- [x] a task')
  })
})
