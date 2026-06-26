use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use aionui_common::CommandSpec;
use tokio::sync::Mutex;
use tracing::{debug, warn};

use crate::error::AgentError;

const WSL_AGENT_PID_MARKER: &str = "__AIONUI_WSL_AGENT_PID=";

#[derive(Debug, Clone)]
pub(super) struct WslLifecycle {
    command: PathBuf,
    distro: String,
    agent_pid: Arc<Mutex<Option<u32>>>,
}

impl WslLifecycle {
    pub(super) fn from_command_spec(config: &CommandSpec) -> Option<Self> {
        if !is_wsl_exe(&config.command) {
            return None;
        }
        let distro = distro_from_args(&config.args)?;
        Some(Self {
            command: config.command.clone(),
            distro,
            agent_pid: Arc::new(Mutex::new(None)),
        })
    }

    pub(super) async fn record_stderr_line(&self, line: &str) -> bool {
        let Some(pid) = parse_wsl_agent_pid_marker(line) else {
            return false;
        };
        *self.agent_pid.lock().await = Some(pid);
        debug!(distro = %self.distro, agent_pid = pid, "Recorded WSL agent pid marker");
        true
    }

    pub(super) async fn terminate_agent_tree(&self) -> Result<(), AgentError> {
        self.signal_agent_tree("TERM").await
    }

    pub(super) async fn kill_agent_tree(&self) -> Result<(), AgentError> {
        self.signal_agent_tree("KILL").await
    }

    async fn signal_agent_tree(&self, signal: &str) -> Result<(), AgentError> {
        let Some(pid) = *self.agent_pid.lock().await else {
            debug!(distro = %self.distro, signal, "Skipping WSL agent cleanup without pid marker");
            return Ok(());
        };

        let output = wsl_cleanup_command(&self.command, &self.distro, pid, signal)
            .output()
            .await
            .map_err(|e| {
                AgentError::internal(format!(
                    "Failed to execute WSL agent cleanup for distro '{}': {e}",
                    self.distro
                ))
            })?;

        if output.status.success() {
            debug!(distro = %self.distro, pid, signal, "WSL agent cleanup signal sent");
            return Ok(());
        }

        let stderr = String::from_utf8_lossy(&output.stderr);
        warn!(
            distro = %self.distro,
            pid,
            signal,
            exit_code = ?output.status.code(),
            stderr = %stderr.trim(),
            "WSL agent cleanup command returned non-zero status"
        );
        Ok(())
    }
}

fn is_wsl_exe(command: &Path) -> bool {
    command
        .file_name()
        .and_then(OsStr::to_str)
        .is_some_and(|name| name.eq_ignore_ascii_case("wsl.exe"))
}

fn distro_from_args(args: &[String]) -> Option<String> {
    args.windows(2)
        .find(|pair| pair[0] == "-d" || pair[0] == "--distribution")
        .map(|pair| pair[1].clone())
        .filter(|distro| !distro.trim().is_empty())
}

pub(super) fn parse_wsl_agent_pid_marker(line: &str) -> Option<u32> {
    let value = line.trim().strip_prefix(WSL_AGENT_PID_MARKER)?;
    let pid = value.parse::<u32>().ok()?;
    (pid > 1).then_some(pid)
}

fn wsl_cleanup_command(command: &Path, distro: &str, pid: u32, signal: &str) -> aionui_runtime::Builder {
    let mut cmd = aionui_runtime::Builder::clean_cli(command);
    let signal_arg = format!("-{signal}");
    let pid_arg = pid.to_string();
    cmd.args([
        "-d",
        distro,
        "--exec",
        "sh",
        "-lc",
        r#"pid="$1"; signal="$2"; kill "$signal" "-$pid" 2>/dev/null || kill "$signal" "$pid" 2>/dev/null || true"#,
        "aionui-wsl-cleanup",
        pid_arg.as_str(),
        signal_arg.as_str(),
    ]);
    cmd
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn parses_wsl_agent_pid_marker() {
        assert_eq!(parse_wsl_agent_pid_marker("__AIONUI_WSL_AGENT_PID=42"), Some(42));
        assert_eq!(parse_wsl_agent_pid_marker("__AIONUI_WSL_AGENT_PID=1"), None);
        assert_eq!(parse_wsl_agent_pid_marker("normal stderr"), None);
    }

    #[test]
    fn lifecycle_detects_wsl_command_spec() {
        let spec = CommandSpec {
            command: PathBuf::from("wsl.exe"),
            args: vec![
                "-d".to_owned(),
                "Ubuntu".to_owned(),
                "--cd".to_owned(),
                "/mnt/c/project".to_owned(),
            ],
            env: vec![],
            cwd: None,
        };

        let lifecycle = WslLifecycle::from_command_spec(&spec).expect("wsl lifecycle");
        assert_eq!(lifecycle.command, PathBuf::from("wsl.exe"));
        assert_eq!(lifecycle.distro, "Ubuntu");
    }

    #[test]
    fn lifecycle_ignores_native_command_spec() {
        let spec = CommandSpec {
            command: PathBuf::from("sh"),
            args: vec!["-c".to_owned(), "sleep 10".to_owned()],
            env: vec![],
            cwd: None,
        };

        assert!(WslLifecycle::from_command_spec(&spec).is_none());
    }

    #[test]
    fn cleanup_command_targets_wsl_distro_and_process_group() {
        let preview = wsl_cleanup_command(Path::new("wsl.exe"), "Ubuntu", 1234, "TERM").to_string();
        assert!(preview.contains("wsl.exe"), "preview: {preview}");
        assert!(preview.contains("Ubuntu"), "preview: {preview}");
        assert!(preview.contains("1234"), "preview: {preview}");
        assert!(preview.contains("-TERM"), "preview: {preview}");
    }
}
