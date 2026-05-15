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
iao agents                          # List the agents this terminal is linked to
iao send "Agent Name" "prompt"      # Send a prompt to a linked agent
iao inspect "Agent Name"            # Read the current terminal output of a linked agent
iao help                            # Show built-in help
iao debug                           # Show diagnostic info (bridge port, env, linked agents)
```

If `iao` is not on `PATH` (some custom shells strip it), use the absolute path exported
in the environment instead:

```bash
"$IAO_CLI" agents
"$IAO_CLI" send "Agent Name" "prompt"
"$IAO_CLI" inspect "Agent Name"
```

## How to talk to another agent

Always follow this sequence. Do not skip steps — `send` blindly without knowing who is
linked will fail, and `inspect` immediately after `send` will only show pre-prompt state.

### 1. Discover who you can talk to

```bash
iao agents
```

This prints **only the agents linked to this terminal**. Copy the names exactly as
shown — `send` and `inspect` resolve targets by title.

If the list is empty, you have no linked agents. Tell the user that you cannot reach
anyone else from this terminal and ask them to connect this terminal to the target on the
canvas.

### 2. Send a prompt

```bash
iao send "Backend Agent" "Check the current API implementation and tell me whether the /users route is already wired up."
```

The prompt is delivered to the target terminal exactly as if the user typed it there. You
do **not** receive the agent's reply from this command — `send` only confirms delivery.

Write self-contained prompts. The other agent does not see your conversation; it only
sees what you put inside the quotes.

### 3. Wait, then inspect

Give the other agent time to actually do the work before checking. A small task may take
a few seconds; a real coding task can take minutes. Then read its terminal:

```bash
iao inspect "Backend Agent"
```

This returns the captured output of that terminal — the same thing the user would see on
its screen, with ANSI escapes stripped for readability.

### 4. Decide what to do next

- **Still working?** (incomplete output, tool calls in progress, cursor mid-line) →
  wait longer and run `iao inspect` again. **Do not resend the same prompt** — the agent
  is still on it; sending again will queue duplicate work and confuse it.
- **Done and you have what you need?** → continue with your own task.
- **Done but the answer is incomplete or wrong?** → send a follow-up prompt that
  references what was missing. Treat it as a new message; don't repeat the original.

## Rules

- **Always `iao agents` first.** Never guess agent names. If a name is not in `iao agents`
  output, the agent is not linked and you cannot reach it.
- **Wait between `send` and `inspect`.** Polling instantly returns the state before the
  agent reacted. Sleep a few seconds, inspect, and re-inspect on a loop if needed.
- **Never resend the same prompt** while the previous one is still being worked on. Use
  `iao inspect` to verify completion first.
- **Do not edit files another agent is actively modifying.** Coordinate through `iao send`
  — ask the other agent to pause, or wait until `iao inspect` shows it is idle.
- **Prompts are not chat history.** Each `iao send` is standalone for the receiver. Give
  enough context in every message.
- **Use `iao help` / `iao debug`** when something looks off — `debug` reports which agents
  this terminal sees as linked, the bridge port, and the resolved CLI paths.

## Example end-to-end flow

```bash
$ iao agents
Backend Agent    · claude
Test Agent       · codex

$ iao send "Backend Agent" "Read src/server/routes.ts and reply with the list of registered routes."
Delivered to "Backend Agent". Wait a few seconds, then run: iao inspect "Backend Agent"

# ...wait ~10s...

$ iao inspect "Backend Agent"
Reading src/server/routes.ts
Found 4 routes:
  GET  /health
  GET  /users
  POST /users
  GET  /users/:id
```
