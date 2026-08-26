// The single dialog for a terminal — used both to create one and to edit an
// existing one. Everything a terminal owns lives here: name, folder, agent,
// pinned model, thinking effort, agent prompt and the visual style. Two modals used to split
// these (create vs. prompt vs. style), which meant the agent prompt could only
// be set *after* the terminal had already launched without it.
//
// Both modes are draft-based: nothing is applied until confirm. In edit mode the
// caller restarts the pty on confirm, so cwd/agent/model/effort/prompt changes take
// effect immediately instead of only on the next manual restart.
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Modal, Select } from '@renderer/components/ui'
import { supportsEffort, supportsModel } from '@shared/agents'
import { COMMANDS } from '../commands'
import { useModels } from '../hooks/useModels'
import {
  DEFAULT_TERMINAL_STYLE,
  FONT_FAMILY_OPTIONS,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  LINE_HEIGHT_STEP,
  type CommandDef,
  type CommandKey,
  type TerminalStyle,
} from '../types'
import { EffortField } from './EffortField'
import { ModelField } from './ModelField'

/** Everything the modal edits, in one shape shared by both modes. */
export interface TerminalSettingsDraft {
  name: string
  folder: string
  command: CommandKey
  /** Pinned model ('' = agent default). */
  model: string
  /** Pinned reasoning-effort level ('' = agent default). */
  effort: string
  /** Base prompt (markdown) injected when the agent launches. '' = none. */
  prompt: string
  style: TerminalStyle
}

interface TerminalSettingsModalProps {
  mode: 'create' | 'edit'
  /** Values the draft starts from — defaults in create mode, the node in edit mode. */
  initial: TerminalSettingsDraft
  onConfirm: (draft: TerminalSettingsDraft) => void
  onCancel: () => void
}

const FIELD_STYLE = {
  background: 'color-mix(in oklch, var(--fg) 4%, transparent)',
  color: 'var(--fg)',
  border: '1px solid var(--line-2)',
}

const PROMPT_PLACEHOLDER = "Markdown instructions that define this agent's role…"

export function TerminalSettingsModal({
  mode,
  initial,
  onConfirm,
  onCancel,
}: TerminalSettingsModalProps): JSX.Element {
  const [name, setName] = useState(initial.name)
  const [folder, setFolder] = useState(initial.folder)
  const [command, setCommand] = useState<CommandKey>(initial.command)
  const [model, setModel] = useState(initial.model)
  const [effort, setEffort] = useState(initial.effort)
  const [prompt, setPrompt] = useState(initial.prompt)
  const [style, setStyle] = useState<TerminalStyle>(initial.style)
  const { modelsFor, register } = useModels()

  const isCreate = mode === 'create'
  const agent: CommandDef = COMMANDS[command]

  // A model or effort level valid for one agent is meaningless for another (and
  // an unknown level makes the CLI refuse to start), so switching the agent
  // drops both pins rather than carrying stale values over.
  function selectCommand(next: CommandKey): void {
    setCommand(next)
    setModel('')
    setEffort('')
  }

  function patchStyle(patch: Partial<TerminalStyle>): void {
    setStyle((prev) => ({ ...prev, ...patch }))
  }

  async function pickFolder(): Promise<void> {
    const selected = await window.dialogApi.selectFolder(folder || initial.folder)
    if (selected) setFolder(selected)
  }

  function confirm(): void {
    const trimmedModel = model.trim()
    // A model typed by hand joins the catalog, so the next terminal offers it.
    void register(command, trimmedModel)
    onConfirm({
      // Editing keeps the current name when the field is cleared; creating lets
      // the caller derive a name from the agent + folder.
      name: name.trim() || (isCreate ? '' : initial.name),
      folder,
      command,
      model: trimmedModel,
      effort,
      prompt,
      style,
    })
  }

  return (
    <Modal
      title={isCreate ? 'New terminal' : `Terminal · ${initial.name}`}
      onClose={onCancel}
      closeOnOverlay={!isCreate}
      className="w-[520px]"
    >
      <div className="max-h-[62vh] overflow-y-auto nice-scroll pr-1">
        <Label>Name</Label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={isCreate ? 'Terminal name (optional)' : 'Terminal name'}
          className="mb-4 w-full rounded-[8px] px-2.5 h-8 text-[12.5px] outline-none"
          style={FIELD_STYLE}
        />

        <Label>Folder</Label>
        <div className="mb-4 flex gap-2">
          <input
            readOnly
            value={folder}
            placeholder="No folder selected"
            className="min-w-0 flex-1 truncate rounded-[8px] px-2.5 h-8 text-[12.5px] font-mono outline-none"
            style={FIELD_STYLE}
          />
          <Button variant="secondary" onClick={pickFolder}>
            Select…
          </Button>
        </div>

        <Label>Command</Label>
        <div className="mb-5 grid grid-cols-2 gap-2">
          {Object.values(COMMANDS).map((c) => {
            const active = command === c.key
            return (
              <button
                key={c.key}
                onClick={() => selectCommand(c.key)}
                className="flex items-center gap-2 rounded-[8px] px-3 h-10 text-[12.5px] font-medium transition-colors"
                style={{
                  background: active
                    ? 'color-mix(in oklch, var(--accent) 12%, transparent)'
                    : 'color-mix(in oklch, var(--fg) 4%, transparent)',
                  color: active ? 'var(--fg)' : 'var(--fg-2)',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--line-2)'}`,
                }}
              >
                <span className="text-base">{c.icon}</span>
                {c.label}
              </button>
            )
          })}
        </div>

        {supportsModel(agent) && (
          <div className="mb-5">
            <Label>Model</Label>
            <ModelField
              agent={agent}
              value={model}
              options={modelsFor(command)}
              onChange={setModel}
            />
            <p className="mt-1.5 text-[11px]" style={{ color: 'var(--fg-3)' }}>
              Pins this terminal to a model so it stays put across the agent&apos;s
              <code> /clear</code>. Pick a registered one or type a new one — it gets
              saved for next time. Leave empty to let the agent decide.
            </p>
          </div>
        )}

        {supportsEffort(agent) && (
          <div className="mb-5">
            <Label>Thinking effort</Label>
            <EffortField agent={agent} value={effort} onChange={setEffort} />
            <p className="mt-1.5 text-[11px]" style={{ color: 'var(--fg-3)' }}>
              How hard the agent thinks, pinned to this terminal at launch
              (<code>{agent.effortArg}</code>). Leave on default to use whatever the
              agent&apos;s own config says.
            </p>
          </div>
        )}

        <Label>Agent prompt</Label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={PROMPT_PLACEHOLDER}
          rows={8}
          className="mb-1.5 w-full resize-y rounded-[8px] px-2.5 py-2 text-[12.5px] font-mono outline-none leading-relaxed"
          style={FIELD_STYLE}
        />
        <p className="mb-5 text-[11px]" style={{ color: 'var(--fg-3)' }}>
          {isCreate
            ? 'Injected when the agent launches — the terminal opens already in this role.'
            : 'Injected when the agent launches. Saving restarts this terminal so it applies right away.'}
        </p>

        <Divider />

        <Label>Theme</Label>
        <div
          className="mb-4 flex items-center rounded-[8px] p-0.5"
          style={{
            background: 'color-mix(in oklch, var(--fg) 5%, transparent)',
            border: '1px solid var(--line-2)',
          }}
        >
          <ThemeChip
            label="Auto"
            active={style.theme === 'auto'}
            onClick={() => patchStyle({ theme: 'auto' })}
          />
          <ThemeChip
            label="Dark"
            active={style.theme === 'dark'}
            onClick={() => patchStyle({ theme: 'dark' })}
          />
          <ThemeChip
            label="Light"
            active={style.theme === 'light'}
            onClick={() => patchStyle({ theme: 'light' })}
          />
        </div>

        <Label>Font</Label>
        <div className="mb-4">
          <Select
            ariaLabel="Font"
            value={style.fontFamily}
            onChange={(fontFamily) => patchStyle({ fontFamily })}
            options={FONT_FAMILY_OPTIONS}
          />
        </div>

        <Label>{`Font size · ${style.fontSize}px`}</Label>
        <input
          type="range"
          aria-label="Font size"
          min={10}
          max={22}
          step={1}
          value={style.fontSize}
          onChange={(e) => patchStyle({ fontSize: Number(e.target.value) })}
          className="mb-4 w-full"
        />

        <Label>{`Line height · ${style.lineHeight.toFixed(2)}×`}</Label>
        <input
          type="range"
          aria-label="Line height"
          min={LINE_HEIGHT_MIN}
          max={LINE_HEIGHT_MAX}
          step={LINE_HEIGHT_STEP}
          value={style.lineHeight}
          onChange={(e) => patchStyle({ lineHeight: Number(e.target.value) })}
          className="mb-1 w-full"
        />
        <p className="text-[11px]" style={{ color: 'var(--fg-3)' }}>
          Space each row gets. Raise it if the canvas zoom clips the top or bottom
          of glyphs; lower it to fit more lines on screen.
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          className="text-[11.5px]"
          style={{ color: 'var(--fg-3)' }}
          onClick={() => setStyle(DEFAULT_TERMINAL_STYLE)}
        >
          Reset style
        </button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={!folder} onClick={confirm}>
            {isCreate ? 'Open' : 'Save & restart'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** Builds the draft a brand-new terminal starts from. */
export function createDraft(defaultFolder: string): TerminalSettingsDraft {
  return {
    name: '',
    folder: defaultFolder,
    command: 'claude',
    model: '',
    effort: '',
    prompt: '',
    style: DEFAULT_TERMINAL_STYLE,
  }
}

function Divider(): JSX.Element {
  return <div className="mb-4 h-px" style={{ background: 'var(--line)' }} />
}

function ThemeChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className="flex-1 h-7 rounded-[6px] text-[11.5px] transition-colors"
      style={{
        background: active ? 'var(--bg)' : 'transparent',
        color: active ? 'var(--fg)' : 'var(--fg-3)',
        fontWeight: active ? 500 : 400,
        boxShadow: active ? '0 1px 2px rgb(0 0 0 / 0.10)' : 'none',
      }}
    >
      {label}
    </button>
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
