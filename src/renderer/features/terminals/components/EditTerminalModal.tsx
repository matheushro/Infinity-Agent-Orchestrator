// Dialog for editing a terminal's name and its agent prompt (the markdown
// "base prompt" injected once when the agent launches). The prompt is applied
// the next time the agent starts — editing it does not touch a running session.
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Modal } from '@renderer/components/ui'
import { supportsModel } from '@shared/agents'
import { COMMANDS } from '../commands'
import { useModels } from '../hooks/useModels'
import type { CommandDef, CommandKey } from '../types'
import { ModelField } from './ModelField'

interface EditTerminalModalProps {
  /** Current title, shown in the header and used as the fallback name. */
  title: string
  prompt: string
  /** Agent this terminal runs — selects which models the picker offers. */
  command: CommandKey
  /** Currently pinned model ('' = agent default). */
  model: string
  onConfirm: (patch: { title: string; prompt: string; model: string }) => void
  onClose: () => void
}

const FIELD_STYLE = {
  background: 'color-mix(in oklch, var(--fg) 4%, transparent)',
  color: 'var(--fg)',
  border: '1px solid var(--line-2)',
}

export function EditTerminalModal({
  title,
  prompt,
  command,
  model,
  onConfirm,
  onClose,
}: EditTerminalModalProps): JSX.Element {
  const [draftTitle, setDraftTitle] = useState(title)
  const [draftPrompt, setDraftPrompt] = useState(prompt)
  const [draftModel, setDraftModel] = useState(model)
  const { modelsFor, register } = useModels()

  // Only agents that can be pinned to a model get the field at all — a plain
  // terminal has neither a model env var nor a --model flag.
  const agent: CommandDef = COMMANDS[command]

  function confirm(): void {
    // A model typed by hand joins the catalog, so the next terminal offers it.
    void register(command, draftModel)
    onConfirm({
      title: draftTitle.trim() || title,
      prompt: draftPrompt,
      model: draftModel.trim(),
    })
    onClose()
  }

  return (
    <Modal title={`Agent · ${title}`} onClose={onClose} closeOnOverlay className="w-[520px]">
      <Label>Name</Label>
      <input
        value={draftTitle}
        onChange={(e) => setDraftTitle(e.target.value)}
        placeholder="Terminal name"
        className="mb-4 w-full rounded-[8px] px-2.5 h-8 text-[12.5px] outline-none"
        style={FIELD_STYLE}
      />

      <Label>Agent prompt</Label>
      <textarea
        value={draftPrompt}
        onChange={(e) => setDraftPrompt(e.target.value)}
        placeholder="Markdown instructions that define this agent's role…"
        rows={10}
        className="mb-2 w-full resize-y rounded-[8px] px-2.5 py-2 text-[12.5px] font-mono outline-none leading-relaxed"
        style={FIELD_STYLE}
      />
      <p className="mb-4 text-[11px]" style={{ color: 'var(--fg-3)' }}>
        Injected once when the agent starts. Restart the terminal to apply it to a
        running session.
      </p>

      {supportsModel(agent) && (
        <>
          <Label>Model</Label>
          <ModelField
            agent={agent}
            value={draftModel}
            options={modelsFor(command)}
            onChange={setDraftModel}
            className="mb-2"
          />
          <p className="mb-4 text-[11px]" style={{ color: 'var(--fg-3)' }}>
            Pins this terminal to a model so it stays put across the agent&apos;s
            <code> /clear</code>. Pick a registered one or type a new one — it gets
            saved for next time. Restart the terminal to apply.
          </p>
        </>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={confirm}>Save</Button>
      </div>
    </Modal>
  )
}

function Label({ children }: { children: ReactNode }): JSX.Element {
  return (
    <label
      className="mb-1 block text-[10.5px] uppercase tracking-[0.08em]"
      style={{ color: 'var(--fg-3)', fontWeight: 500 }}
    >
      {children}
    </label>
  )
}
