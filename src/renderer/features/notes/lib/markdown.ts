// Pure helpers for the Markdown body of a note.

// Matches a GFM task-list marker at the start of a list item, capturing the
// list bullet (so it is preserved) and the checkbox state character.
// Handles `-`/`*`/`+` and ordered (`1.`/`1)`) bullets with any indentation.
const TASK_MARKER = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/gm

/**
 * Toggle the checkbox of the task-list item at `index` (0-based, in document
 * order) within Markdown `content`. Returns the content unchanged if there is
 * no task at that index. The order matches how `react-markdown` + `remark-gfm`
 * render checkboxes, so the index handed back from an `onChange` lines up.
 */
export function toggleTaskAt(content: string, index: number): string {
  let i = 0
  return content.replace(TASK_MARKER, (match, bullet: string, state: string) => {
    if (i++ !== index) return match
    const checked = state === 'x' || state === 'X'
    return `${bullet}[${checked ? ' ' : 'x'}]`
  })
}
