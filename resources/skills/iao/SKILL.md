---
name: iao
description: Communicate with other AI agents running in linked terminals inside the Infinity Agent Orchestrator (IAO) canvas. Use this skill whenever you need another agent to read or work on something, or whenever you want to check on what a linked agent is currently doing. Also read and write connected notes.
user-invocable: false
---

# Infinity Agent Orchestrator Communication

You're running inside Infinity Agent Orchestrator (IAO), a spatial workspace containing other coding agents and markdown notes.

Connected agents can exchange prompts and responses through the `iao` CLI.

Connected notes can be read and written through the `iao` CLI.

## Commands

- `iao agents` — list connected agents
- `iao send "Agent Name" "prompt"` — send a prompt to a connected agent and wait for the response
- `iao inspect "Agent Name"` — read the current terminal output of an agent

### Notes

- `iao note create ["content"]` — create a new note linked to this terminal
- `iao note list` — list notes linked to this terminal
- `iao note read "Note Name"` — read the full note
- `iao note read "Note Name" 10 20` — read a line range
- `iao note write "Note Name" "content"` — replace a note entirely
- `iao note edit "Note Name" "old text" "new text"` — replace text inside a note
- `iao note rename "Old Name" "New Name"` — rename a note
- `iao note link "Note Name" "Agent Name"` — share a note with a connected agent so both can read/write it
- `iao note unlink "Note Name" "Agent Name"` — stop sharing a note with a connected agent
- `iao note delete "Note Name"` — delete a note

The iao CLI is pre-installed and available on PATH inside IAO terminals.

If `iao` is not found on PATH, use:

```bash
"$IAO_CLI"
```

instead.

## Connected Agents

Always run:

```bash
iao agents
```

before using:

```bash
iao send
iao inspect
```

Use the exact agent names returned by the CLI.

If no agents are connected, explain that this terminal cannot communicate with other agents until a connection is created on the canvas.

### Important

`iao send` is synchronous.

The command returns only when the target agent has finished responding.

Treat it exactly like waiting for:

```bash
npm test
npm run build
```

or any other long-running command.

When using `iao send`:

- Wait for the command to finish.
- Use the returned response.
- Do not guess what the other agent might reply.
- Do not continue based on assumptions.
- Do not generate a replacement answer yourself.

If a timeout occurs:

- Do not resend the prompt.
- Do not invent a result.
- Use `iao inspect` only to check progress.
- Wait again if appropriate.

### Checking Agent Status

Use:

```bash
iao inspect "Agent Name"
```

to see what an agent is currently displaying.

Use inspect only when:

- The user asks what another agent is doing.
- A previous send timed out.
- You need to debug communication.

Do not use inspect as a polling loop.

`iao send` already waits for completion.

## Connected Notes

Notes are markdown documents that live on the canvas.

Use notes for plans, checklists, findings, documentation, and shared context.

You can only access notes linked to this terminal.

### Sharing notes with other agents

A note is a shared workspace: link it to another connected agent and both of you
can read and write it, which is the most productive way to exchange information —
plans, findings, and hand-offs live in the note instead of being re-sent as prompts.

```bash
iao note create "# Shared plan"
iao note link "Shared plan" "Other Agent"
```

The other agent now sees the note in `iao note list` and can edit it. Changes from
either side appear immediately. Use `iao note unlink "Note Name" "Agent Name"` to
revoke access. You can only share notes you already have access to, and only with
agents connected to this terminal on the canvas (run `iao agents` to see them).

Use:

```bash
iao note list
```

when you need to discover available notes.

For small changes, prefer:

```bash
iao note edit
```

instead of:

```bash
iao note write
```

to avoid overwriting existing content.

Changes appear on the canvas immediately.

Notes support markdown formatting.

### Important

For note-only tasks:

- Do not run `iao agents`.
- Do not inspect agents.
- Work directly with note commands.

## Rules

- Use `iao agents` before `iao send` or `iao inspect`.
- Do not use `iao agents` for note-only tasks.
- Always wait for `iao send` to complete.
- Never replace a missing agent response with your own assumptions.
- Never resend a prompt that is already running.
- Do not use `iao inspect` as a polling mechanism.
- Prefer `iao note edit` over `iao note write` when possible.
- Use `iao help` or `iao debug` if communication appears broken.