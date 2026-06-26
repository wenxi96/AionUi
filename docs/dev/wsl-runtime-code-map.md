# WSL Runtime Code Map

This map records the current AionUi and AionCore ownership for WSL Agent Runtime work. It is intended for implementation and review routing, not as a user guide.

## Scope

- AionUi owns frontend and Electron-facing behavior: agent row display, runtime badge, row-scoped selection, readiness checks, cron configuration payloads, permission UI, i18n, and Electron smoke coverage.
- AionCore owns backend runtime behavior: WSL detection, distro and CLI probing, path mapping, process spawn, ACP session integration, file I/O mapping, lifecycle cleanup, bridge backend support, cron execution, and HTTP APIs consumed by AionUi.
- AionUi consumes backend `AgentMetadata` from `/api/agents`; WSL runtime rows are represented with `runtime`, `runtime_scope_id`, `runtime_display_name`, and row-specific `id` fields.

## AionUi Frontend

| Area | Current files |
| --- | --- |
| Agent metadata wire types | `packages/desktop/src/common/adapter/ipcBridge.ts`; `packages/desktop/src/renderer/utils/model/agentTypes.ts`; `packages/desktop/src/renderer/utils/model/agentRuntime.ts` |
| Agent selector identity | `packages/desktop/src/renderer/pages/guid/hooks/agentSelectionUtils.ts`; `packages/desktop/src/renderer/pages/guid/hooks/useGuidAgentSelection.ts`; `packages/desktop/src/renderer/pages/guid/components/AgentPillBar.tsx`; `packages/desktop/src/renderer/pages/guid/types.ts` |
| Settings agent list | `packages/desktop/src/renderer/pages/settings/AgentSettings/LocalAgents.tsx`; `packages/desktop/src/renderer/pages/settings/AgentSettings/AgentCard.tsx` |
| Cron row identity | `packages/desktop/src/renderer/pages/cron/ScheduledTasksPage/CreateTaskDialog.tsx`; `packages/desktop/src/renderer/pages/cron/ScheduledTasksPage/jobAgentMeta.ts`; `packages/desktop/src/renderer/pages/cron/ScheduledTasksPage/resolveCronAgentConfig.ts` |
| Readiness checks | `packages/desktop/src/renderer/hooks/agent/useAgentReadinessCheck.ts` |
| Permission display | `packages/desktop/src/common/types/platform/acpTypes.ts`; `packages/desktop/src/renderer/pages/conversation/Messages/acp/MessageAcpPermission.tsx` |
| i18n | `packages/desktop/src/renderer/services/i18n/locales/*/settings.json`; `packages/desktop/src/renderer/services/i18n/locales/*/messages.json` |
| Focused tests | `tests/unit/renderer/utils/model/agentTypes.test.ts`; `tests/unit/renderer/agentSelectionUtils.test.ts`; `tests/unit/renderer/cron/resolveCronAgentConfig.test.ts`; `tests/unit/renderer/hooks/useAgentReadinessCheck.dom.test.ts`; `tests/unit/renderer/AgentCard.dom.test.tsx`; `tests/unit/renderer/messages/MessageAcpPermission.dom.test.tsx`; `tests/e2e/specs/wsl-runtime-smoke.e2e.ts` |

## AionCore Backend

| Area | Current files |
| --- | --- |
| Runtime and WSL primitives | `/home/cheng/git-project/AionCore/crates/aionui-api-types/src/runtime.rs`; `/home/cheng/git-project/AionCore/crates/aionui-runtime/src/wsl.rs`; `/home/cheng/git-project/AionCore/crates/aionui-runtime/src/wsl_path.rs`; `/home/cheng/git-project/AionCore/crates/aionui-runtime/src/spawn.rs`; `/home/cheng/git-project/AionCore/crates/aionui-runtime/src/shell_env.rs` |
| Agent detection and registry | `/home/cheng/git-project/AionCore/crates/aionui-ai-agent/src/registry.rs`; `/home/cheng/git-project/AionCore/crates/aionui-ai-agent/src/agent_runtime.rs`; `/home/cheng/git-project/AionCore/crates/aionui-ai-agent/src/protocol/cli_detect.rs`; `/home/cheng/git-project/AionCore/crates/aionui-ai-agent/src/protocol/custom_agent_probe.rs`; `/home/cheng/git-project/AionCore/crates/aionui-ai-agent/src/factory/acp.rs`; `/home/cheng/git-project/AionCore/crates/aionui-ai-agent/src/factory/acp_assembler.rs` |
| Agent APIs | `/home/cheng/git-project/AionCore/crates/aionui-ai-agent/src/routes/agent.rs`; `/home/cheng/git-project/AionCore/crates/aionui-api-types/src/agent_discovery.rs`; `/home/cheng/git-project/AionCore/crates/aionui-db/src/models/agent_metadata.rs`; `/home/cheng/git-project/AionCore/crates/aionui-db/src/repository/agent_metadata.rs` |
| ACP sessions and permission context | `/home/cheng/git-project/AionCore/crates/aionui-api-types/src/acp.rs`; `/home/cheng/git-project/AionCore/crates/aionui-conversation/src/session_context.rs`; `/home/cheng/git-project/AionCore/crates/aionui-db/src/repository/acp_session.rs` |
| Cron identity | `/home/cheng/git-project/AionCore/crates/aionui-api-types/src/cron.rs`; `/home/cheng/git-project/AionCore/crates/aionui-cron/src/types.rs`; `/home/cheng/git-project/AionCore/crates/aionui-cron/src/service.rs`; `/home/cheng/git-project/AionCore/crates/aionui-cron/src/executor.rs` |
| Focused tests | `/home/cheng/git-project/AionCore/crates/aionui-runtime/src/wsl.rs`; `/home/cheng/git-project/AionCore/crates/aionui-runtime/src/wsl_path.rs`; `/home/cheng/git-project/AionCore/crates/aionui-ai-agent/src/registry_tests.rs`; `/home/cheng/git-project/AionCore/crates/aionui-ai-agent/tests/factory_provider_integration.rs`; `/home/cheng/git-project/AionCore/crates/aionui-cron/src/executor.rs` |

## Verified Runtime Chain

The verified product path is:

1. AionCore detects WSL distros and CLI binaries.
2. AionCore exposes native and WSL rows through `/api/agents`.
3. AionUi preserves the exact row id and `runtime_scope_id` in selector, readiness, and cron payloads.
4. AionCore starts the selected WSL row through `wsl.exe` and the ACP bridge.
5. The WSL CLI completes ACP initialize, session creation, prompt execution, file I/O, and cleanup.

The current live smoke proof covers Codex in `Ubuntu-24.04`. Generic non-bridge CLIs and all bridge backends still need separate live QA before claiming broad provider coverage.

## Known Gaps

- The settings page does not yet provide the full dedicated `Agent Runtime -> WSL` switch, per-distro defaults, stopped-distro probing controls, first-start confirmation, or full diagnostics panel.
- The permission UI has unit coverage for runtime, agent path, WSL path, and host path display, but the latest live run used auto-approved full-access behavior and did not product-smoke an interactive permission prompt.
- Stable release still requires the remaining WSL-9 settings and diagnostics work plus broader manual QA across distros, stopped distro, no WSL, missing CLI, missing `npx`, proxy, and auth failure cases.
