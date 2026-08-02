// DOM widgets that stand in for Markdown source in live preview.
//
// Each widget replaces a range of the document. `eq` compares the data the DOM
// was built from so CodeMirror reuses the existing node across rebuilds instead
// of remounting it — a remount between mousedown and mouseup would swallow the
// checkbox `click`, which is exactly the bug the old react-markdown preview had.
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { EditorView, WidgetType } from '@codemirror/view'

const REMARK_PLUGINS = [remarkGfm]

/** Task-list checkbox. Toggling rewrites the `[ ]` / `[x]` marker in the doc. */
export class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly from: number,
    readonly to: number,
  ) {
    super()
  }

  eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked && other.from === this.from && other.to === this.to
  }

  toDOM(view: EditorView): HTMLElement {
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.className = 'cm-md-task'
    input.checked = this.checked
    // Keep the caret where it was: a mousedown inside the widget would move the
    // selection, re-rendering the line under the pointer mid-click.
    input.addEventListener('mousedown', (event) => event.preventDefault())
    input.addEventListener('click', (event) => {
      event.stopPropagation()
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: this.checked ? '[ ]' : '[x]' },
      })
    })
    return input
  }
}

/** Rendered bullet for `-`/`*`/`+` list markers. */
export class BulletWidget extends WidgetType {
  eq(): boolean {
    return true
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-md-bullet'
    span.textContent = '•'
    return span
  }
}

/** Rendered `---` rule. */
export class RuleWidget extends WidgetType {
  eq(): boolean {
    return true
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-md-rule'
    wrap.appendChild(document.createElement('hr'))
    return wrap
  }
}

export class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
  ) {
    super()
  }

  eq(other: ImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt
  }

  toDOM(): HTMLElement {
    const img = document.createElement('img')
    img.className = 'cm-md-image'
    img.src = this.src
    img.alt = this.alt
    return img
  }
}

/**
 * Block widget for constructs that cannot be edited character-by-character in
 * place — today only GFM tables. The source is rendered through the same
 * react-markdown pipeline (and the same `.note-markdown` CSS) the old preview
 * used, so table rendering is unchanged.
 *
 * React renders in a microtask: `toDOM` runs inside CodeMirror's DOM update,
 * which may itself sit inside a React commit, and rendering a new root from
 * there would warn about updating a component while another one renders.
 */
export class MarkdownBlockWidget extends WidgetType {
  private root: Root | null = null

  constructor(readonly source: string) {
    super()
  }

  eq(other: MarkdownBlockWidget): boolean {
    return other.source === this.source
  }

  toDOM(): HTMLElement {
    const container = document.createElement('div')
    container.className = 'cm-md-block note-markdown'
    queueMicrotask(() => {
      if (this.destroyed) return
      this.root = createRoot(container)
      this.root.render(
        createElement(ReactMarkdown, { remarkPlugins: REMARK_PLUGINS }, this.source),
      )
    })
    return container
  }

  destroy(): void {
    this.destroyed = true
    const root = this.root
    this.root = null
    // Unmounting synchronously from CodeMirror's update would land inside a
    // React render pass; defer it the same way we defer the mount.
    if (root) queueMicrotask(() => root.unmount())
  }

  private destroyed = false
}
