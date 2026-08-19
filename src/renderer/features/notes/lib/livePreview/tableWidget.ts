// The rendered — and directly editable — GFM table of a note.
//
// The old preview replaced a table with read-only HTML, which left the source
// reachable only as raw pipes. Here the rendered table *is* the editor: every
// cell is a `contenteditable` box that writes back into the Markdown on each
// keystroke, Tab/Enter walk the grid, and a right-click adds or removes rows
// and columns. (The raw pipes are still one click away — the note's "Markdown
// source" view mode.)
//
// Widget DOM is kept alive across document updates: an edit made here changes
// the document, which rebuilds the decoration set, and re-creating the table
// element mid-keystroke would drop the caret. `updateDOM` therefore patches the
// existing DOM in place and only ever rebuilds what actually changed.
import { EditorView, WidgetType } from '@codemirror/view'
import {
  deleteColumn,
  deleteRow,
  insertColumn,
  insertRow,
  parseMarkdownTable,
  serializeMarkdownTable,
  setCell,
  setColumnAlign,
  type ColumnAlign,
  type MarkdownTable,
} from '../markdownTable'
import { closeTableMenu, openTableMenu, type TableMenuEntry } from './tableMenu'

interface TableBinding {
  view: EditorView
  /** The widget's root element (`.cm-md-table-wrap`). */
  dom: HTMLElement
  /** Document offset of the table's first character. */
  from: number
  /** The Markdown this table was last built from or committed to. */
  source: string
  /**
   * The Markdown the DOM is already displaying. It runs ahead of `source` for
   * a keystroke inside a cell — the browser has drawn it, the document is only
   * catching up — and that is exactly when re-rendering must be skipped.
   */
  domSource: string
  table: MarkdownTable
  /** False while the note is only being viewed — cells are then read-only. */
  editable: boolean
}

const bindings = new WeakMap<HTMLElement, TableBinding>()
const wired = new WeakSet<HTMLElement>()

/**
 * Cell to put the caret in once the table's DOM has settled after an edit.
 * Module-level because a structural edit may make CodeMirror throw the widget
 * away and build a new one — the new instance picks the request up.
 */
let pendingFocus: { from: number; row: number; col: number; caret: number | 'end' } | null = null

export class TableWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly from: number,
    readonly editable: boolean,
  ) {
    super()
  }

  eq(other: TableWidget): boolean {
    return (
      other.source === this.source &&
      other.from === this.from &&
      other.editable === this.editable
    )
  }

  toDOM(view: EditorView): HTMLElement {
    const dom = document.createElement('div')
    dom.className = 'cm-md-table-wrap'
    const table = parseMarkdownTable(this.source)
    if (!table) return dom
    const binding: TableBinding = {
      view,
      dom,
      from: this.from,
      source: this.source,
      domSource: '',
      table,
      editable: this.editable,
    }
    bindings.set(dom, binding)
    renderTable(binding)
    // The element is not in the document yet, so focus has to wait a tick.
    queueMicrotask(() => applyPendingFocus(binding))
    return dom
  }

  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const binding = bindings.get(dom)
    if (!binding) return false
    binding.view = view
    binding.from = this.from
    // A keystroke inside a cell round-tripped through the document: this DOM
    // already shows it, and re-rendering would only disturb the caret.
    if (binding.domSource !== this.source || binding.editable !== this.editable) {
      const table = parseMarkdownTable(this.source)
      if (!table) return false
      binding.source = this.source
      binding.table = table
      binding.editable = this.editable
      renderTable(binding)
    }
    applyPendingFocus(binding)
    return true
  }

  destroy(dom: HTMLElement): void {
    bindings.delete(dom)
    closeTableMenu()
  }
}

// ── Rendering ────────────────────────────────────────────────────────────────

const ALIGN_CLASS: Record<ColumnAlign, string> = {
  none: '',
  left: ' cm-md-ta-left',
  center: ' cm-md-ta-center',
  right: ' cm-md-ta-right',
}

function createTableSkeleton(dom: HTMLElement): HTMLTableSectionElement {
  dom.textContent = ''
  const scroll = dom.appendChild(document.createElement('div'))
  scroll.className = 'cm-md-table-scroll'
  const element = scroll.appendChild(document.createElement('table'))
  element.className = 'cm-md-table'
  return element.appendChild(document.createElement('tbody'))
}

/**
 * Bring `binding.dom` in line with `binding.table`, reusing every element it
 * can. Reuse is not an optimisation here: detaching the cell that holds the
 * caret would blur the editor and end the note's editing session.
 */
function renderTable(binding: TableBinding): void {
  const { dom, table, editable } = binding
  const body = dom.querySelector('tbody') ?? createTableSkeleton(dom)

  while (body.rows.length > table.rows.length) body.deleteRow(body.rows.length - 1)
  while (body.rows.length < table.rows.length) body.appendChild(document.createElement('tr'))

  table.rows.forEach((cells, row) => {
    const tr = body.rows[row]
    while (tr.cells.length > cells.length) tr.deleteCell(tr.cells.length - 1)
    while (tr.cells.length < cells.length) {
      // Row 0 is the header and is never inserted or deleted, so a cell's tag
      // never has to change once it exists.
      tr.appendChild(document.createElement(row === 0 ? 'th' : 'td'))
    }
    cells.forEach((value, column) => {
      const cell = tr.cells[column]
      cell.className = `cm-md-table-cell${ALIGN_CLASS[table.aligns[column]]}`
      cell.dataset.row = String(row)
      cell.dataset.col = String(column)
      // Writing an identical value would still collapse the caret to the start.
      if (cell.textContent !== value) cell.textContent = value
      cell.setAttribute('contenteditable', editable ? 'true' : 'false')
      cell.setAttribute('spellcheck', 'false')
      if (!wired.has(cell)) {
        wired.add(cell)
        wireCell(cell)
      }
    })
  })

  syncAddButtons(binding)
  binding.domSource = binding.source
}

function syncAddButtons(binding: TableBinding): void {
  const { dom, editable } = binding
  for (const [className, label, title, add] of [
    ['cm-md-table-add-col', '+', 'Add column', addColumn],
    ['cm-md-table-add-row', '+', 'Add row', addRow],
  ] as const) {
    const existing = dom.querySelector(`.${className}`)
    if (!editable) {
      existing?.remove()
      continue
    }
    if (existing) continue
    const button = dom.appendChild(document.createElement('button'))
    button.type = 'button'
    button.className = `cm-md-table-add ${className}`
    button.textContent = label
    button.title = title
    button.setAttribute('aria-label', title)
    button.addEventListener('mousedown', (event) => event.preventDefault())
    button.addEventListener('click', (event) => {
      event.preventDefault()
      const current = bindings.get(dom)
      if (current) add(current)
    })
  }
}

// ── Editing ──────────────────────────────────────────────────────────────────

/**
 * Write `table` back into the document. Pass `domInSync` when the browser has
 * already drawn the change (a keystroke inside a cell) so the widget that comes
 * back leaves this DOM — and the caret in it — alone.
 */
function commit(
  binding: TableBinding,
  table: MarkdownTable,
  focus?: { row: number; col: number; caret?: number | 'end' },
  domInSync = false,
): void {
  const source = serializeMarkdownTable(table)
  const from = binding.from
  const to = from + binding.source.length
  if (focus) pendingFocus = { from, caret: 'end', ...focus }
  if (source === binding.source) {
    applyPendingFocus(binding)
    return
  }
  binding.table = table
  binding.source = source
  if (domInSync) binding.domSource = source
  binding.view.dispatch({ changes: { from, to, insert: source } })
  // Normally `updateDOM` has already honoured the request; this covers the case
  // where CodeMirror decided to rebuild the widget's DOM from scratch.
  applyPendingFocus(binding)
}

function wireCell(cell: HTMLTableCellElement): void {
  // Handlers stay attached across renders, so each one re-checks that the note
  // is still in edit mode — a resting note's table is a picture, not an editor.
  const editing = (): ReturnType<typeof cellContext> => {
    const context = cellContext(cell)
    return context?.binding.editable ? context : null
  }

  // A resting note enters edit mode on double-click; remember which cell was
  // aimed at so the caret lands there once the table comes back editable.
  cell.addEventListener('dblclick', () => {
    const context = cellContext(cell)
    if (!context || context.binding.editable) return
    pendingFocus = {
      from: context.binding.from,
      row: context.row,
      col: context.col,
      caret: 'end',
    }
  })

  cell.addEventListener('input', () => {
    const context = editing()
    if (!context) return
    const { binding, row, col } = context
    commit(
      binding,
      setCell(binding.table, row, col, cell.textContent ?? ''),
      { row, col, caret: caretOffset(cell) },
      true,
    )
  })

  // A cell is a single line of Markdown: paste arrives flattened, never as HTML.
  cell.addEventListener('paste', (event) => {
    const text = event.clipboardData?.getData('text/plain')
    if (text === undefined || !editing()) return
    event.preventDefault()
    insertText(cell, text.replace(/\s*\r?\n\s*/g, ' '))
  })

  cell.addEventListener('keydown', (event) => {
    const context = editing()
    if (!context) return
    const { binding, row, col } = context
    const columns = binding.table.aligns.length
    const lastRow = binding.table.rows.length - 1

    if (event.key === 'Tab') {
      event.preventDefault()
      const step = event.shiftKey ? -1 : 1
      const flat = row * columns + col + step
      if (flat < 0) return
      if (flat >= binding.table.rows.length * columns) {
        commit(binding, insertRow(binding.table, binding.table.rows.length), {
          row: lastRow + 1,
          col: 0,
        })
        return
      }
      focusCell(binding, Math.floor(flat / columns), flat % columns)
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      if (row === lastRow) {
        commit(binding, insertRow(binding.table, lastRow + 1), { row: lastRow + 1, col })
        return
      }
      focusCell(binding, row + 1, col)
      return
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const next = row + (event.key === 'ArrowUp' ? -1 : 1)
      if (next < 0 || next > lastRow) return
      event.preventDefault()
      focusCell(binding, next, col)
      return
    }

    if (event.key === 'Escape') {
      // Hand control back to the note: the caret lands right after the table.
      event.preventDefault()
      event.stopPropagation()
      const end = binding.from + binding.source.length
      binding.view.focus()
      binding.view.dispatch({ selection: { anchor: end } })
    }
  })

  cell.addEventListener('contextmenu', (event) => {
    const context = editing()
    if (!context) return
    // The note's own context menu must not open on top of the table's.
    event.preventDefault()
    event.stopPropagation()
    openTableMenu(event.clientX, event.clientY, cellMenu(context))
  })
}

function cellMenu({
  binding,
  row,
  col,
}: {
  binding: TableBinding
  row: number
  col: number
}): TableMenuEntry[] {
  const align = (label: string, value: ColumnAlign): TableMenuEntry => ({
    label,
    checked: binding.table.aligns[col] === value,
    run: () => commit(binding, setColumnAlign(binding.table, col, value), { row, col }),
  })

  return [
    {
      label: 'Insert row above',
      disabled: row === 0,
      run: () => commit(binding, insertRow(binding.table, row), { row, col }),
    },
    {
      label: 'Insert row below',
      run: () => commit(binding, insertRow(binding.table, row + 1), { row: row + 1, col }),
    },
    {
      label: 'Delete row',
      disabled: row === 0,
      run: () =>
        commit(binding, deleteRow(binding.table, row), {
          row: Math.min(row, binding.table.rows.length - 2),
          col,
        }),
    },
    'separator',
    {
      label: 'Insert column left',
      run: () => commit(binding, insertColumn(binding.table, col), { row, col }),
    },
    {
      label: 'Insert column right',
      run: () => commit(binding, insertColumn(binding.table, col + 1), { row, col: col + 1 }),
    },
    {
      label: 'Delete column',
      disabled: binding.table.aligns.length <= 1,
      run: () =>
        commit(binding, deleteColumn(binding.table, col), {
          row,
          col: Math.min(col, binding.table.aligns.length - 2),
        }),
    },
    'separator',
    align('Align left', 'left'),
    align('Align center', 'center'),
    align('Align right', 'right'),
    align('Align default', 'none'),
  ]
}

function addRow(binding: TableBinding): void {
  const row = binding.table.rows.length
  commit(binding, insertRow(binding.table, row), { row, col: 0 })
}

function addColumn(binding: TableBinding): void {
  const col = binding.table.aligns.length
  commit(binding, insertColumn(binding.table, col), { row: 0, col })
}

// ── Focus plumbing ───────────────────────────────────────────────────────────

function cellContext(
  cell: HTMLElement,
): { binding: TableBinding; row: number; col: number } | null {
  const wrap = cell.closest('.cm-md-table-wrap')
  const binding = wrap ? bindings.get(wrap as HTMLElement) : undefined
  // Row/column are read from the DOM, never captured: an insert or delete
  // shifts a cell's coordinates while its element stays put.
  if (!binding) return null
  return { binding, row: Number(cell.dataset.row), col: Number(cell.dataset.col) }
}

function cellAt(dom: HTMLElement, row: number, col: number): HTMLElement | null {
  return dom.querySelector(`[data-row="${row}"][data-col="${col}"]`)
}

function focusCell(
  binding: TableBinding,
  row: number,
  col: number,
  caret: number | 'end' = 'end',
): void {
  const cell = cellAt(binding.dom, row, col)
  if (!cell) return
  cell.focus()
  placeCaret(cell, caret)
}

function applyPendingFocus(binding: TableBinding): void {
  const request = pendingFocus
  if (!request || request.from !== binding.from || !binding.dom.isConnected) return
  const cell = cellAt(binding.dom, request.row, request.col)
  if (!cell) return
  pendingFocus = null
  if (cell.ownerDocument.activeElement === cell) return
  cell.focus()
  placeCaret(cell, request.caret)
}

function textLength(cell: HTMLElement): number {
  return cell.textContent?.length ?? 0
}

function placeCaret(cell: HTMLElement, caret: number | 'end'): void {
  const selection = cell.ownerDocument.defaultView?.getSelection()
  if (!selection) return
  const offset = Math.min(caret === 'end' ? textLength(cell) : caret, textLength(cell))
  const range = cell.ownerDocument.createRange()
  const text = cell.firstChild
  if (text && text.nodeType === Node.TEXT_NODE) range.setStart(text, offset)
  else range.selectNodeContents(cell)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

function caretOffset(cell: HTMLElement): number | 'end' {
  const selection = cell.ownerDocument.defaultView?.getSelection()
  if (!selection?.focusNode || !cell.contains(selection.focusNode)) return 'end'
  return selection.focusOffset
}

function insertText(cell: HTMLElement, text: string): void {
  const offset = caretOffset(cell)
  const current = cell.textContent ?? ''
  const at = offset === 'end' ? current.length : offset
  cell.textContent = current.slice(0, at) + text + current.slice(at)
  placeCaret(cell, at + text.length)
  cell.dispatchEvent(new Event('input', { bubbles: true }))
}
