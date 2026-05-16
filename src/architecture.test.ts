/**
 * Architectural boundary tests.
 * Ensures that forbidden cross-layer imports do not exist:
 *   renderer → main, main → renderer, preload → renderer
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, relative } from 'path'
import { globSync } from 'fs'

const root = resolve(__dirname, '..')

function collectFiles(dir: string): string[] {
  const abs = resolve(root, dir)
  // Use glob pattern matching manually with fs
  const files: string[] = []
  const recurse = (d: string): void => {
    let entries: string[]
    try {
      entries = require('fs').readdirSync(d)
    } catch {
      return
    }
    for (const entry of entries) {
      const full = `${d}/${entry}`
      const stat = require('fs').statSync(full)
      if (stat.isDirectory()) {
        recurse(full)
      } else if (full.endsWith('.ts') || full.endsWith('.tsx')) {
        files.push(full)
      }
    }
  }
  recurse(abs)
  return files
}

function extractImports(filePath: string): string[] {
  const content = readFileSync(filePath, 'utf-8')
  const importRe = /(?:import|from)\s+['"]([^'"]+)['"]/g
  const imports: string[] = []
  let m: RegExpExecArray | null
  while ((m = importRe.exec(content)) !== null) {
    imports.push(m[1])
  }
  return imports
}

describe('Fronteiras arquiteturais — importações proibidas', () => {
  it('renderer não importa @main', () => {
    const rendererFiles = collectFiles('src/renderer')
    const violations: string[] = []
    for (const f of rendererFiles) {
      const imports = extractImports(f)
      for (const imp of imports) {
        if (imp.startsWith('@main') || imp.includes('/src/main/')) {
          violations.push(`${relative(root, f)} imports "${imp}"`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('main não importa @renderer', () => {
    const mainFiles = collectFiles('src/main')
    const violations: string[] = []
    for (const f of mainFiles) {
      const imports = extractImports(f)
      for (const imp of imports) {
        if (imp.startsWith('@renderer') || imp.includes('/src/renderer/')) {
          violations.push(`${relative(root, f)} imports "${imp}"`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('preload não importa @renderer', () => {
    const preloadFiles = collectFiles('src/preload')
    const violations: string[] = []
    for (const f of preloadFiles) {
      const imports = extractImports(f)
      for (const imp of imports) {
        if (imp.startsWith('@renderer') || imp.includes('/src/renderer/')) {
          violations.push(`${relative(root, f)} imports "${imp}"`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('preload não importa @main (exceto via electron contextBridge)', () => {
    const preloadFiles = collectFiles('src/preload')
    const violations: string[] = []
    for (const f of preloadFiles) {
      const imports = extractImports(f)
      for (const imp of imports) {
        if (imp.startsWith('@main') || imp.includes('/src/main/')) {
          violations.push(`${relative(root, f)} imports "${imp}"`)
        }
      }
    }
    expect(violations).toEqual([])
  })
})

describe('IPC — sem string literal de canal fora de @shared/types/ipc', () => {
  const knownChannels = [
    'pty:create', 'pty:input', 'pty:resize', 'pty:kill',
    'pty:data', 'pty:exit',
    'db:list-active', 'db:upsert', 'db:remove',
    'edges:list', 'edges:upsert', 'edges:remove',
    'dialog:select-folder'
  ]

  it('nenhum arquivo fora de @shared/types/ipc.ts usa string literal de canal IPC', () => {
    const allFiles = [
      ...collectFiles('src/main'),
      ...collectFiles('src/preload'),
      ...collectFiles('src/renderer')
    ]
    const violations: string[] = []
    const ipcFile = resolve(root, 'src/shared/types/ipc.ts')

    for (const f of allFiles) {
      if (f === ipcFile) continue
      const rawContent = readFileSync(f, 'utf-8')
      // Strip single-line comments (//) and multi-line comments (/* */) before checking
      const content = rawContent
        .replace(/\/\*[\s\S]*?\*\//g, '')  // multi-line comments
        .replace(/\/\/[^\n]*/g, '')         // single-line comments
      for (const ch of knownChannels) {
        // Match quoted channel strings (single or double quotes)
        const re = new RegExp(`['"\`]${ch}['"\`]`)
        if (re.test(content)) {
          violations.push(`${relative(root, f)} hardcodes "${ch}"`)
        }
      }
    }
    expect(violations).toEqual([])
  })
})
