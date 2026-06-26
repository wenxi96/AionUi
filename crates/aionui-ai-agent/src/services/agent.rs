//! Business-logic layer for the ai-agent crate.
//!
//! Per `AGENTS.md` "Domain Crate Structure", this is the sole location
//! for agent-related business logic. HTTP handlers in `routes/` should
//! only extract inputs, call methods on this service, and wrap the
//! result in `ApiResponse`.
//!
//! Session-scoped operations (mode/model/config/usage/capabilities/
//! slash-commands/side-question/workspace/openclaw-runtime) now live in
//! `aionui-conversation::ConversationService`, which dispatches through
//! `AgentInstance`. This service retains only agent-catalog and
//! ACP health-check responsibilities, plus support for the custom-agent
//! CRUD endpoints (see `services::custom`).

use std::path::PathBuf;
use std::sync::Arc;

use aionui_api_types::{
    AcpHealthCheckRequest, AcpHealthCheckResponse, AgentMetadata, ProviderHealthCheckRequest,
    ProviderHealthCheckResponse, WslRuntimeDiagnostics, WslRuntimeDistroDiagnostics, WslRuntimeIssueDiagnostics,
    WslRuntimeSettingsResponse,
};
use aionui_db::{IClientPreferenceRepository, IProviderRepository};
use aionui_realtime::EventBroadcaster;
use aionui_runtime::WslProbeReport;
use serde_json::json;

use super::provider_health::ProviderHealthCheckService;
use crate::error::AgentError;
use crate::registry::AgentRegistry;

const WSL_RUNTIME_ENABLED_PREF_KEY: &str = "agentRuntime.wsl.enabled";

pub struct AgentService {
    registry: Arc<AgentRegistry>,
    broadcaster: Arc<dyn EventBroadcaster>,
    data_dir: PathBuf,
    provider_health: ProviderHealthCheckService,
    client_pref_repo: Arc<dyn IClientPreferenceRepository>,
}

impl AgentService {
    pub fn new(
        registry: Arc<AgentRegistry>,
        broadcaster: Arc<dyn EventBroadcaster>,
        provider_repo: Arc<dyn IProviderRepository>,
        client_pref_repo: Arc<dyn IClientPreferenceRepository>,
        encryption_key: [u8; 32],
        data_dir: PathBuf,
    ) -> Arc<Self> {
        let provider_health = ProviderHealthCheckService::new(provider_repo, encryption_key, data_dir.clone());
        Arc::new(Self {
            registry,
            broadcaster,
            data_dir,
            provider_health,
            client_pref_repo,
        })
    }

    /// Data directory used by the custom-agent probe to spawn CLI
    /// processes with a stable cwd.
    pub(crate) fn data_dir(&self) -> &std::path::Path {
        &self.data_dir
    }

    /// Registry accessor consumed by the `services::custom` submodule
    /// for direct repository access (upsert / delete / enable toggle).
    pub(crate) fn registry(&self) -> &Arc<AgentRegistry> {
        &self.registry
    }

    pub(crate) fn broadcaster(&self) -> &Arc<dyn EventBroadcaster> {
        &self.broadcaster
    }
}

// Agent operations
impl AgentService {
    pub async fn list_agents(&self) -> Result<Vec<AgentMetadata>, AgentError> {
        Ok(self
            .registry
            .list_all()
            .await
            .into_iter()
            .filter(|agent| agent.agent_type.supports_new_conversation())
            .collect())
    }

    pub async fn refresh_agents(&self) -> Result<Vec<AgentMetadata>, AgentError> {
        self.registry.refresh_availability().await;
        Ok(self
            .registry
            .list_all()
            .await
            .into_iter()
            .filter(|agent| agent.agent_type.supports_new_conversation())
            .collect())
    }

    pub async fn get_wsl_runtime_settings(&self) -> Result<WslRuntimeSettingsResponse, AgentError> {
        let enabled = self.registry.is_wsl_enabled();
        let supported = self.registry.is_wsl_supported();
        Ok(WslRuntimeSettingsResponse {
            enabled,
            supported,
            diagnostics: if enabled && supported {
                self.registry
                    .wsl_diagnostics()
                    .await
                    .map(build_wsl_runtime_diagnostics)
            } else {
                None
            },
        })
    }

    pub async fn update_wsl_runtime_settings(&self, enabled: bool) -> Result<WslRuntimeSettingsResponse, AgentError> {
        let effective_enabled = enabled && self.registry.is_wsl_supported();
        let value = serde_json::to_string(&json!(effective_enabled))
            .map_err(|e| AgentError::internal(format!("serialize WSL runtime setting: {e}")))?;
        self.client_pref_repo
            .upsert_batch(&[(WSL_RUNTIME_ENABLED_PREF_KEY, value.as_str())])
            .await
            .map_err(|e| AgentError::internal(format!("persist WSL runtime setting: {e}")))?;

        self.registry.set_wsl_enabled(effective_enabled).await;
        self.get_wsl_runtime_settings().await
    }

    pub async fn acp_health_check(&self, req: AcpHealthCheckRequest) -> Result<AcpHealthCheckResponse, AgentError> {
        Ok(crate::protocol::cli_detect::health_check(&self.registry, &req).await)
    }

    pub async fn provider_health_check(
        &self,
        req: ProviderHealthCheckRequest,
    ) -> Result<ProviderHealthCheckResponse, AgentError> {
        self.provider_health.health_check(req).await
    }
}

fn build_wsl_runtime_diagnostics(report: WslProbeReport) -> WslRuntimeDiagnostics {
    WslRuntimeDiagnostics {
        wsl_available: report.wsl_available,
        status_lines: report.status.map(|status| status.lines).unwrap_or_default(),
        version_lines: report.version.map(|version| version.lines).unwrap_or_default(),
        distros: report
            .distros
            .into_iter()
            .map(|probe| WslRuntimeDistroDiagnostics {
                name: probe.distro.name,
                state: probe.distro.state,
                version: probe.distro.version,
                skipped_reason: probe.skipped_reason,
            })
            .collect(),
        issues: report
            .issues
            .into_iter()
            .map(|issue| WslRuntimeIssueDiagnostics {
                category: format!("{:?}", issue.category),
                code: format!("{:?}", issue.code),
                message: issue.message,
                stderr_summary: issue.stderr_summary,
            })
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use aionui_runtime::{WslDistro, WslDistroProbe, WslStatus, WslVersion};

    #[test]
    fn wsl_runtime_diagnostics_preserve_distro_state_without_cli_rows() {
        let diagnostics = build_wsl_runtime_diagnostics(WslProbeReport {
            wsl_available: true,
            status: Some(WslStatus {
                lines: vec!["Default Distribution: Ubuntu-24.04".into()],
            }),
            version: Some(WslVersion {
                lines: vec!["WSL version: 2.5.10".into()],
            }),
            distros: vec![WslDistroProbe {
                distro: WslDistro {
                    name: "Ubuntu-24.04".into(),
                    state: "Running".into(),
                    version: Some(2),
                },
                cli_probe: None,
                skipped_reason: None,
            }],
            issues: Vec::new(),
        });

        assert!(diagnostics.wsl_available);
        assert_eq!(
            diagnostics.status_lines,
            vec!["Default Distribution: Ubuntu-24.04".to_owned()]
        );
        assert_eq!(diagnostics.version_lines, vec!["WSL version: 2.5.10".to_owned()]);
        assert_eq!(diagnostics.distros.len(), 1);
        assert_eq!(diagnostics.distros[0].name, "Ubuntu-24.04");
        assert_eq!(diagnostics.distros[0].state, "Running");
        assert_eq!(diagnostics.distros[0].version, Some(2));
    }
}
