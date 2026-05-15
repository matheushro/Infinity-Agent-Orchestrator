// Per-project IAO skill scaffolding. The skill is a markdown contract that
// teaches the in-terminal agent how to use the `iao` CLI; we ship a template in
// `resources/skills/iao/` and copy it into the user's project so the agent
// picks it up automatically. Customizations are never overwritten.
import { existsSync, mkdirSync, copyFileSync, statSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

const SKILL_FILENAME = 'SKILL.md'
// Codex discovers skills under `.agents/skills/<name>/`; Claude Code discovers
// them under `.claude/skills/<name>/`. We materialize the same template in
// both so either agent can pick it up from its native location.
const SKILL_RELATIVE_DIRS = [
  join('.agents', 'skills', 'iao'),
  join('.claude', 'skills', 'iao')
]

function sourceSkillPath(): string {
  // `app.getAppPath()` resolves to the project root in dev and the app bundle
  // in production; the `resources/` folder is shipped alongside the code.
  return join(app.getAppPath(), 'resources', 'skills', 'iao', SKILL_FILENAME)
}

/** Absolute path of the primary (Codex) skill location for a project. */
export function skillPathFor(projectPath: string): string {
  return join(projectPath, SKILL_RELATIVE_DIRS[0], SKILL_FILENAME)
}

/**
 * Ensure the IAO skill exists under both `.agents/skills/iao/SKILL.md` (Codex)
 * and `.claude/skills/iao/SKILL.md` (Claude Code). Existing files are left
 * alone so user edits are preserved. Returns the primary path.
 */
export function ensureIAOSkill(projectPath: string): string {
  if (!projectPath || !existsSync(projectPath) || !statSync(projectPath).isDirectory()) {
    throw new Error(`skill.service: invalid projectPath "${projectPath}"`)
  }
  const src = sourceSkillPath()
  if (!existsSync(src)) {
    throw new Error(`skill.service: template skill missing at ${src}`)
  }

  for (const relDir of SKILL_RELATIVE_DIRS) {
    const dest = join(projectPath, relDir, SKILL_FILENAME)
    if (existsSync(dest)) continue
    mkdirSync(join(projectPath, relDir), { recursive: true })
    copyFileSync(src, dest)
  }
  return skillPathFor(projectPath)
}
