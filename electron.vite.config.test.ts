/**
 * Structural tests for electron.vite.config.ts and supporting configuration files.
 * We read the config as text (to avoid esbuild incompatibility in the jsdom
 * environment) and verify that the expected build targets, aliases, and entries
 * are declared. Alias resolution in the *test* runtime is verified separately
 * by importing @shared modules directly.
 */

import { describe, it, expect } from 'vitest'
import { resolve } from 'path'
import { readFileSync, existsSync } from 'fs'

const root = resolve(__dirname)
const configPath = resolve(root, 'electron.vite.config.ts')
const configSrc = readFileSync(configPath, 'utf-8')

describe('electron.vite.config.ts — build targets declarados', () => {
  it('arquivo existe no root do projeto', () => {
    expect(existsSync(configPath)).toBe(true)
  })

  it('define configuração para o target main', () => {
    expect(configSrc).toMatch(/\bmain\s*:/)
  })

  it('define configuração para o target preload', () => {
    expect(configSrc).toMatch(/\bpreload\s*:/)
  })

  it('define configuração para o target renderer', () => {
    expect(configSrc).toMatch(/\brenderer\s*:/)
  })
})

describe('electron.vite.config.ts — entries dos build targets', () => {
  it('main entry aponta para src/main/index.ts', () => {
    expect(configSrc).toContain('src/main/index.ts')
    expect(existsSync(resolve(root, 'src/main/index.ts'))).toBe(true)
  })

  it('preload entry aponta para src/preload/index.ts', () => {
    expect(configSrc).toContain('src/preload/index.ts')
    expect(existsSync(resolve(root, 'src/preload/index.ts'))).toBe(true)
  })

  it('renderer entry aponta para index.html', () => {
    expect(configSrc).toContain('index.html')
    expect(existsSync(resolve(root, 'index.html'))).toBe(true)
  })
})

describe('electron.vite.config.ts — aliases @shared/@main/@renderer', () => {
  it('declara alias @shared → src/shared', () => {
    expect(configSrc).toContain("'@shared'")
    expect(configSrc).toContain("'src/shared'")
  })

  it('declara alias @main → src/main', () => {
    expect(configSrc).toContain("'@main'")
    expect(configSrc).toContain("'src/main'")
  })

  it('declara alias @renderer → src/renderer', () => {
    expect(configSrc).toContain("'@renderer'")
    expect(configSrc).toContain("'src/renderer'")
  })

  it('aliases são compartilhados entre todos os targets (definidos uma vez)', () => {
    // The config declares `const alias = { ... }` shared across all three targets
    expect(configSrc).toMatch(/const\s+alias\s*=/)
    // And references it in main, preload, and renderer resolve sections
    const aliasRefs = (configSrc.match(/resolve\s*:\s*\{\s*alias/g) ?? []).length
    expect(aliasRefs).toBeGreaterThanOrEqual(3)
  })
})

describe('aliases @shared/@main/@renderer em runtime de testes (vitest)', () => {
  it('@shared/types/ipc resolve e exporta IpcChannels', async () => {
    const mod = await import('@shared/types/ipc')
    expect(mod.IpcChannels).toBeDefined()
    expect(typeof mod.IpcChannels).toBe('object')
  })

  it('@shared/types/terminal resolve', async () => {
    // Pure types module - verify it loads without error
    const mod = await import('@shared/types/terminal')
    expect(mod).toBeDefined()
  })

  it('@shared/types/api resolve', async () => {
    const mod = await import('@shared/types/api')
    expect(mod).toBeDefined()
  })
})

describe('tsconfig.json paths coincidem com aliases do Vite', () => {
  const tsconfigPath = resolve(root, 'tsconfig.json')
  const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8'))
  const paths: Record<string, string[]> = tsconfig.compilerOptions?.paths ?? {}

  it('tsconfig define @shared/*', () => {
    expect(paths['@shared/*']).toBeDefined()
    expect(paths['@shared/*'][0]).toBe('src/shared/*')
  })

  it('tsconfig define @main/*', () => {
    expect(paths['@main/*']).toBeDefined()
    expect(paths['@main/*'][0]).toBe('src/main/*')
  })

  it('tsconfig define @renderer/*', () => {
    expect(paths['@renderer/*']).toBeDefined()
    expect(paths['@renderer/*'][0]).toBe('src/renderer/*')
  })

  it('paths do tsconfig são coerentes com os aliases do Vite (mesmas raízes)', () => {
    // Extract alias roots from the config source via regex
    const sharedMatch = configSrc.match(/'@shared'\s*:\s*resolve\(__dirname,\s*'([^']+)'/)
    const mainMatch = configSrc.match(/'@main'\s*:\s*resolve\(__dirname,\s*'([^']+)'/)
    const rendererMatch = configSrc.match(/'@renderer'\s*:\s*resolve\(__dirname,\s*'([^']+)'/)

    // Vite alias: @shared → src/shared; tsconfig: @shared/* → src/shared/*
    if (sharedMatch) {
      expect(paths['@shared/*'][0]).toBe(`${sharedMatch[1]}/*`)
    }
    if (mainMatch) {
      expect(paths['@main/*'][0]).toBe(`${mainMatch[1]}/*`)
    }
    if (rendererMatch) {
      expect(paths['@renderer/*'][0]).toBe(`${rendererMatch[1]}/*`)
    }
  })
})

describe('package.json — dependências nativas e postinstall', () => {
  const pkgPath = resolve(root, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))

  it('node-pty está em dependencies', () => {
    expect(pkg.dependencies).toHaveProperty('node-pty')
  })

  it('better-sqlite3 está em dependencies', () => {
    expect(pkg.dependencies).toHaveProperty('better-sqlite3')
  })

  it('postinstall reconstrói node-pty e better-sqlite3 via electron-rebuild', () => {
    const postinstall: string = pkg.scripts?.postinstall ?? ''
    expect(postinstall).toContain('electron-rebuild')
    expect(postinstall).toContain('node-pty')
    expect(postinstall).toContain('better-sqlite3')
  })

  it('scripts "test" e "test:watch" existem', () => {
    expect(pkg.scripts).toHaveProperty('test')
    expect(pkg.scripts).toHaveProperty('test:watch')
  })

  it('node-pty e better-sqlite3 estão em asarUnpack do electron-builder', () => {
    const asarUnpack: string[] = pkg.build?.asarUnpack ?? []
    const hasNodePty = asarUnpack.some((p: string) => p.includes('node-pty'))
    const hasSqlite = asarUnpack.some((p: string) => p.includes('better-sqlite3'))
    expect(hasNodePty).toBe(true)
    expect(hasSqlite).toBe(true)
  })
})
