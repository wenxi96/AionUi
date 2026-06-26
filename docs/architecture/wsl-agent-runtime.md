# WSL Agent Runtime Architecture

WSL Agent Runtime lets the Windows desktop app keep the native Windows UI while running supported CLI agents inside a WSL distro. The runtime is represented as metadata on normal agent rows instead of a separate frontend-only mode.

## Runtime Model

An agent row can be native or WSL:

- `runtime.kind = "native"` means the CLI runs in the host process environment.
- `runtime.kind = "wsl"` means AionCore launches the CLI through `wsl.exe` in a specific distro.
- `runtime_scope_id` identifies the runtime row, for example `wsl:Ubuntu-24.04`.
- `id` identifies the exact selectable agent row and must be preserved by UI selection, readiness checks, cron tasks, and conversation creation.

Rows with the same backend can coexist. For example, `codex` on Windows and `codex` in `Ubuntu-24.04` must remain distinct rows.

## Ownership

| Layer                  | Responsibility                                                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| AionUi renderer        | Display runtime badges, preserve row identity, show WSL paths in permission UI, expose manual detection refresh, and run Electron smoke checks. |
| AionUi IPC/http bridge | Normalize backend `AgentMetadata` and send `agent_id` / `runtime_scope_id` where backend APIs support them.                                     |
| AionCore agent runtime | Detect distros and CLIs, map paths, build WSL spawn configs, run ACP sessions, collect diagnostics, and clean up processes.                     |
| AionCore cron          | Persist exact agent row identity so scheduled tasks do not fall back from a WSL row to a native backend row.                                    |

## Launch Flow

1. AionCore lists WSL distros and probes known CLIs using compatible shell detection.
2. `/api/agents?include_disabled=true` returns both native and WSL runtime rows.
3. AionUi renders runtime badges and lets the user select the exact row id.
4. AionUi starts a conversation with that row id.
5. AionCore maps the workspace path into the WSL path space and starts the CLI through `wsl.exe`.
6. The ACP bridge performs initialize, session creation, prompt execution, and tool events.
7. Stop/cancel sends ACP cancel and then cleans up the WSL process tree.

## Path Handling

The backend owns path mapping:

- Windows drive path to WSL path, for example `D:\repo` to `/mnt/d/repo`.
- WSL UNC path to Linux path, for example `\\wsl$\Ubuntu\home\alice\repo` to `/home/alice/repo`.
- Linux path to host-visible path when a permission or diagnostic UI needs to show both sides.
- Allowed-root checks must be performed in the runtime path space before file operations are accepted.

The frontend should display both the runtime path and host path when both are available. It must not attempt to implement path security by string manipulation in the renderer.

## Permission Context

Permission messages can include runtime context:

- runtime kind and display name
- distro
- agent path
- workspace runtime path
- workspace host path

AionUi displays that context in the permission card. If host path mapping is unavailable, the UI should still show the runtime path and make the missing host mapping clear.

## Diagnostics

Diagnostics should be layered by failure source:

- WSL missing or no distro
- stopped distro and probing policy
- CLI not found in shell/PATH
- path mapping failure
- missing `node`, `npm`, or `npx` for bridge backends
- CLI auth required inside WSL
- WSL network, proxy, or certificate failure
- backend port readiness failure in Electron

Stdout is reserved for ACP protocol output. Human-readable logs and diagnostics belong on stderr or structured backend diagnostics.

## Current Verification Boundary

The current candidate has been live-smoked for Codex in WSL:

- WSL row discovery through `/api/agents`
- Windows-side `wsl.exe` launch
- ACP initialize/session/prompt
- model response
- file read/write through ACP tool calls
- stop/cancel cleanup

This does not yet prove every WSL Stable requirement. The full dedicated settings page, first-start confirmation, complete diagnostics panel, and broad manual QA matrix remain separate work.
