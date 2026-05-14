// Id generation helpers for the renderer.

let counter = 0

/** Stable, unique id for a terminal node (persistence/layout id). */
export function createTerminalId(): string {
  counter += 1
  return `term-${Date.now()}-${counter}`
}
