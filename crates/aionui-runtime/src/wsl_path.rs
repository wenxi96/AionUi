use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WslPathMappingError {
    EmptyPath,
    RelativePath(String),
    DriveRelativePath(String),
    UnsupportedUncPath(String),
    DistroMismatch { expected: String, actual: String },
}

impl fmt::Display for WslPathMappingError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptyPath => write!(f, "workspace path is empty"),
            Self::RelativePath(path) => write!(f, "workspace path must be absolute: {path}"),
            Self::DriveRelativePath(path) => write!(f, "Windows drive-relative paths are not supported: {path}"),
            Self::UnsupportedUncPath(path) => write!(f, "UNC workspace path is not a WSL path: {path}"),
            Self::DistroMismatch { expected, actual } => {
                write!(f, "WSL path targets distro '{actual}', expected '{expected}'")
            }
        }
    }
}

impl std::error::Error for WslPathMappingError {}

/// Map a host-provided workspace path to the path a WSL distro should use.
///
/// This is intentionally a pure mapper. It does not call `wsl.exe`, does not
/// verify that the path exists inside the distro, and does not guess fallback
/// locations for unsupported paths.
pub fn map_workspace_path_for_wsl(path: &str, distro: &str) -> Result<String, WslPathMappingError> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(WslPathMappingError::EmptyPath);
    }

    if trimmed.starts_with('/') {
        return Ok(normalize_posix_path(trimmed));
    }

    if is_unc_path(trimmed) {
        return map_unc_wsl_path(trimmed, distro);
    }

    if is_windows_drive_absolute(trimmed) {
        return Ok(map_drive_path(trimmed));
    }

    if is_windows_drive_relative(trimmed) {
        return Err(WslPathMappingError::DriveRelativePath(trimmed.into()));
    }

    Err(WslPathMappingError::RelativePath(trimmed.into()))
}

fn is_windows_drive_absolute(path: &str) -> bool {
    let bytes = path.as_bytes();
    bytes.len() >= 3 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' && (bytes[2] == b'\\' || bytes[2] == b'/')
}

fn is_windows_drive_relative(path: &str) -> bool {
    let bytes = path.as_bytes();
    bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' && !is_windows_drive_absolute(path)
}

fn is_unc_path(path: &str) -> bool {
    path.starts_with("\\\\") || path.starts_with("//")
}

fn map_drive_path(path: &str) -> String {
    let drive = path.as_bytes()[0].to_ascii_lowercase() as char;
    let rest = path[2..].replace('\\', "/");
    format!("/mnt/{drive}{}", collapse_slashes(&rest))
}

fn map_unc_wsl_path(path: &str, expected_distro: &str) -> Result<String, WslPathMappingError> {
    let normalized = path.replace('\\', "/");
    let parts = normalized
        .trim_start_matches('/')
        .split('/')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();

    if parts.len() < 2 || !is_wsl_unc_host(parts[0]) {
        return Err(WslPathMappingError::UnsupportedUncPath(path.into()));
    }

    let actual_distro = parts[1];
    if !actual_distro.eq_ignore_ascii_case(expected_distro) {
        return Err(WslPathMappingError::DistroMismatch {
            expected: expected_distro.into(),
            actual: actual_distro.into(),
        });
    }

    if parts.len() == 2 {
        return Ok("/".into());
    }

    Ok(format!("/{}", parts[2..].join("/")))
}

fn is_wsl_unc_host(host: &str) -> bool {
    host.eq_ignore_ascii_case("wsl$") || host.eq_ignore_ascii_case("wsl.localhost")
}

fn normalize_posix_path(path: &str) -> String {
    collapse_slashes(path)
}

fn collapse_slashes(path: &str) -> String {
    let mut out = String::with_capacity(path.len());
    let mut last_was_slash = false;
    for ch in path.chars() {
        if ch == '/' {
            if !last_was_slash {
                out.push(ch);
            }
            last_was_slash = true;
        } else {
            out.push(ch);
            last_was_slash = false;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_windows_drive_path_to_wsl_mount() {
        assert_eq!(
            map_workspace_path_for_wsl(r"C:\Users\cheng\project", "Ubuntu").unwrap(),
            "/mnt/c/Users/cheng/project"
        );
        assert_eq!(
            map_workspace_path_for_wsl("D:/work/my project", "Ubuntu").unwrap(),
            "/mnt/d/work/my project"
        );
    }

    #[test]
    fn preserves_posix_absolute_path() {
        assert_eq!(
            map_workspace_path_for_wsl("/home/cheng/project", "Ubuntu").unwrap(),
            "/home/cheng/project"
        );
        assert_eq!(
            map_workspace_path_for_wsl("/mnt/c//Users/cheng/project", "Ubuntu").unwrap(),
            "/mnt/c/Users/cheng/project"
        );
    }

    #[test]
    fn maps_wsl_unc_path_for_matching_distro() {
        assert_eq!(
            map_workspace_path_for_wsl(r"\\wsl$\Ubuntu\home\cheng\project", "Ubuntu").unwrap(),
            "/home/cheng/project"
        );
        assert_eq!(
            map_workspace_path_for_wsl(r"\\wsl.localhost\Ubuntu\home\cheng\project", "ubuntu").unwrap(),
            "/home/cheng/project"
        );
    }

    #[test]
    fn rejects_wsl_unc_path_for_different_distro() {
        assert_eq!(
            map_workspace_path_for_wsl(r"\\wsl$\Debian\home\cheng\project", "Ubuntu").unwrap_err(),
            WslPathMappingError::DistroMismatch {
                expected: "Ubuntu".into(),
                actual: "Debian".into(),
            }
        );
    }

    #[test]
    fn rejects_unsupported_or_relative_paths_without_fallback() {
        assert_eq!(
            map_workspace_path_for_wsl("project", "Ubuntu").unwrap_err(),
            WslPathMappingError::RelativePath("project".into())
        );
        assert_eq!(
            map_workspace_path_for_wsl("C:project", "Ubuntu").unwrap_err(),
            WslPathMappingError::DriveRelativePath("C:project".into())
        );
        assert_eq!(
            map_workspace_path_for_wsl(r"\\server\share\project", "Ubuntu").unwrap_err(),
            WslPathMappingError::UnsupportedUncPath(r"\\server\share\project".into())
        );
    }

    #[test]
    fn rejects_empty_path() {
        assert_eq!(
            map_workspace_path_for_wsl("  ", "Ubuntu").unwrap_err(),
            WslPathMappingError::EmptyPath
        );
    }
}
