// Inline constructs: emphasis, code spans, links, images.
import type { SyntaxNode, SyntaxNodeRef } from '@lezer/common'
import { Decoration } from '@codemirror/view'
import { isRevealed, type DecorationContext, type NodeDecorator } from './context'
import { ImageWidget } from './widgets'

/** Class applied to the whole construct so it *looks* rendered while you type. */
const INLINE_CLASSES: Record<string, string> = {
  Emphasis: 'cm-md-em',
  StrongEmphasis: 'cm-md-strong',
  Strikethrough: 'cm-md-strike',
  InlineCode: 'cm-md-code',
  Link: 'cm-md-link',
}

/** Child nodes that carry pure syntax and are hidden while the cursor is away. */
const SYNTAX_CHILDREN = new Set([
  'EmphasisMark',
  'StrikethroughMark',
  'CodeMark',
  'LinkMark',
  'URL',
  'LinkTitle',
])

export function childrenOf(node: SyntaxNodeRef): SyntaxNode[] {
  const children: SyntaxNode[] = []
  for (let child = node.node.firstChild; child; child = child.nextSibling) children.push(child)
  return children
}

export function childNamed(node: SyntaxNodeRef, name: string): SyntaxNode | null {
  return node.node.getChild(name)
}

function decorateInline(node: SyntaxNodeRef, ctx: DecorationContext): NodeDecorator {
  ctx.add(Decoration.mark({ class: INLINE_CLASSES[node.name] }).range(node.from, node.to))
  if (isRevealed(ctx, node.from, node.to)) return
  for (const child of childrenOf(node)) {
    if (SYNTAX_CHILDREN.has(child.name) && child.to > child.from) {
      ctx.add(Decoration.replace({}).range(child.from, child.to))
    }
  }
}

function decorateImage(node: SyntaxNodeRef, ctx: DecorationContext): NodeDecorator {
  if (isRevealed(ctx, node.from, node.to)) return
  const url = childNamed(node, 'URL')
  if (!url) return
  const marks = childrenOf(node).filter((child) => child.name === 'LinkMark')
  const src = ctx.state.doc.sliceString(url.from, url.to)
  const alt =
    marks.length >= 2 ? ctx.state.doc.sliceString(marks[0].to, marks[1].from) : ''
  ctx.addWidget(
    Decoration.replace({ widget: new ImageWidget(src, alt) }).range(node.from, node.to),
  )
  return 'skip'
}

export const inlineDecorators: Record<
  string,
  (node: SyntaxNodeRef, ctx: DecorationContext) => NodeDecorator
> = {
  Emphasis: decorateInline,
  StrongEmphasis: decorateInline,
  Strikethrough: decorateInline,
  InlineCode: decorateInline,
  Link: decorateInline,
  Image: decorateImage,
}
