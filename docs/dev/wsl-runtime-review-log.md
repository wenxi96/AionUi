# WSL Runtime Review Log

Date: 2026-06-26
Scope: AionUi `feat/wsl-runtime-next-phase` and AionCore `feat/wsl-runtime-integration`

## Release Candidate Scope

- Fix local agent logos failing to render in local debug runs.
- Keep WSL CLI discovery Windows-only.
- Hide WSL runtime UI and derived rows on unsupported hosts.
- Show WSL runtime diagnostics on supported hosts, including distro status, WSL version, probe mode, CLI path, and per-CLI availability.
- Ensure Windows test builds fail when no installer is produced.

## Review Round 1

Status: findings reported, fixes applied.

Findings:

- `WslRuntimeDiagnostics` rendered while host support was still unknown. This could briefly expose a disabled WSL switch on unsupported hosts before `/api/agents/runtime/wsl` returned.
- Windows build workflow swallowed electron-builder failures, which could make a test release appear successful without a Windows installer artifact.

Disposition:

- Accepted. `WslRuntimeDiagnostics` now renders only when `runtimeSupported === true`.
- Accepted. Windows build now exits non-zero on build failure and verifies that a `.exe` or `.msi` installer exists before marking the matrix item successful.

Verification:

- `bun run test tests/unit/settings/WslRuntimeDiagnostics.dom.test.tsx tests/unit/renderer/LocalAgents.dom.test.tsx`

## Review Round 2

Status: findings reported, fixes applied.

Findings:

- `LocalAgents` still allowed WSL-derived rows while host support was unknown. The diagnostics card was hidden, but stale or unexpected WSL rows could still appear in the detected agents grid until support resolved.

Disposition:

- Accepted. `LocalAgents` now allows WSL-derived rows only when `wslRuntimeSupported === true`; unsupported or unknown hosts filter WSL rows.
- Added a regression test for the loading/unknown support state.

Verification:

- `bun run test tests/unit/settings/WslRuntimeDiagnostics.dom.test.tsx tests/unit/renderer/LocalAgents.dom.test.tsx`

## Review Round 3

Status: findings reported, fixes applied.

Findings:

- AionUi test release packaging could only download AionCore Actions artifacts from `iOfficeAI/AionCore`. The current `wenxi96` token cannot push the AionCore feature branch to that repository, so the standard `aioncore_run_id` path was not usable for a fork-based test release.

Disposition:

- Accepted. `prepare-aioncore` now supports `AIONUI_BACKEND_REPOSITORY=owner/repo`, defaulting to `iOfficeAI/AionCore`.
- Accepted. AionUi `build-manual.yml` and `_build-reusable.yml` now expose and pass an optional `aioncore_repository` input.

Verification:

- `bun run test tests/unit/settings/WslRuntimeDiagnostics.dom.test.tsx tests/unit/renderer/LocalAgents.dom.test.tsx`

## Review Round 4

Status: no new findings.

Checks:

- Confirmed WSL diagnostics route remains under `Settings -> Agent -> Local Agents`.
- Confirmed unsupported and unknown hosts do not render WSL diagnostics or WSL-derived rows.
- Confirmed Windows-supported hosts have a guarded WSL diagnostics surface and switch.
- Confirmed AionUi manual build can consume an AionCore Manual Build run through `aioncore_run_id`, and can target an alternate AionCore repository through `aioncore_repository`.

Verification:

- `bun run test tests/unit/settings/WslRuntimeDiagnostics.dom.test.tsx tests/unit/renderer/LocalAgents.dom.test.tsx tests/unit/renderer/AgentCard.dom.test.tsx tests/unit/renderer/agentSelectionUtils.test.ts tests/unit/renderer/cron/resolveCronAgentConfig.test.ts tests/unit/renderer/useGuidSend.dom.test.ts`
- `bunx tsc --noEmit --pretty false`
- `bun run i18n:types`
- `node scripts/check-i18n.js`
- `cargo test -p aionui-ai-agent wsl --lib`
- `cargo fmt --all -- --check`

## Remaining Verification Boundary

- The current Linux workspace cannot perform a real Windows desktop install smoke test.
- The Windows installer must be produced by GitHub Actions from pushed AionCore and AionUi branches, then downloaded and installed on Windows for final manual validation.

## Review Round 5

Status: findings reported, fixes applied.

Findings:

- AionUi manual build accepted `aioncore_repository`, and the standalone `Prepare aioncore binary` step used it correctly. However, `scripts/build-with-builder.js` also prepares aioncore during the platform build step, and the Windows/macOS/Linux build-step environments only passed `AIONUI_BACKEND_RUN_ID`. As a result, Windows packaging fell back to the default `iOfficeAI/AionCore` repository and failed when the AionCore artifact run was hosted in `wenxi96/AionUi`.

Disposition:

- Accepted. `_build-reusable.yml` now passes `AIONUI_BACKEND_REPOSITORY` into the Windows, macOS, and Linux electron-builder steps so every prepare path uses the same artifact repository.

Verification:

- GitHub Actions run `28222485306` reproduced the failure: the prepare step downloaded `aioncore-manual-windows-x64` from `wenxi96/AionUi`, then the Windows build step retried against `iOfficeAI/AionCore` and received a 404.
- GitHub Actions run `28223010150` passed after the workflow fix. The Windows build step received `AIONUI_BACKEND_REPOSITORY=wenxi96/AionUi` and downloaded `aioncore-manual-windows-x64` from AionCore run `28221498446`.

## Review Round 6

Status: no new findings.

Checks:

- Confirmed the final AionUi manual Windows build used `aioncore_run_id=28221498446` and `aioncore_repository=wenxi96/AionUi`.
- Confirmed both the standalone `Prepare aioncore binary` step and the `Build with electron-builder (Windows)` step used the alternate AionCore artifact repository.
- Confirmed the Windows installer was produced as `AionUi-2.1.21-win-x64.exe`.
- Confirmed the uploaded Actions artifact was `windows-build-x64-e4c0734` with artifact ID `7899785088`.

Verification:

- GitHub Actions run `28223010150`: `Prepare Build Matrix`, `Code Quality`, `Build windows-x64`, and `Build Summary` completed successfully.
- Downloaded artifact `windows-build-x64-e4c0734` and inspected the archive contents: `AionUi-2.1.21-win-x64.exe`.
- Copied the installer to `/mnt/d/下载/AionUi-2.1.21-win-x64.exe` for Windows-side manual installation testing.
