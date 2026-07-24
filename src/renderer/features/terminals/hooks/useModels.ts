// Owns the user's model catalog: the strings each agent can be pinned to.
// Used by the terminal modals (to offer and auto-register models) and by the
// Settings → Models screen (to curate them).
import { useCallback, useEffect, useState } from 'react'
import type { ModelRecord } from '@shared/types/model'
import { modelRepository } from '../services/modelRepository'

export interface UseModelsResult {
  models: ModelRecord[]
  /** Registered models for one agent, in registration order. */
  modelsFor: (agent: string) => ModelRecord[]
  /**
   * Register a model string for an agent unless it is already there. Returns
   * the record that ends up representing it — the existing one when the value
   * was already registered — or null when there is nothing to register (empty
   * value, i.e. "agent default"). Matching ignores case and surrounding space,
   * mirroring the UNIQUE(agent, value) constraint in SQLite.
   */
  register: (agent: string, value: string) => Promise<ModelRecord | null>
  remove: (id: string) => Promise<void>
}

/** Case/space-insensitive key used to dedupe a value within one agent. */
function normalize(value: string): string {
  return value.trim().toLowerCase()
}

export function useModels(): UseModelsResult {
  const [models, setModels] = useState<ModelRecord[]>([])

  useEffect(() => {
    let canceled = false
    void modelRepository.list().then((rows) => {
      if (!canceled) setModels(rows)
    })
    return () => {
      canceled = true
    }
  }, [])

  const modelsFor = useCallback(
    (agent: string): ModelRecord[] => models.filter((m) => m.agent === agent),
    [models],
  )

  const register = useCallback(
    async (agent: string, value: string): Promise<ModelRecord | null> => {
      const trimmed = value.trim()
      if (!trimmed) return null

      const existing = models.find(
        (m) => m.agent === agent && normalize(m.value) === normalize(trimmed),
      )
      if (existing) return existing

      // A user-added model has no nicer name than the string itself.
      const record: ModelRecord = {
        id: crypto.randomUUID(),
        agent,
        value: trimmed,
        label: trimmed,
      }
      setModels((prev) => [...prev, record])
      await modelRepository.upsert(record)
      return record
    },
    [models],
  )

  const remove = useCallback(async (id: string): Promise<void> => {
    setModels((prev) => prev.filter((m) => m.id !== id))
    await modelRepository.remove(id)
  }, [])

  return { models, modelsFor, register, remove }
}
