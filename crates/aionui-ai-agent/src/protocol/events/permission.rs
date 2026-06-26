use agent_client_protocol::schema::Meta as SdkMeta;
use aionui_api_types::{AgentMetadata, AgentRuntimeMetadata};
use aionui_common::{Confirmation, ConfirmationOption};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::tool_call::{AcpToolCallContentItem, AcpToolCallKind, AcpToolCallLocationItem, AcpToolCallStatus};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum AcpPermissionEventData {
    Request(AcpPermissionRequestData),
    Confirmation(Confirmation),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpPermissionRequestData {
    #[serde(default)]
    pub session_id: String,
    pub tool_call: AcpPermissionToolCall,
    pub options: Vec<AcpPermissionOptionData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runtime_context: Option<AcpPermissionRuntimeContext>,
    #[serde(rename = "_meta", skip_serializing_if = "Option::is_none")]
    pub meta: Option<SdkMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AcpPermissionRuntimeContext {
    pub runtime_kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runtime_scope_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runtime_display_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub distro: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_path: Option<String>,
    pub workspace_host_path: String,
    pub workspace_runtime_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpPermissionToolCall {
    pub tool_call_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<AcpToolCallStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<AcpToolCallKind>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_input: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_output: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<Vec<AcpToolCallContentItem>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub locations: Option<Vec<AcpToolCallLocationItem>>,
    #[serde(rename = "_meta", skip_serializing_if = "Option::is_none")]
    pub meta: Option<SdkMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpPermissionOptionData {
    pub option_id: String,
    pub name: String,
    pub kind: AcpPermissionOptionKind,
    #[serde(rename = "_meta", skip_serializing_if = "Option::is_none")]
    pub meta: Option<SdkMeta>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AcpPermissionOptionKind {
    AllowOnce,
    AllowAlways,
    RejectOnce,
    RejectAlways,
}

impl AcpPermissionRuntimeContext {
    pub fn for_agent(
        metadata: &AgentMetadata,
        workspace_host_path: &str,
        workspace_runtime_path: &str,
    ) -> Option<Self> {
        let runtime = metadata.runtime.as_ref()?;
        if !should_emit_runtime_context(runtime, workspace_host_path, workspace_runtime_path) {
            return None;
        }

        Some(Self {
            runtime_kind: runtime.kind.clone(),
            runtime_scope_id: metadata.runtime_scope_id.clone(),
            runtime_display_name: metadata.runtime_display_name.clone(),
            distro: runtime.distro.clone(),
            agent_path: runtime.cli_path.clone(),
            workspace_host_path: workspace_host_path.to_owned(),
            workspace_runtime_path: workspace_runtime_path.to_owned(),
        })
    }
}

fn should_emit_runtime_context(
    runtime: &AgentRuntimeMetadata,
    workspace_host_path: &str,
    workspace_runtime_path: &str,
) -> bool {
    runtime.is_wsl() || workspace_host_path != workspace_runtime_path
}

impl AcpPermissionEventData {
    pub fn as_confirmation(&self) -> Option<Confirmation> {
        match self {
            Self::Confirmation(conf) => Some(conf.clone()),
            Self::Request(req) => Some(req.to_confirmation()),
        }
    }
}

impl AcpPermissionRequestData {
    pub fn to_confirmation(&self) -> Confirmation {
        Confirmation {
            id: self.tool_call.tool_call_id.clone(),
            call_id: self.tool_call.tool_call_id.clone(),
            title: self.tool_call.title.clone(),
            action: None,
            description: self
                .tool_call
                .raw_input
                .as_ref()
                .and_then(|raw| raw.get("description").and_then(Value::as_str))
                .map(ToOwned::to_owned)
                .unwrap_or_else(|| {
                    self.tool_call
                        .raw_input
                        .as_ref()
                        .map(Value::to_string)
                        .unwrap_or_default()
                }),
            command_type: self.tool_call.kind.map(|kind| match kind {
                AcpToolCallKind::Read => "read".to_owned(),
                AcpToolCallKind::Edit => "edit".to_owned(),
                AcpToolCallKind::Execute => "execute".to_owned(),
            }),
            options: self
                .options
                .iter()
                .map(|opt| ConfirmationOption {
                    label: opt.name.clone(),
                    value: Value::String(opt.option_id.clone()),
                    params: None,
                })
                .collect(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn runtime_context_is_omitted_for_native_matching_workspace() {
        let metadata: AgentMetadata = serde_json::from_value(json!({
            "id": "native-claude",
            "name": "Claude",
            "backend": "claude",
            "agent_type": "acp",
            "agent_source": "builtin",
            "runtime": {
                "kind": "native",
                "platform": "windows"
            },
            "enabled": true,
            "available": true,
            "sort_order": 3100
        }))
        .unwrap();

        let context = AcpPermissionRuntimeContext::for_agent(&metadata, "D:\\code\\project", "D:\\code\\project");

        assert!(context.is_none());
    }

    #[test]
    fn runtime_context_is_built_for_wsl_workspace() {
        let metadata: AgentMetadata = serde_json::from_value(json!({
            "id": "wsl-ubuntu-claude",
            "name": "Claude on Ubuntu",
            "backend": "claude",
            "agent_type": "acp",
            "agent_source": "builtin",
            "runtime": {
                "kind": "wsl",
                "distro": "Ubuntu",
                "cliPath": "/usr/local/bin/claude"
            },
            "runtime_scope_id": "wsl:Ubuntu",
            "runtime_display_name": "Ubuntu",
            "enabled": true,
            "available": true,
            "sort_order": 3110
        }))
        .unwrap();

        let context = AcpPermissionRuntimeContext::for_agent(&metadata, "D:\\code\\project", "/mnt/d/code/project")
            .expect("wsl row should emit runtime context");

        assert_eq!(context.runtime_kind, "wsl");
        assert_eq!(context.runtime_scope_id.as_deref(), Some("wsl:Ubuntu"));
        assert_eq!(context.runtime_display_name.as_deref(), Some("Ubuntu"));
        assert_eq!(context.distro.as_deref(), Some("Ubuntu"));
        assert_eq!(context.agent_path.as_deref(), Some("/usr/local/bin/claude"));
        assert_eq!(context.workspace_host_path, "D:\\code\\project");
        assert_eq!(context.workspace_runtime_path, "/mnt/d/code/project");
    }
}
