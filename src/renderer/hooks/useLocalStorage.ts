// Reusable hook: state mirrored into localStorage. Generic across features.
import { useEffect, useState } from 'react'

export function useLocalStorage<T>(
  key: string,
  initial: T,
): readonly [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const raw = localStorage.getItem(key)
    if (raw === null) return initial
    try {
      return JSON.parse(raw) as T
    } catch {
      // Legacy strings written before this hook stored JSON.
      return raw as unknown as T
    }
  })

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value))
  }, [key, value])

  return [value, setValue] as const
}
