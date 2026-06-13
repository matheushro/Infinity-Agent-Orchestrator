// Dialog for editing a terminal's name and its agent prompt (the markdown
// "base prompt" injected once when the agent launches). The prompt is applied
// the next time the agent starts — editing it does not touch a running session.
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Modal } from '@renderer/components/ui'

interface EditTerminalModalProps {
  /** Current title, shown in the header and used as the fallback name. */
  title: string
  prompt: string
  onConfirm: (patch: { title: string; prompt: string }) => void
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
  onConfirm,
  onClose,
}: EditTerminalModalProps): JSX.Element {
  const [draftTitle, setDraftTitle] = useState(title)
  const [draftPrompt, setDraftPrompt] = useState(prompt)

  function confirm(): void {
    onConfirm({ title: draftTitle.trim() || title, prompt: draftPrompt })
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
