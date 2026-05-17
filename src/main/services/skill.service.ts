// User-global IAO skill scaffolding. The skill is a markdown contract that
// teaches the in-terminal agent how to use the `iao` CLI; we ship a template
// in `resources/skills/iao/` and copy it into the user's agent-specific config
// roots so the agent picks it up automatically in *any* project, not just the
// one currently open on the canvas. The bundled template is always written so
// agents pick up the latest version on every launch.
import { existsSync, mkdirSync, copyFileSync } from 'fs'
import { join } from 'path'
import os from 'os'
import { app } from 'electron'
import { AGENTS } from '@shared/agents'

const SKILL_FILENAME = 'SKILL.md'
// Skills are installed at the user level so any agent launched from any
// working directory can discover them. Each launchable agent declares its own
// preferred skill root in the shared registry.
const SKILL_INSTALL_DIRS = Object.values(AGENTS)
  .map((agent) => agent.skillDir)
  .filter((skillDir): skillDir is string => Boolean(skillDir))
  .map((skillDir) => join(os.homedir(), skillDir))

function sourceSkillPath(): string {
  // `app.getAppPath()` resolves to the project root in dev and the app bundle
  // in production; the `resources/` folder is shipped alongside the code.
  return join(app.getAppPath(), 'resources', 'skills', 'iao', SKILL_FILENAME)
}

/** Absolute path of the primary (Codex) user-level skill location. */
export function skillPathFor(_projectPath?: string): string {
  return join(os.homedir(), AGENTS.codex.skillDir ?? '.codex/skills/iao', SKILL_FILENAME)
}

/**
 * Ensure the IAO skill is up to date under each launchable agent's configured
 * user-level skill directory. The bundled template is always copied over the
 * existing file so agents pick up the newest version on every launch.
 * Returns the primary path.
 *
 * The `_projectPath` argument is accepted for backwards compatibility with
 * callers that used to scope the skill per-project, but is intentionally
 * ignored — the skill is always installed at the user-global root.
 */
export function ensureIAOSkill(_projectPath?: string): string {
  const src = sourceSkillPath()
  if (!existsSync(src)) {
    throw new Error(`skill.service: template skill missing at ${src}`)
  }

  for (const dir of SKILL_INSTALL_DIRS) {
    mkdirSync(dir, { recursive: true })
    copyFileSync(src, join(dir, SKILL_FILENAME))
  }
  return skillPathFor()
}
