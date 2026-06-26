# WSL Agent Runtime Troubleshooting

Use this guide when a WSL runtime row is missing, cannot start, cannot access files, or returns an authentication or network error.

## Quick Checks

Run these from Windows:

```powershell
wsl.exe --status
wsl.exe --list --verbose
```

Run these inside the target distro:

```bash
pwd
echo "$SHELL"
which codex || true
zsh -lc 'which codex && codex --version'
```

Replace `codex` with the backend CLI you are using.

## WSL Runtime Row Is Missing

Possible causes:

- WSL is not installed.
- No distro exists.
- The distro is stopped and probing is configured not to start stopped distros.
- The CLI is not installed in the distro.
- The CLI exists only in an interactive shell PATH and not in a clean shell.

What to do:

1. Confirm `wsl.exe --list --verbose` shows the distro.
2. Open the distro and verify the CLI with `which <cli>`.
3. If the CLI is installed through `nvm` or shell startup files, verify it with `zsh -lc 'which <cli>'`.
4. Refresh CLI detection from the Agent settings page.

## CLI Starts but Immediately Fails

Common causes:

- Auth is missing inside WSL.
- The CLI cannot reach its provider due to WSL network, proxy, or certificate settings.
- Bridge backends cannot find `node`, `npm`, or `npx`.
- The selected workspace path cannot be mapped into WSL.

Suggested checks:

```bash
node --version
npm --version
npx --version
env | grep -Ei 'proxy|http_proxy|https_proxy|no_proxy' || true
```

If auth is required, run the provider login command inside the same distro.

## Path Mapping Failed

Expected examples:

| Input | Expected runtime path |
| --- | --- |
| `C:\Users\alice\repo` | `/mnt/c/Users/alice/repo` |
| `D:\code\repo` | `/mnt/d/code/repo` |
| `\\wsl$\Ubuntu\home\alice\repo` | `/home/alice/repo` |

If the path cannot be mapped:

1. Confirm the workspace is on a local Windows drive or inside the selected distro.
2. Avoid paths from a different distro unless explicitly supported.
3. Move the repository to `/home/<user>/repo` for best WSL compatibility and performance.

## File Permission Prompt Looks Wrong

The permission card should show:

- runtime, for example `WSL: Ubuntu-24.04`
- agent path
- runtime path
- Windows host path when mapping is available

Do not approve write access if the runtime path or host path points outside the intended workspace.

## Process Does Not Stop

Expected behavior is:

1. AionUi sends ACP cancel.
2. AionCore terminates the WSL runtime process.
3. No target `wsl.exe`, bridge, or CLI child process remains for that conversation.

If a process remains, capture the backend log and process list before killing it manually.

## Error Meaning

| Error | Meaning | Suggested action |
| --- | --- | --- |
| `WSL_NOT_INSTALLED` | Windows cannot find WSL | Install or enable WSL, then restart AionUi |
| `WSL_NO_DISTRO` | WSL exists but no distro is available | Install a distro from Microsoft Store or `wsl --install` |
| `WSL_CLI_NOT_FOUND` | The target CLI was not found in the distro | Install the CLI or fix shell PATH |
| `WSL_PATH_MAPPING_FAILED` | Workspace path could not be converted | Use a local drive path or WSL-native path |
| `WSL_NPX_NOT_FOUND` | Bridge backend cannot find `npx` | Install Node.js/npm inside WSL |
| `WSL_AGENT_AUTH_REQUIRED` | The CLI needs login inside WSL | Run the provider login command in the distro |
| `WSL_AGENT_NETWORK_FAILED` | Provider call failed through WSL network | Check proxy, DNS, VPN, and certificates |

## Current Verification Boundary

The current verified path covers Codex WSL discovery, launch, message response, file I/O, and cleanup. A broader Stable sign-off still needs the full settings and diagnostics UI plus manual QA for stopped distro, no WSL, missing CLI, missing `npx`, proxy, and auth failure scenarios.
