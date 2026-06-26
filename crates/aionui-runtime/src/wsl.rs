use std::future::Future;
use std::pin::Pin;
use std::time::{Duration, Instant};

use tokio::time;

use crate::Builder;

const DEFAULT_TIMEOUT: Duration = Duration::from_secs(8);
const CLI_PROBE_SCRIPT: &str =
    r#"command -v "$1"; code=$?; printf '\n__AIONUI_WSL_PROBE_EXIT__:%s\n' "$code"; exit "$code""#;
const USER_SHELL_EXEC_SCRIPT: &str = r#"script="$1"
shift
shell="${SHELL:-}"
if [ -z "$shell" ] || [ ! -x "$shell" ]; then
  user="$(id -un 2>/dev/null || true)"
  if [ -n "$user" ]; then
    shell="$(getent passwd "$user" 2>/dev/null | awk -F: '{print $7}')"
  fi
fi
if [ -z "$shell" ] || [ ! -x "$shell" ]; then
  user="${user:-$(id -un 2>/dev/null || true)}"
  if [ -n "$user" ] && [ -r /etc/passwd ]; then
    shell="$(awk -F: -v u="$user" '$1 == u {print $7; exit}' /etc/passwd)"
  fi
fi
if [ -z "$shell" ] || [ ! -x "$shell" ]; then
  shell="/bin/sh"
fi
exec "$shell" -lc "$script" "$@"
"#;
const CLI_PROBE_SENTINEL: &str = "__AIONUI_WSL_PROBE_EXIT__:";
const USER_SHELL_PROBE_MODE: &str = "user-shell";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WslProbeCommandCategory {
    Status,
    Version,
    ListVerbose,
    CleanShellCliProbe,
    UserShellCliProbe,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WslProbeErrorCode {
    WslCommandUnavailable,
    CommandFailed,
    Timeout,
    ParseFailed,
    NoDistro,
    StdoutPolluted,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WslProbeIssue {
    pub category: WslProbeCommandCategory,
    pub code: WslProbeErrorCode,
    pub message: String,
    pub stderr_summary: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WslCommandObservation {
    pub category: WslProbeCommandCategory,
    pub latency_ms: u64,
    pub status_code: Option<i32>,
    pub stderr_summary: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WslStatus {
    pub lines: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WslVersion {
    pub lines: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WslDistro {
    pub name: String,
    pub state: String,
    pub version: Option<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WslCliProbeResult {
    pub command: String,
    pub found_path: Option<String>,
    pub available: bool,
    pub probe_mode: String,
    pub observation: WslCommandObservation,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WslDistroProbe {
    pub distro: WslDistro,
    pub cli_probe: Option<WslCliProbeResult>,
    pub skipped_reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WslProbeReport {
    pub wsl_available: bool,
    pub status: Option<WslStatus>,
    pub version: Option<WslVersion>,
    pub distros: Vec<WslDistroProbe>,
    pub issues: Vec<WslProbeIssue>,
}

impl WslProbeReport {
    fn unavailable(issue: WslProbeIssue) -> Self {
        Self {
            wsl_available: false,
            status: None,
            version: None,
            distros: Vec::new(),
            issues: vec![issue],
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WslRawOutput {
    pub status_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WslRunError {
    Spawn(String),
    Timeout,
}

pub trait WslCommandRunner: Clone + Send + Sync + 'static {
    fn run<'a>(
        &'a self,
        args: Vec<String>,
        timeout: Duration,
    ) -> Pin<Box<dyn Future<Output = Result<WslRawOutput, WslRunError>> + Send + 'a>>;
}

#[derive(Debug, Clone, Default)]
pub struct SystemWslCommandRunner;

impl WslCommandRunner for SystemWslCommandRunner {
    fn run<'a>(
        &'a self,
        args: Vec<String>,
        timeout: Duration,
    ) -> Pin<Box<dyn Future<Output = Result<WslRawOutput, WslRunError>> + Send + 'a>> {
        Box::pin(async move {
            let mut builder = Builder::clean_cli("wsl.exe");
            builder.args(&args);
            match time::timeout(timeout, builder.output()).await {
                Ok(Ok(output)) => Ok(WslRawOutput {
                    status_code: output.status.code(),
                    stdout: decode_process_output(&output.stdout),
                    stderr: decode_process_output(&output.stderr),
                }),
                Ok(Err(error)) => Err(WslRunError::Spawn(error.to_string())),
                Err(_) => Err(WslRunError::Timeout),
            }
        })
    }
}

#[derive(Debug, Clone)]
pub struct WslService<R = SystemWslCommandRunner> {
    runner: R,
    timeout: Duration,
}

impl Default for WslService<SystemWslCommandRunner> {
    fn default() -> Self {
        Self::new()
    }
}

impl WslService<SystemWslCommandRunner> {
    pub fn new() -> Self {
        Self::with_runner(SystemWslCommandRunner)
    }
}

impl<R> WslService<R>
where
    R: WslCommandRunner,
{
    pub fn with_runner(runner: R) -> Self {
        Self {
            runner,
            timeout: DEFAULT_TIMEOUT,
        }
    }

    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    pub async fn probe(&self, cli_command: Option<&str>) -> WslProbeReport {
        let base = self.probe_base().await;
        match cli_command {
            Some(command) => self.probe_command_from_base(&base, command).await,
            None => base,
        }
    }

    pub async fn probe_commands(&self, cli_commands: Vec<String>) -> Vec<(String, WslProbeReport)> {
        if cli_commands.is_empty() {
            return Vec::new();
        }
        let base = self.probe_base().await;
        let mut reports = Vec::with_capacity(cli_commands.len());
        for command in cli_commands {
            let report = self.probe_command_from_base(&base, &command).await;
            reports.push((command, report));
        }
        reports
    }

    async fn probe_base(&self) -> WslProbeReport {
        let status = self
            .run_observed(WslProbeCommandCategory::Status, vec!["--status".into()])
            .await;
        let status = match status {
            Ok((raw, _observation)) if is_success(&raw) => Some(parse_lines(&raw.stdout)),
            Ok((raw, observation)) => {
                return WslProbeReport::unavailable(issue_from_output(
                    WslProbeCommandCategory::Status,
                    WslProbeErrorCode::CommandFailed,
                    "wsl.exe --status failed",
                    &raw,
                    observation,
                ));
            }
            Err(issue) => return WslProbeReport::unavailable(issue),
        };

        let mut issues = Vec::new();
        let version = match self
            .run_observed(WslProbeCommandCategory::Version, vec!["--version".into()])
            .await
        {
            Ok((raw, _)) if is_success(&raw) => Some(WslVersion {
                lines: parse_lines(&raw.stdout),
            }),
            Ok((raw, observation)) => {
                issues.push(issue_from_output(
                    WslProbeCommandCategory::Version,
                    WslProbeErrorCode::CommandFailed,
                    "wsl.exe --version failed",
                    &raw,
                    observation,
                ));
                None
            }
            Err(issue) => {
                issues.push(issue);
                None
            }
        };

        let list = self
            .run_observed(
                WslProbeCommandCategory::ListVerbose,
                vec!["--list".into(), "--verbose".into()],
            )
            .await;
        let distros = match list {
            Ok((raw, observation)) if is_success(&raw) => match parse_wsl_list_verbose(&raw.stdout) {
                Ok(distros) if distros.is_empty() => {
                    issues.push(WslProbeIssue {
                        category: WslProbeCommandCategory::ListVerbose,
                        code: WslProbeErrorCode::NoDistro,
                        message: "wsl.exe returned no distros".into(),
                        stderr_summary: observation.stderr_summary,
                    });
                    Vec::new()
                }
                Ok(distros) => distros,
                Err(message) => {
                    issues.push(WslProbeIssue {
                        category: WslProbeCommandCategory::ListVerbose,
                        code: WslProbeErrorCode::ParseFailed,
                        message,
                        stderr_summary: observation.stderr_summary,
                    });
                    Vec::new()
                }
            },
            Ok((raw, observation)) => {
                issues.push(issue_from_output(
                    WslProbeCommandCategory::ListVerbose,
                    WslProbeErrorCode::CommandFailed,
                    "wsl.exe --list --verbose failed",
                    &raw,
                    observation,
                ));
                Vec::new()
            }
            Err(issue) => {
                issues.push(issue);
                Vec::new()
            }
        };

        let mut distro_probes = Vec::with_capacity(distros.len());
        for distro in distros {
            if !distro.state.eq_ignore_ascii_case("running") {
                distro_probes.push(WslDistroProbe {
                    distro,
                    cli_probe: None,
                    skipped_reason: Some("distro is not Running".into()),
                });
                continue;
            }

            distro_probes.push(WslDistroProbe {
                distro,
                cli_probe: None,
                skipped_reason: None,
            });
        }

        WslProbeReport {
            wsl_available: true,
            status: Some(WslStatus {
                lines: status.expect("wsl status should be present after availability check"),
            }),
            version,
            distros: distro_probes,
            issues,
        }
    }

    async fn probe_command_from_base(&self, base: &WslProbeReport, command: &str) -> WslProbeReport {
        if !base.wsl_available {
            return base.clone();
        }

        let mut issues = base.issues.clone();
        let mut distro_probes = Vec::with_capacity(base.distros.len());
        for distro_probe in &base.distros {
            let mut distro_probe = distro_probe.clone();
            if distro_probe.skipped_reason.is_none() {
                distro_probe.cli_probe = match self.probe_cli_in_distro(&distro_probe.distro.name, command).await {
                    Ok(probe) => Some(probe),
                    Err(issue) => {
                        issues.push(issue);
                        None
                    }
                };
            }
            distro_probes.push(distro_probe);
        }

        WslProbeReport {
            wsl_available: true,
            status: base.status.clone(),
            version: base.version.clone(),
            distros: distro_probes,
            issues,
        }
    }

    async fn probe_cli_in_distro(&self, distro: &str, command: &str) -> Result<WslCliProbeResult, WslProbeIssue> {
        let args = vec![
            "-d".into(),
            distro.into(),
            "--exec".into(),
            "sh".into(),
            "-lc".into(),
            USER_SHELL_EXEC_SCRIPT.into(),
            "aionui-wsl-user-shell".into(),
            CLI_PROBE_SCRIPT.into(),
            "aionui-wsl-probe".into(),
            command.into(),
        ];
        let (raw, observation) = self
            .run_observed(WslProbeCommandCategory::UserShellCliProbe, args)
            .await?;
        let Some((found_path, sentinel_code)) = parse_clean_shell_probe_stdout(&raw.stdout) else {
            return Err(WslProbeIssue {
                category: WslProbeCommandCategory::UserShellCliProbe,
                code: WslProbeErrorCode::StdoutPolluted,
                message: format!("user-shell probe for '{command}' did not return sentinel output"),
                stderr_summary: observation.stderr_summary,
            });
        };
        Ok(WslCliProbeResult {
            command: command.into(),
            found_path,
            available: sentinel_code == 0 && is_success(&raw),
            probe_mode: USER_SHELL_PROBE_MODE.into(),
            observation,
        })
    }

    async fn run_observed(
        &self,
        category: WslProbeCommandCategory,
        args: Vec<String>,
    ) -> Result<(WslRawOutput, WslCommandObservation), WslProbeIssue> {
        let started = Instant::now();
        match self.runner.run(args, self.timeout).await {
            Ok(raw) => {
                let observation = WslCommandObservation {
                    category,
                    latency_ms: started.elapsed().as_millis() as u64,
                    status_code: raw.status_code,
                    stderr_summary: summarize_stderr(&raw.stderr),
                };
                Ok((raw, observation))
            }
            Err(WslRunError::Timeout) => Err(WslProbeIssue {
                category,
                code: WslProbeErrorCode::Timeout,
                message: "wsl.exe command timed out".into(),
                stderr_summary: None,
            }),
            Err(WslRunError::Spawn(message)) => Err(WslProbeIssue {
                category,
                code: WslProbeErrorCode::WslCommandUnavailable,
                message,
                stderr_summary: None,
            }),
        }
    }
}

fn decode_process_output(bytes: &[u8]) -> String {
    if bytes.starts_with(&[0xff, 0xfe]) {
        return decode_utf16(
            bytes[2..]
                .chunks_exact(2)
                .map(|pair| u16::from_le_bytes([pair[0], pair[1]])),
        );
    }
    if bytes.starts_with(&[0xfe, 0xff]) {
        return decode_utf16(
            bytes[2..]
                .chunks_exact(2)
                .map(|pair| u16::from_be_bytes([pair[0], pair[1]])),
        );
    }

    if looks_like_utf16le(bytes) {
        return decode_utf16(bytes.chunks_exact(2).map(|pair| u16::from_le_bytes([pair[0], pair[1]])));
    }
    if looks_like_utf16be(bytes) {
        return decode_utf16(bytes.chunks_exact(2).map(|pair| u16::from_be_bytes([pair[0], pair[1]])));
    }

    String::from_utf8_lossy(bytes).into_owned()
}

fn decode_utf16(units: impl Iterator<Item = u16>) -> String {
    String::from_utf16_lossy(&units.collect::<Vec<_>>())
}

fn looks_like_utf16le(bytes: &[u8]) -> bool {
    looks_like_utf16_with_nul_lane(bytes, 1)
}

fn looks_like_utf16be(bytes: &[u8]) -> bool {
    looks_like_utf16_with_nul_lane(bytes, 0)
}

fn looks_like_utf16_with_nul_lane(bytes: &[u8], nul_lane: usize) -> bool {
    if bytes.len() < 8 || bytes.len() % 2 != 0 {
        return false;
    }
    let pairs = bytes.len() / 2;
    let nul_count = bytes
        .chunks_exact(2)
        .filter(|pair| pair[nul_lane] == 0 && pair[1 - nul_lane] != 0)
        .count();
    nul_count * 2 >= pairs
}

pub fn parse_wsl_list_verbose(stdout: &str) -> Result<Vec<WslDistro>, String> {
    let mut distros = Vec::new();
    for line in stdout.lines().map(str::trim).filter(|line| !line.is_empty()) {
        if line.to_ascii_lowercase().starts_with("name") {
            continue;
        }
        let line = line.trim_start_matches('*').trim();
        let parts = line.split_whitespace().collect::<Vec<_>>();
        if parts.len() < 3 {
            return Err(format!("invalid WSL list row: {line}"));
        }
        let version = parts.last().and_then(|part| part.parse::<u8>().ok());
        let state = parts[parts.len() - 2];
        let name = parts[..parts.len() - 2].join(" ");
        distros.push(WslDistro {
            name,
            state: state.into(),
            version,
        });
    }
    Ok(distros)
}

fn parse_clean_shell_probe_stdout(stdout: &str) -> Option<(Option<String>, i32)> {
    let mut output_lines = Vec::new();
    let mut sentinel_code = None;
    for line in stdout.lines().map(str::trim).filter(|line| !line.is_empty()) {
        if let Some(code) = line.strip_prefix(CLI_PROBE_SENTINEL) {
            if sentinel_code.is_some() {
                return None;
            }
            sentinel_code = code.parse::<i32>().ok();
            continue;
        }
        output_lines.push(line.to_owned());
    }
    let sentinel_code = sentinel_code?;
    if sentinel_code == 0 {
        if output_lines.len() == 1 {
            return Some((output_lines.pop(), sentinel_code));
        }
        return None;
    }
    if output_lines.is_empty() {
        return Some((None, sentinel_code));
    }
    None
}

fn issue_from_output(
    category: WslProbeCommandCategory,
    code: WslProbeErrorCode,
    message: impl Into<String>,
    raw: &WslRawOutput,
    observation: WslCommandObservation,
) -> WslProbeIssue {
    WslProbeIssue {
        category,
        code,
        message: format!("{} (status={:?})", message.into(), raw.status_code),
        stderr_summary: observation.stderr_summary,
    }
}

fn is_success(raw: &WslRawOutput) -> bool {
    raw.status_code == Some(0)
}

fn parse_lines(stdout: &str) -> Vec<String> {
    stdout
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_owned)
        .collect()
}

fn summarize_stderr(stderr: &str) -> Option<String> {
    let mut lines = stderr
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(redact_line)
        .collect::<Vec<_>>();
    if lines.is_empty() {
        return None;
    }
    lines.truncate(3);
    let mut summary = lines.join(" | ");
    const MAX_LEN: usize = 240;
    if summary.len() > MAX_LEN {
        summary.truncate(MAX_LEN);
        summary.push_str("...");
    }
    Some(summary)
}

fn redact_line(line: &str) -> String {
    let mut out = Vec::new();
    let mut redact_next_bearer = false;
    for token in line.split_whitespace() {
        if redact_next_bearer {
            out.push("[REDACTED]".to_owned());
            redact_next_bearer = false;
            continue;
        }
        let lower = token.to_ascii_lowercase();
        if lower == "bearer" {
            out.push("Bearer".to_owned());
            redact_next_bearer = true;
        } else if lower.contains("token=") {
            out.push(redact_assignment_like(token, "token="));
        } else if lower.contains("password=") {
            out.push(redact_assignment_like(token, "password="));
        } else if lower.contains("secret=") {
            out.push(redact_assignment_like(token, "secret="));
        } else if lower.contains("api_key=") || lower.contains("apikey=") {
            out.push(redact_assignment_like(token, "="));
        } else {
            out.push(token.to_owned());
        }
    }
    out.join(" ")
}

fn redact_assignment_like(token: &str, marker: &str) -> String {
    if let Some(idx) = token.to_ascii_lowercase().find(marker) {
        let end = idx + marker.len();
        format!("{}[REDACTED]", &token[..end])
    } else if let Some(idx) = token.find('=') {
        format!("{}=[REDACTED]", &token[..idx])
    } else {
        "[REDACTED]".into()
    }
}

#[cfg(test)]
mod tests {
    use std::collections::VecDeque;
    use std::sync::{Arc, Mutex};

    use super::*;

    #[derive(Clone)]
    struct MockRunner {
        outputs: Arc<Mutex<VecDeque<Result<WslRawOutput, WslRunError>>>>,
        calls: Arc<Mutex<Vec<Vec<String>>>>,
    }

    impl MockRunner {
        fn new(outputs: Vec<Result<WslRawOutput, WslRunError>>) -> Self {
            Self {
                outputs: Arc::new(Mutex::new(outputs.into())),
                calls: Arc::new(Mutex::new(Vec::new())),
            }
        }

        fn calls(&self) -> Vec<Vec<String>> {
            self.calls.lock().unwrap().clone()
        }
    }

    impl WslCommandRunner for MockRunner {
        fn run<'a>(
            &'a self,
            args: Vec<String>,
            _timeout: Duration,
        ) -> Pin<Box<dyn Future<Output = Result<WslRawOutput, WslRunError>> + Send + 'a>> {
            self.calls.lock().unwrap().push(args);
            let output = self.outputs.lock().unwrap().pop_front().expect("missing mock output");
            Box::pin(async move { output })
        }
    }

    fn ok(stdout: &str) -> Result<WslRawOutput, WslRunError> {
        Ok(WslRawOutput {
            status_code: Some(0),
            stdout: stdout.into(),
            stderr: String::new(),
        })
    }

    #[test]
    fn parses_wsl_list_verbose_rows() {
        let rows = parse_wsl_list_verbose(
            r#"
              NAME                   STATE           VERSION
            * Ubuntu                 Running         2
              Debian                 Stopped         1
            "#,
        )
        .unwrap();
        assert_eq!(
            rows,
            vec![
                WslDistro {
                    name: "Ubuntu".into(),
                    state: "Running".into(),
                    version: Some(2),
                },
                WslDistro {
                    name: "Debian".into(),
                    state: "Stopped".into(),
                    version: Some(1),
                },
            ]
        );
    }

    #[test]
    fn decodes_utf16le_wsl_output_before_parsing() {
        let text = "  NAME                   STATE           VERSION\r\n* Ubuntu-24.04           Running         2\r\n";
        let bytes = text.encode_utf16().flat_map(u16::to_le_bytes).collect::<Vec<_>>();
        let decoded = decode_process_output(&bytes);
        let rows = parse_wsl_list_verbose(&decoded).unwrap();

        assert_eq!(
            rows,
            vec![WslDistro {
                name: "Ubuntu-24.04".into(),
                state: "Running".into(),
                version: Some(2),
            }]
        );
    }

    #[tokio::test]
    async fn probe_skips_stopped_distro_and_probes_running_distro() {
        let runner = MockRunner::new(vec![
            ok("Default Distribution: Ubuntu\n"),
            ok("WSL version: 2.5.0\n"),
            ok("NAME STATE VERSION\nUbuntu Running 2\nDebian Stopped 2\n"),
            ok("/usr/bin/claude\n__AIONUI_WSL_PROBE_EXIT__:0\n"),
        ]);
        let service = WslService::with_runner(runner.clone());
        let report = service.probe(Some("claude")).await;
        assert!(report.wsl_available);
        assert_eq!(report.distros.len(), 2);
        assert!(report.distros[0].cli_probe.as_ref().unwrap().available);
        assert_eq!(
            report.distros[1].skipped_reason.as_deref(),
            Some("distro is not Running")
        );

        let calls = runner.calls();
        assert_eq!(calls[3][0], "-d");
        assert_eq!(calls[3][1], "Ubuntu");
        assert_eq!(calls[3][5], USER_SHELL_EXEC_SCRIPT);
        assert_eq!(calls[3][7], CLI_PROBE_SCRIPT);
        assert_eq!(calls[3][9], "claude");
    }

    #[tokio::test]
    async fn probe_commands_reuses_wsl_base_probe_for_multiple_cli_commands() {
        let runner = MockRunner::new(vec![
            ok("Default Distribution: Ubuntu\n"),
            ok("WSL version: 2.5.0\n"),
            ok("NAME STATE VERSION\nUbuntu Running 2\n"),
            ok("/usr/bin/claude\n__AIONUI_WSL_PROBE_EXIT__:0\n"),
            ok("/usr/bin/codex\n__AIONUI_WSL_PROBE_EXIT__:0\n"),
        ]);
        let service = WslService::with_runner(runner.clone());
        let reports = service
            .probe_commands(vec!["claude".into(), "codex".into()])
            .await;

        assert_eq!(reports.len(), 2);
        assert_eq!(reports[0].0, "claude");
        assert_eq!(
            reports[0].1.distros[0].cli_probe.as_ref().unwrap().found_path.as_deref(),
            Some("/usr/bin/claude")
        );
        assert_eq!(reports[1].0, "codex");
        assert_eq!(
            reports[1].1.distros[0].cli_probe.as_ref().unwrap().found_path.as_deref(),
            Some("/usr/bin/codex")
        );

        let calls = runner.calls();
        assert_eq!(calls.len(), 5);
        assert_eq!(calls[0], vec!["--status".to_owned()]);
        assert_eq!(calls[1], vec!["--version".to_owned()]);
        assert_eq!(calls[2], vec!["--list".to_owned(), "--verbose".to_owned()]);
        assert_eq!(calls[3][9], "claude");
        assert_eq!(calls[4][9], "codex");
    }

    #[tokio::test]
    async fn probe_reports_wsl_command_unavailable() {
        let runner = MockRunner::new(vec![Err(WslRunError::Spawn("command not found".into()))]);
        let report = WslService::with_runner(runner).probe(Some("claude")).await;
        assert!(!report.wsl_available);
        assert_eq!(report.issues[0].code, WslProbeErrorCode::WslCommandUnavailable);
    }

    #[tokio::test]
    async fn probe_reports_timeout() {
        let runner = MockRunner::new(vec![Err(WslRunError::Timeout)]);
        let report = WslService::with_runner(runner).probe(Some("claude")).await;
        assert!(!report.wsl_available);
        assert_eq!(report.issues[0].code, WslProbeErrorCode::Timeout);
    }

    #[tokio::test]
    async fn probe_reports_no_distro() {
        let runner = MockRunner::new(vec![
            ok("Default Version: 2\n"),
            ok("WSL version: 2.5.0\n"),
            ok("NAME STATE VERSION\n"),
        ]);
        let report = WslService::with_runner(runner).probe(None).await;
        assert_eq!(report.issues[0].code, WslProbeErrorCode::NoDistro);
    }

    #[tokio::test]
    async fn user_shell_probe_requires_sentinel() {
        let runner = MockRunner::new(vec![
            ok("Default Version: 2\n"),
            ok("WSL version: 2.5.0\n"),
            ok("NAME STATE VERSION\nUbuntu Running 2\n"),
            ok("/usr/bin/claude\n"),
        ]);
        let report = WslService::with_runner(runner).probe(Some("claude")).await;
        assert_eq!(report.issues[0].code, WslProbeErrorCode::StdoutPolluted);
    }

    #[tokio::test]
    async fn user_shell_probe_rejects_polluted_stdout() {
        let runner = MockRunner::new(vec![
            ok("Default Version: 2\n"),
            ok("WSL version: 2.5.0\n"),
            ok("NAME STATE VERSION\nUbuntu Running 2\n"),
            ok("shell startup banner\n/usr/bin/claude\n__AIONUI_WSL_PROBE_EXIT__:0\n"),
        ]);
        let report = WslService::with_runner(runner).probe(Some("claude")).await;
        assert_eq!(report.issues[0].code, WslProbeErrorCode::StdoutPolluted);
    }

    #[tokio::test]
    async fn diagnostics_redact_secret_stderr() {
        let runner = MockRunner::new(vec![
            ok("Default Version: 2\n"),
            ok("WSL version: 2.5.0\n"),
            Ok(WslRawOutput {
                status_code: Some(1),
                stdout: String::new(),
                stderr: "token=abc123 password=hunter2 Bearer eySecret".into(),
            }),
        ]);
        let report = WslService::with_runner(runner).probe(None).await;
        let summary = report.issues[0].stderr_summary.as_ref().unwrap();
        assert!(!summary.contains("abc123"));
        assert!(!summary.contains("hunter2"));
        assert!(!summary.contains("eySecret"));
    }
}
