// Tiny filesystem helpers for the usage sources: every failure is a non-answer,
// never a thrown error — a report must render even on an unreadable folder.
import { readdirSync, statSync } from 'fs'

export function listDirectory(path: string): string[] {
  try {
    return statSync(path).isDirectory() ? readdirSync(path) : []
  } catch {
    return []
  }
}

/** Last-modified time of a file in epoch millis, or null when unreadable. */
export function modifiedAt(path: string): number | null {
  try {
    return statSync(path).mtimeMs
  } catch {
    return null
  }
}
