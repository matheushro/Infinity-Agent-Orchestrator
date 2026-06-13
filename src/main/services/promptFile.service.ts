// Delivers a terminal's prompt to its agent by writing it into the agent's
// native context file (CLAUDE.md / AGENTS.md / …) inside an IAO-managed marker
// block, instead of injecting it at runtime via a flag or REPL message. The
// agent then reads the role as part of its normal context on startup and again
// after `/clear`, so the prompt survives without re-injection.
//
// Everything outside the markers is the user's own file and is never touched.
// Best-effort: a failure here (unwritable cwd, …) must not block the pty, so the
// whole operation is wrapped and only logged.
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'fs'
import { dirname, join } from 'path'

const BLOCK_START = '<!-- iao:prompt start -->'
const BLOCK_END = '<!-- iao:prompt end -->'

// The whole managed block, markers included. Non-greedy so it stops at the
// first end marker; `[\s\S]` matches across newlines.
const BLOCK_RE = /<!-- iao:prompt start -->[\s\S]*?<!-- iao:prompt end -->/

function blockText(prompt: string): string {
  return `${BLOCK_START}\n${prompt}\n${BLOCK_END}`
}

/** Replace an existing block in place, or append a new one, preserving the rest. */
function upsertBlock(content: string, prompt: string): string {
  const block = blockText(prompt)
  if (BLOCK_RE.test(content)) return content.replace(BLOCK_RE, block)
  if (content === '') return `${block}\n`
  // Append after the user's content, keeping a blank line between the two.
  const base = content.endsWith('\n') ? content : `${content}\n`
  return `${base}\n${block}\n`
}

/** Strip the managed block (and the blank line it sat on), keeping user content. */
function removeBlock(content: string): string {
  if (!BLOCK_RE.test(content)) return content
  const next = content
    .replace(BLOCK_RE, '')
    .replace(/\n{3,}/g, '\n\n') // collapse the gap the block left behind
    .replace(/^\n+/, '') // drop a leading blank line if the block was first
    .replace(/\n+$/, '\n') // normalize trailing newlines
  return next === '\n' ? '' : next
}

/**
 * Add `entry` to `<cwd>/.gitignore` so an IAO-created context file does not dirty
 * version control. Only acts inside a git repo (a `.git` entry exists), and is a
 * no-op when the entry is already ignored. Creates `.gitignore` if absent.
 */
function ignoreInGit(cwd: string, entry: string): void {
  if (!existsSync(join(cwd, '.git'))) return
  const gitignore = join(cwd, '.gitignore')
  const current = existsSync(gitignore) ? readFileSync(gitignore, 'utf8') : ''
  const alreadyIgnored = current
    .split('\n')
    .some((line) => line.trim() === entry || line.trim() === `/${entry}`)
  if (alreadyIgnored) return
  const prefix = current && !current.endsWith('\n') ? '\n' : ''
  appendFileSync(gitignore, `${prefix}${entry}\n`)
}

/**
 * Write `prompt` into `<cwd>/<contextFile>` inside the IAO marker block:
 * replaces the block if present, appends one if not, and removes it when the
 * prompt is empty. Content outside the markers is preserved untouched. When IAO
 * creates the context file from scratch, it is added to `.gitignore`.
 */
export function applyPrompt(cwd: string, contextFile: string, prompt: string): void {
  try {
    const target = join(cwd, contextFile)
    const fileExisted = existsSync(target)
    const current = fileExisted ? readFileSync(target, 'utf8') : ''
    const trimmed = prompt.trim()

    const next = trimmed ? upsertBlock(current, trimmed) : removeBlock(current)
    if (next === current) return // nothing to write (e.g. empty prompt, no block)

    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, next, 'utf8')

    // Only gitignore a file the user did not already own, and only when we
    // actually created it (a non-empty prompt produced content).
    if (!fileExisted && trimmed) ignoreInGit(cwd, contextFile)
  } catch (err) {
    console.warn('[promptFile] applyPrompt skipped:', (err as Error).message)
  }
}
