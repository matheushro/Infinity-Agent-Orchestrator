import { spawn } from 'node:child_process'

export function openFolderInVSCode(folder: string): Promise<boolean> {
  const cwd = folder.trim()
  if (!cwd) return Promise.resolve(false)

  return new Promise((resolve) => {
    const child = spawn('code', [cwd], {
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
