use std::sync::Arc;
use std::time::Instant;

use crate::registry::AgentRegistry;
use aionui_api_types::{AcpHealthCheckRequest, AcpHealthCheckResponse, AgentMetadata};

/// Perform a health check for an ACP backend.
///
/// Reads the registry's resolved availability snapshot instead of
/// re-probing a bare command. This keeps managed ACP rows and WSL-derived
/// rows aligned with the same runtime checks that feed `/api/agents`.
pub(crate) async fn health_check(registry: &Arc<AgentRegistry>, req: &AcpHealthCheckRequest) -> AcpHealthCheckResponse {
    let start = Instant::now();

    let Some(meta) = resolve_health_row(registry, req).await else {
        return AcpHealthCheckResponse {
            available: false,
            latency: None,
            error: Some(format!("No available agent_metadata row for backend '{}'", req.backend)),
        };
    };

    let latency_ms = start.elapsed().as_millis() as u64;
    let available = meta.enabled && meta.available;

    AcpHealthCheckResponse {
        available,
        latency: Some(latency_ms),
        error: if available {
            None
        } else if !meta.enabled {
            Some(format!("Agent '{}' is disabled", meta.name))
        } else {
            Some(format!("Agent '{}' is unavailable", meta.name))
        },
    }
}

async fn resolve_health_row(registry: &Arc<AgentRegistry>, req: &AcpHealthCheckRequest) -> Option<AgentMetadata> {
    if let Some(agent_id) = req.agent_id.as_deref().filter(|value| !value.trim().is_empty()) {
        return registry
            .get(agent_id)
            .await
            .filter(|meta| row_matches_request(meta, req));
    }

    if let Some(meta) = registry
        .list_all()
        .await
        .into_iter()
        .find(|meta| row_matches_request(meta, req))
    {
        return Some(meta);
    }

    if req
        .runtime_scope_id
        .as_deref()
        .is_some_and(|value| !value.trim().is_empty())
    {
        return None;
    }

    registry
        .find_builtin_by_backend(&req.backend)
        .await
        .filter(|meta| row_matches_request(meta, req))
}

fn row_matches_request(meta: &AgentMetadata, req: &AcpHealthCheckRequest) -> bool {
    if meta.backend.as_deref() != Some(req.backend.as_str()) {
        return false;
    }
    if let Some(scope_id) = req.runtime_scope_id.as_deref().filter(|value| !value.trim().is_empty()) {
        return meta.runtime_scope_id.as_deref() == Some(scope_id);
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use aionui_db::{
        IAgentMetadataRepository, SqliteAgentMetadataRepository, UpsertAgentMetadataParams, init_database_memory,
    };

    async fn registry_with_rows(rows: &[UpsertAgentMetadataParams<'_>]) -> Arc<AgentRegistry> {
        let db = init_database_memory().await.unwrap();
        let repo = Arc::new(SqliteAgentMetadataRepository::new(db.pool().clone()));
        for row in rows {
            repo.upsert(row).await.unwrap();
        }
        let reg = AgentRegistry::new(repo);
        reg.hydrate().await.unwrap();
        reg.refresh_availability().await;
        reg
    }

    fn row<'a>(
        id: &'a str,
        backend: &'a str,
        command: Option<&'a str>,
        source_info: &'a str,
    ) -> UpsertAgentMetadataParams<'a> {
        UpsertAgentMetadataParams {
            id,
            icon: None,
            name: id,
            name_i18n: None,
            description: None,
            description_i18n: None,
            backend: Some(backend),
            agent_type: "acp",
            agent_source: "custom",
            agent_source_info: Some(source_info),
            enabled: true,
            command,
            args: Some("[]"),
            env: Some("[]"),
            native_skills_dirs: None,
            behavior_policy: Some("{}"),
            yolo_id: None,
            agent_capabilities: None,
            auth_methods: None,
            config_options: None,
            available_modes: None,
            available_models: None,
            available_commands: None,
            sort_order: 1,
        }
    }

    #[tokio::test]
    async fn health_check_uses_visible_registry_row_for_backend_request() {
        let registry = registry_with_rows(&[row("custom-sh", "custom-sh", Some("sh"), "{}")]).await;

        let result = health_check(
            &registry,
            &AcpHealthCheckRequest {
                backend: "custom-sh".into(),
                agent_id: None,
                runtime_scope_id: None,
            },
        )
        .await;

        assert!(result.available, "{result:?}");
        assert!(result.error.is_none());
    }

    #[tokio::test]
    async fn health_check_reports_unavailable_exact_agent_id_without_backend_fallback() {
        let registry = registry_with_rows(&[row(
            "missing-agent",
            "missing-backend",
            Some("aionui-definitely-missing-cli"),
            "{}",
        )])
        .await;

        let result = health_check(
            &registry,
            &AcpHealthCheckRequest {
                backend: "missing-backend".into(),
                agent_id: Some("missing-agent".into()),
                runtime_scope_id: None,
            },
        )
        .await;

        assert!(!result.available);
        assert_eq!(result.error.as_deref(), Some("Agent 'missing-agent' is unavailable"));
    }

    #[tokio::test]
    async fn health_check_filters_by_runtime_scope_when_supplied() {
        let registry = registry_with_rows(&[row("native-agent", "scoped-backend", Some("sh"), "{}")]).await;

        let result = health_check(
            &registry,
            &AcpHealthCheckRequest {
                backend: "scoped-backend".into(),
                agent_id: None,
                runtime_scope_id: Some("wsl:Ubuntu".into()),
            },
        )
        .await;

        assert!(!result.available);
        assert_eq!(
            result.error.as_deref(),
            Some("No available agent_metadata row for backend 'scoped-backend'")
        );
    }
}
