// Block constructs: headings, quotes, lists, rules, fenced code, tables.
import type { SyntaxNodeRef } from '@lezer/common'
import { Decoration } from '@codemirror/view'
import {
  isLineRevealed,
  lineSpan,
  skipSpaces,
  type DecorationContext,
  type NodeDecorator,
} from './context'
import { childNamed } from './inline'
import { BulletWidget, CheckboxWidget, MarkdownBlockWidget, RuleWidget } from './widgets'

const FENCE = /^\s*(?:```|~~~)/

function decorateHeading(level: number) {
  return (node: SyntaxNodeRef, ctx: DecorationContext): NodeDecorator => {
    const line = ctx.state.doc.lineAt(node.from)
    ctx.add(Decoration.line({ class: `cm-md-heading cm-md-h${level}` }).range(line.from))
    if (isLineRevealed(ctx, node.from, node.to)) return
    const mark = childNamed(node, 'HeaderMark')
    if (mark) ctx.add(Decoration.replace({}).range(mark.from, skipSpaces(ctx.state, mark.to)))
  }
}

function decorateQuote(node: SyntaxNodeRef, ctx: DecorationContext): NodeDecorator {
  const span = lineSpan(ctx.state, node.from, node.to)
  const first = ctx.state.doc.lineAt(span.from).number
  const last = ctx.state.doc.lineAt(span.to).number
  for (let number = first; number <= last; number += 1) {
    ctx.add(Decoration.line({ class: 'cm-md-quote' }).range(ctx.state.doc.line(number).from))
  }
}

function decorateQuoteMark(node: SyntaxNodeRef, ctx: DecorationContext): NodeDecorator {
  if (isLineRevealed(ctx, node.from, node.to)) return
  ctx.add(Decoration.replace({}).range(node.from, skipSpaces(ctx.state, node.to)))
}

function decorateListMark(node: SyntaxNodeRef, ctx: DecorationContext): NodeDecorator {
  if (isLineRevealed(ctx, node.from, node.to)) return
  // A task item renders its own checkbox, so its bullet is dropped entirely
  // (that is how Obsidian lays out `- [ ] …`).
  if (node.node.nextSibling?.name === 'Task') {
    ctx.add(Decoration.replace({}).range(node.from, skipSpaces(ctx.state, node.to)))
    return
  }
  // Ordered markers stay as text — the number *is* the rendered bullet.
  if (/\d/.test(ctx.state.doc.sliceString(node.from, node.to))) return
  ctx.addWidget(Decoration.replace({ widget: new BulletWidget() }).range(node.from, node.to))
}

function decorateTaskMarker(node: SyntaxNodeRef, ctx: DecorationContext): NodeDecorator {
  const checked = /\[[xX]\]/.test(ctx.state.doc.sliceString(node.from, node.to))
  ctx.addWidget(
    Decoration.replace({
      widget: new CheckboxWidget(checked, node.from, node.to),
    }).range(node.from, node.to),
  )
  return 'skip'
}

function decorateRule(node: SyntaxNodeRef, ctx: DecorationContext): NodeDecorator {
  if (isLineRevealed(ctx, node.from, node.to)) return
  const span = lineSpan(ctx.state, node.from, node.to)
  ctx.addWidget(
    Decoration.replace({ widget: new RuleWidget(), block: true }).range(span.from, span.to),
  )
  return 'skip'
}

function decorateFencedCode(node: SyntaxNodeRef, ctx: DecorationContext): NodeDecorator {
  const revealed = isLineRevealed(ctx, node.from, node.to)
  const span = lineSpan(ctx.state, node.from, node.to)
  const first = ctx.state.doc.lineAt(span.from).number
  const last = ctx.state.doc.lineAt(span.to).number

  for (let number = first; number <= last; number += 1) {
    const line = ctx.state.doc.line(number)
    const isFence = (number === first || number === last) && FENCE.test(line.text)
    if (!revealed && isFence && line.to > line.from) {
      // Drop the ``` lines the way a rendered code block would.
      ctx.addWidget(Decoration.replace({ block: true }).range(line.from, line.to))
      continue
    }
    ctx.add(Decoration.line({ class: 'cm-md-code-line' }).range(line.from))
  }
  return 'skip'
}

function decorateTable(node: SyntaxNodeRef, ctx: DecorationContext): NodeDecorator {
  const span = lineSpan(ctx.state, node.from, node.to)
  if (isLineRevealed(ctx, node.from, node.to)) {
    const first = ctx.state.doc.lineAt(span.from).number
    const last = ctx.state.doc.lineAt(span.to).number
    for (let number = first; number <= last; number += 1) {
      ctx.add(Decoration.line({ class: 'cm-md-table-source' }).range(ctx.state.doc.line(number).from))
    }
    return 'skip'
  }
  const source = ctx.state.doc.sliceString(span.from, span.to)
  ctx.addWidget(
    Decoration.replace({ widget: new MarkdownBlockWidget(source), block: true }).range(
      span.from,
      span.to,
    ),
  )
  return 'skip'
}

export const blockDecorators: Record<
  string,
  (node: SyntaxNodeRef, ctx: DecorationContext) => NodeDecorator
> = {
  ATXHeading1: decorateHeading(1),
  ATXHeading2: decorateHeading(2),
  ATXHeading3: decorateHeading(3),
  ATXHeading4: decorateHeading(4),
  ATXHeading5: decorateHeading(5),
  ATXHeading6: decorateHeading(6),
  Blockquote: decorateQuote,
  QuoteMark: decorateQuoteMark,
  ListMark: decorateListMark,
  TaskMarker: decorateTaskMarker,
  HorizontalRule: decorateRule,
  FencedCode: decorateFencedCode,
  Table: decorateTable,
}
