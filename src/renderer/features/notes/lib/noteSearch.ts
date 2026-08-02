export interface TextMatch {
  start: number
  end: number
}

/**
 * Case-insensitive, non-overlapping matches of `query` in `text`, in document
 * order. Offsets are into the note's Markdown source — the live-preview editor
 * renders that very string, so they map straight onto editor positions.
 */
export function findTextMatches(text: string, query: string): TextMatch[] {
  if (!query) return []

  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(escapedQuery, 'giu')
  const matches: TextMatch[] = []

  for (const match of text.matchAll(pattern)) {
    const start = match.index
    matches.push({ start, end: start + match[0].length })
  }

  return matches
}
