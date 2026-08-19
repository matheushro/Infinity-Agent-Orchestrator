// DOM widgets that stand in for Markdown source in live preview.
//
// Each widget replaces a range of the document. `eq` compares the data the DOM
// was built from so CodeMirror reuses the existing node across rebuilds instead
// of remounting it — a remount between mousedown and mouseup would swallow the
// checkbox `click`, which is exactly the bug the old react-markdown preview had.
// (Tables get their own, interactive widget: `tableWidget.ts`.)
import { EditorView, WidgetType } from '@codemirror/view'

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
