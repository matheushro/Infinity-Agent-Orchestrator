export interface TextMatch {
  start: number
  end: number
}

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

interface TextSegment {
  node: Text
  start: number
  end: number
}

export function createTextRanges(root: HTMLElement, query: string): Range[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const segments: TextSegment[] = []
  let text = ''
  let node = walker.nextNode()

  while (node) {
    const value = node.textContent ?? ''
    if (value) {
      const start = text.length
      text += value
      segments.push({ node: node as Text, start, end: text.length })
    }
    node = walker.nextNode()
  }

  return findTextMatches(text, query).flatMap((match) => {
    const startSegment = segments.find(
      (segment) => match.start >= segment.start && match.start < segment.end,
    )
    const endSegment = segments.find(
      (segment) => match.end > segment.start && match.end <= segment.end,
    )
    if (!startSegment || !endSegment) return []

    const range = document.createRange()
    range.setStart(startSegment.node, match.start - startSegment.start)
    range.setEnd(endSegment.node, match.end - endSegment.start)
    return [range]
  })
}
