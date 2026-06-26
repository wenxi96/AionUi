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
    ProviderHealthCheckResponse, WslRuntimeSettingsResponse,
};
use aionui_db::{IClientPreferenceRepository, IProviderRepository};
use aionui_realtime::EventBroadcaster;
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
        Ok(WslRuntimeSettingsResponse {
            enabled: self.registry.is_wsl_enabled(),
            supported: self.registry.is_wsl_supported(),
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
