---
name: iao
description: Communicate with other AI agents running in linked terminals inside the Infinity Agent Orchestrator (IAO) canvas. Use this skill whenever you need another agent to read or work on something, or whenever you want to check on what a linked agent is currently doing.
user-invocable: false
---

# Working inside the Infinity Agent Orchestrator

You are running inside a terminal that lives on the canvas of **Infinity Agent
Orchestrator (IAO)** — a desktop app that hosts multiple coding agents side by side and
lets them talk to each other.

Each terminal on the canvas is one agent. Two terminals can be **linked** by drawing an
edge between them on the canvas; you can only talk to terminals you are explicitly linked
to. The `iao` CLI is the channel you use to send a prompt to a linked agent and to read
that agent's terminal output back.

The CLI is only available **inside IAO terminals**. It does not exist on the host system.

## Commands

```bash
iao agents                                  # List the agents this terminal is linked to
iao send "Agent Name" "prompt"              # Send a prompt and wait for the reply (default)
iao send --no-wait "Agent" "prompt"         # Fire-and-forget delivery (legacy behaviour)
iao send --timeout 300 "Agent" "prompt"     # Cap the wait at 300s (default 120s)
iao send --quiet "Agent" "prompt"           # Hide progress lines on stderr
iao inspect "Agent Name"                    # Read the current terminal output (manual / debug)
iao help                                    # Show built-in help
iao debug                                   # Show diagnostic info (bridge port, env, linked agents)
```

If `iao` is not on `PATH` (some custom shells strip it), use the absolute path exported
in the environment instead:

```bash
"$IAO_CLI" agents
"$IAO_CLI" send "Agent Name" "prompt"
"$IAO_CLI" inspect "Agent Name"
```

## How to talk to another agent

### 1. Discover who you can talk to

```bash
iao agents
```

This prints **only the agents linked to this terminal**. Copy the names exactly as
shown — `send` and `inspect` resolve targets by title.

If the list is empty, you have no linked agents. Tell the user that you cannot reach
anyone else from this terminal and ask them to connect this terminal to the target on the
canvas.

### 2. Send a prompt and get the reply in one step

```bash
iao send "Backend Agent" "Check the current API implementation and tell me whether the /users route is already wired up."
```

**`iao send` is synchronous by default.** The command blocks until the target agent has
finished replying, then prints the captured reply on stdout. Progress lines (elapsed
time, bytes received, idle time) stream to stderr while you wait.

The wait happens entirely inside the IAO bridge — **do not** wrap `iao send` in your own
`sleep` / `iao inspect` loop. That used to be necessary; it no longer is, and doing it
now just burns tokens.

Write self-contained prompts. The other agent does not see your conversation; it only
sees what you put inside the quotes.

#### Tuning the wait

- Default timeout is 120 seconds. For longer tasks: `iao send --timeout 600 "Agent" "..."`.
- For purely advisory pings where you don't need a reply: `iao send --no-wait "Agent" "..."`.
- To hide the progress lines on stderr: `iao send --quiet "Agent" "..."`.
- If the wait times out, `iao send` prints whatever output was captured so far and exits
  with status 124. You can keep checking with `iao inspect` afterwards.

### 3. `iao inspect` is for manual debug only

```bash
iao inspect "Backend Agent"
```

Returns the current captured output buffer of that terminal. Use it when you want a
sanity check on what another agent is doing right now (e.g. the user asks "what is
Backend doing?") — **not** as part of a polling loop, since `iao send` already waits for
you.

## Rules

- **Always `iao agents` first.** Never guess agent names.
- **Never wrap `iao send` in a sleep/inspect loop.** The bridge already waits. Adding
  your own polling just wastes prompts.
- **Never resend the same prompt** while the previous `iao send` is still running — they
  are mutually exclusive per (caller, target) pair anyway and the bridge will reject the
  second one with HTTP 429.
- **Do not edit files another agent is actively modifying.** Coordinate through
  `iao send` — ask the other agent to pause, or check `iao inspect` to confirm it is idle.
- **Prompts are not chat history.** Each `iao send` is standalone for the receiver. Give
  enough context in every message.
- **Use `iao help` / `iao debug`** when something looks off.

## Example end-to-end flow

```bash
$ iao agents
Backend Agent    · claude
Test Agent       · codex

$ iao send "Backend Agent" "Read src/server/routes.ts and reply with the list of registered routes."
iao: delivered to "Backend Agent", waiting for reply (timeout 120s)...
iao: waiting... 2s elapsed, 184 bytes received, idle 1s
iao: waiting... 4s elapsed, 612 bytes received, idle 0s
Reading src/server/routes.ts
Found 4 routes:
  GET  /health
  GET  /users
  POST /users
  GET  /users/:id
```
