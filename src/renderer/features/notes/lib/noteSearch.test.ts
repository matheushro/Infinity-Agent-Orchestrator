import { describe, expect, it } from 'vitest'
import { createTextRanges, findTextMatches } from './noteSearch'

describe('noteSearch', () => {
  it('finds case-insensitive, non-overlapping matches', () => {
    expect(findTextMatches('Alpha alpha ALPHA', 'alpha')).toEqual([
      { start: 0, end: 5 },
      { start: 6, end: 11 },
      { start: 12, end: 17 },
    ])
  })

  it('creates a range that crosses rendered Markdown elements', () => {
    const root = document.createElement('div')
    root.innerHTML = '<strong>bold</strong> and <em>italic</em>'

    const [range] = createTextRanges(root, 'bold and italic')

    expect(range.toString()).toBe('bold and italic')
  })
})
