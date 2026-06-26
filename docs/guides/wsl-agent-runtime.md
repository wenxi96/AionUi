# WSL Agent Runtime Guide

WSL Agent Runtime allows the Windows desktop app to run CLI agents installed inside a WSL distro, such as Codex, Claude Code, Qwen Code, Goose, or OpenCode.

## Requirements

- WSL is installed on Windows.
- At least one WSL2 distro is available, such as Ubuntu.
- The target CLI is installed inside that distro.
- If the CLI requires authentication or API keys, complete that setup inside WSL.

## Install and Verify a CLI

Run these commands inside the target WSL distro:

```bash
which codex
codex --version
```

If the CLI is installed through `nvm`, `npm`, `pnpm`, or a user shell, verify the login shell can find it:

```bash
zsh -lc 'which codex && codex --version'
```

## Select a WSL Agent in AionUi

1. Open the Agent management area in Settings.
2. Detect or refresh local CLIs.
3. Find entries with a `WSL` runtime badge.
4. Select the row for the target distro and start a conversation.

The same backend can appear as both a Windows row and a WSL row. Pick the row with the distro name when you want the WSL runtime.

## Paths

AionUi runs in the Windows desktop environment while the agent runs inside WSL. Common mappings:

| Windows path | WSL path |
| --- | --- |
| `C:\Users\alice\project` | `/mnt/c/Users/alice/project` |
| `D:\code\repo` | `/mnt/d/code/repo` |
| `\\wsl$\Ubuntu\home\alice\repo` | `/home/alice/repo` |

When an agent asks for file permissions, the permission card should show the runtime path and the Windows host path when both are available.

## `/mnt/c` Performance

Accessing Windows-mounted paths such as `/mnt/c` or `/mnt/d` from WSL is often slower than using the Linux filesystem inside WSL. For large repositories or heavy file I/O, prefer a WSL-native path such as `/home/<user>/repo`.

## Authentication

Windows-side login state usually does not carry into WSL. If the CLI reports an authentication failure, open the same distro and run the provider login command, for example:

```bash
codex login
claude login
qwen login
```

Use the command documented by the specific CLI provider.

## Security Boundary

A WSL agent runs inside the selected distro and may access:

- the WSL Linux filesystem, such as `/home/<user>`
- Windows files exposed through `/mnt/c`, `/mnt/d`, and similar mounts
- the current workspace and explicitly allowed additional directories

Before approving file access, check the runtime, agent path, runtime path, and host path in the permission UI.

## Current Limitations

The current candidate has verified the core Codex WSL message and file I/O path. The full dedicated WSL Runtime settings page, first-start confirmation, and complete diagnostics panel remain part of later Stable work.
