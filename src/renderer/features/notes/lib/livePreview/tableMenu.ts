// The right-click menu of a rendered table cell.
//
// It is mounted on `document.body` rather than inside the editor: a note lives
// on a scaled/translated canvas, so anything positioned inside it would be
// clipped by the note's own box. That also means CodeMirror's scoped theme does
// not reach it — the look is inlined here, matching the app's context menus.

export interface TableMenuItem {
  label: string
  run: () => void
  /** Shown with a ✓ (used by the alignment entries). */
  checked?: boolean
  disabled?: boolean
}

export type TableMenuEntry = TableMenuItem | 'separator'

const MENU_WIDTH = 190

let close: (() => void) | null = null

/** Close the table menu if one is open. */
export function closeTableMenu(): void {
  close?.()
}

/** Open a menu at viewport coordinates `x`/`y`. Only one is ever open. */
export function openTableMenu(x: number, y: number, entries: TableMenuEntry[]): void {
  closeTableMenu()

  const backdrop = document.createElement('div')
  backdrop.className = 'cm-md-table-menu-backdrop'
  Object.assign(backdrop.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '100',
  })

  const menu = document.createElement('div')
  menu.className = 'cm-md-table-menu'
  Object.assign(menu.style, {
    position: 'fixed',
    left: `${Math.min(x, window.innerWidth - MENU_WIDTH - 8)}px`,
    top: `${y}px`,
    zIndex: '101',
    minWidth: `${MENU_WIDTH}px`,
    padding: '4px 0',
    borderRadius: '10px',
    border: '1px solid var(--line)',
    background: 'color-mix(in oklch, var(--bg-2) 96%, transparent)',
    backdropFilter: 'blur(10px)',
    boxShadow: '0 12px 32px -8px rgb(var(--shadow-color) / 0.32)',
    color: 'var(--fg)',
    fontSize: '12.5px',
  })

  const dismiss = (): void => {
    document.removeEventListener('keydown', onKeyDown, true)
    backdrop.remove()
    menu.remove()
    close = null
  }
  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') dismiss()
  }

  for (const entry of entries) {
    if (entry === 'separator') {
      const rule = document.createElement('div')
      Object.assign(rule.style, { height: '1px', margin: '4px 0', background: 'var(--line)' })
      menu.appendChild(rule)
      continue
    }
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'ctx-item'
    item.textContent = entry.label
    item.disabled = Boolean(entry.disabled)
    Object.assign(item.style, {
      display: 'flex',
      width: '100%',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '10px',
      padding: '7px 12px',
      background: 'transparent',
      border: '0',
      color: 'inherit',
      font: 'inherit',
      textAlign: 'left',
      cursor: entry.disabled ? 'default' : 'pointer',
      opacity: entry.disabled ? '0.45' : '1',
    })
    if (entry.checked) {
      const tick = document.createElement('span')
      tick.textContent = '✓'
      tick.style.color = 'var(--accent)'
      item.appendChild(tick)
    }
    // Keep the caret in the cell the menu was opened from.
    item.addEventListener('mousedown', (event) => event.preventDefault())
    item.addEventListener('click', () => {
      if (entry.disabled) return
      dismiss()
      entry.run()
    })
    menu.appendChild(item)
  }

  backdrop.addEventListener('mousedown', dismiss)
  backdrop.addEventListener('contextmenu', (event) => {
    event.preventDefault()
    dismiss()
  })
  document.addEventListener('keydown', onKeyDown, true)

  document.body.appendChild(backdrop)
  document.body.appendChild(menu)
  close = dismiss
}
