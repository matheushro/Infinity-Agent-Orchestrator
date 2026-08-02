import { describe, expect, it } from 'vitest'
import { findTextMatches } from './noteSearch'

describe('noteSearch', () => {
  it('finds case-insensitive, non-overlapping matches', () => {
    expect(findTextMatches('Alpha alpha ALPHA', 'alpha')).toEqual([
      { start: 0, end: 5 },
      { start: 6, end: 11 },
      { start: 12, end: 17 },
    ])
  })

  it('returns offsets into the Markdown source', () => {
    expect(findTextMatches('**bold** text', 'bold')).toEqual([{ start: 2, end: 6 }])
  })

  it('has no matches for an empty query', () => {
    expect(findTextMatches('anything', '')).toEqual([])
  })
})
