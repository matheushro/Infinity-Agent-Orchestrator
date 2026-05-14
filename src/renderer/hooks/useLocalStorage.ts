// Reusable hook: state mirrored into localStorage. Generic across features.
import { useEffect, useState } from 'react'

export function useLocalStorage<T extends string>(
  key: string,
  initial: T
): readonly [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => (localStorage.getItem(key) as T) || initial)

  useEffect(() => {
    localStorage.setItem(key, value)
  }, [key, value])

  return [value, setValue] as const
}
