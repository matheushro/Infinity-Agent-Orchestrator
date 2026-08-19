import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

type Candidate = [command: string, args: string[]]

/**
 * On macOS a GUI app launched from Finder/Dock inherits a minimal PATH
 * (`/usr/bin:/bin:/usr/sbin:/sbin`), so `code` is never found even when the
 * shell command is installed. Fall back to the well-known install locations and
 * finally to `open -a`, which does not need the CLI shim at all.
 */
function macCandidates(cwd: string): Candidate[] {
  const binaries = [
    '/usr/local/bin/code',
    '/opt/homebrew/bin/code',
    '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
    join(homedir(), 'Applications/Visual Studio Code.app/Contents/Resources/app/bin/code'),
  ]

  return [
    ['code', [cwd]],
    ...binaries.map((bin): Candidate => [bin, [cwd]]),
    ['open', ['-a', 'Visual Studio Code', cwd]],
  ]
}

function trySpawn(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    })

    child.once('error', () => resolve(false))
    child.once('spawn', () => {
      child.unref()
      resolve(true)
    })
  })
}

export async function openFolderInVSCode(folder: string): Promise<boolean> {
  const cwd = folder.trim()
  if (!cwd) return false

  const candidates: Candidate[] =
    process.platform === 'darwin' ? macCandidates(cwd) : [['code', [cwd]]]

  for (const [command, args] of candidates) {
    if (await trySpawn(command, args)) return true
  }

  return false
}
