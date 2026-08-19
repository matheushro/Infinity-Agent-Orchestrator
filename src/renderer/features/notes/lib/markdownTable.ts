// GFM pipe tables as data: parsing, serialising, and the structural edits the
// note's table editor performs (add/remove rows and columns, alignment).
//
// Pure — no DOM, no CodeMirror. `rows[0]` is the header row, so every edit is
// expressed against one uniform grid; serialisation re-inserts the delimiter
// line and pads every column so the raw Markdown stays readable.

export type ColumnAlign = 'none' | 'left' | 'center' | 'right'

export interface MarkdownTable {
  /** `rows[0]` is the header; every row holds exactly `aligns.length` cells. */
  rows: string[][]
  aligns: ColumnAlign[]
}

/** A delimiter cell: `---`, `:--`, `--:` or `:-:`. */
const DELIMITER_CELL = /^:?-+:?$/
const MIN_COLUMN_WIDTH = 3

/** Split one table line into its cells, honouring `\|` escapes. */
function splitRow(line: string): string[] {
  const trimmed = line.trim()
  const cells: string[] = []
  let current = ''
  for (let index = trimmed.startsWith('|') ? 1 : 0; index < trimmed.length; index += 1) {
    const char = trimmed[index]
    if (char === '\\' && trimmed[index + 1] === '|') {
      current += '|'
      index += 1
      continue
    }
    if (char === '|') {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  // A trailing `|` already closed the last cell; anything left is one more.
  if (current.trim() !== '' || cells.length === 0) cells.push(current.trim())
  return cells
}

function alignOf(delimiter: string): ColumnAlign {
  const left = delimiter.startsWith(':')
  const right = delimiter.endsWith(':')
  if (left && right) return 'center'
  if (left) return 'left'
  if (right) return 'right'
  return 'none'
}

/** Force a row to `columns` cells — short rows pad, long rows are trimmed. */
function fitRow(cells: string[], columns: number): string[] {
  return Array.from({ length: columns }, (_, index) => cells[index] ?? '')
}

/** A cell as it may appear in the source: no pipes, no line breaks. */
function escapeCell(value: string): string {
  return value.replace(/\s*\r?\n\s*/g, ' ').replace(/\|/g, '\\|').trim()
}

/**
 * Parse a GFM pipe table. Returns `null` when `source` is not one — the caller
 * then leaves the raw Markdown on screen instead of rendering a table.
 */
export function parseMarkdownTable(source: string): MarkdownTable | null {
  const lines = source.split('\n').map((line) => line.replace(/\r$/, ''))
  while (lines.length && lines[0].trim() === '') lines.shift()
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
  if (lines.length < 2) return null

  const header = splitRow(lines[0])
  const delimiter = splitRow(lines[1])
  if (delimiter.length !== header.length) return null
  if (!delimiter.every((cell) => DELIMITER_CELL.test(cell))) return null

  const aligns = delimiter.map(alignOf)
  const rows = [header, ...lines.slice(2).map(splitRow)].map((row) => fitRow(row, aligns.length))
  return { rows, aligns }
}

function delimiterCell(align: ColumnAlign, width: number): string {
  switch (align) {
    case 'left':
      return `:${'-'.repeat(width - 1)}`
    case 'right':
      return `${'-'.repeat(width - 1)}:`
    case 'center':
      return `:${'-'.repeat(width - 2)}:`
    default:
      return '-'.repeat(width)
  }
}

/** Render a table back to Markdown, padded so the columns line up. */
export function serializeMarkdownTable(table: MarkdownTable): string {
  const columns = table.aligns.length
  const cells = table.rows.map((row) => fitRow(row, columns).map(escapeCell))
  const widths = Array.from({ length: columns }, (_, column) =>
    Math.max(MIN_COLUMN_WIDTH, ...cells.map((row) => row[column].length)),
  )
  const line = (row: string[]): string =>
    `| ${row.map((cell, column) => cell.padEnd(widths[column])).join(' | ')} |`

  return [
    line(cells[0] ?? []),
    `| ${table.aligns.map((align, column) => delimiterCell(align, widths[column])).join(' | ')} |`,
    ...cells.slice(1).map(line),
  ].join('\n')
}

export function setCell(
  table: MarkdownTable,
  row: number,
  column: number,
  value: string,
): MarkdownTable {
  return {
    ...table,
    rows: table.rows.map((cells, index) =>
      index === row ? cells.map((cell, at) => (at === column ? value : cell)) : cells,
    ),
  }
}

/** Insert an empty row at `index` (1 = just under the header). */
export function insertRow(table: MarkdownTable, index: number): MarkdownTable {
  const at = Math.min(Math.max(index, 1), table.rows.length)
  const rows = [...table.rows]
  rows.splice(at, 0, table.aligns.map(() => ''))
  return { ...table, rows }
}

/** Remove a body row. The header (index 0) is never removed. */
export function deleteRow(table: MarkdownTable, index: number): MarkdownTable {
  if (index < 1 || index >= table.rows.length) return table
  return { ...table, rows: table.rows.filter((_, at) => at !== index) }
}

export function insertColumn(table: MarkdownTable, index: number): MarkdownTable {
  const at = Math.min(Math.max(index, 0), table.aligns.length)
  const aligns = [...table.aligns]
  aligns.splice(at, 0, 'none')
  return {
    aligns,
    rows: table.rows.map((cells) => {
      const next = [...cells]
      next.splice(at, 0, '')
      return next
    }),
  }
}

/** Remove a column. The last remaining column is kept. */
export function deleteColumn(table: MarkdownTable, index: number): MarkdownTable {
  if (table.aligns.length <= 1 || index < 0 || index >= table.aligns.length) return table
  return {
    aligns: table.aligns.filter((_, at) => at !== index),
    rows: table.rows.map((cells) => cells.filter((_, at) => at !== index)),
  }
}

export function setColumnAlign(
  table: MarkdownTable,
  column: number,
  align: ColumnAlign,
): MarkdownTable {
  return {
    ...table,
    aligns: table.aligns.map((current, at) => (at === column ? align : current)),
  }
}
