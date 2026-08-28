// Maps an agent's working directory back to the IAO terminal that launched it.
// IAO runs every agent inside `<repo>/.iao/roles/<terminalId>` (see
// promptFile.service), so the session's own cwd carries the terminal id.
const ROLE_CWD = /^(.*)\/\.iao\/roles\/([^/]+)\/?$/

/** Split an agent cwd into the repository root and the IAO terminal id. */
export function splitRoleCwd(cwd: string | null): {
  projectCwd: string | null
  terminalId: string | null
} {
  if (!cwd) return { projectCwd: null, terminalId: null }
  const match = ROLE_CWD.exec(cwd)
  if (!match) return { projectCwd: cwd, terminalId: null }
  return { projectCwd: match[1] || '/', terminalId: match[2] }
}
