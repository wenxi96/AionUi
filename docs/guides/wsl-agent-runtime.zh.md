# WSL Agent Runtime 使用指南

WSL Agent Runtime 用于在 Windows 版 AionUi 中选择并运行安装在 WSL 发行版里的 CLI Agent，例如 Codex、Claude Code、Qwen Code、Goose 或 OpenCode。

## 前置条件

- Windows 已安装 WSL。
- 至少有一个 WSL2 发行版，例如 Ubuntu。
- 目标 CLI 已安装在该 WSL 发行版中。
- 如果 CLI 需要登录或 API key，必须在 WSL 内完成登录或环境变量配置。

## 安装 CLI

在 WSL 终端中安装并验证 CLI。示例：

```bash
which codex
codex --version
```

如果 CLI 是通过 `nvm`、`npm`、`pnpm` 或用户 shell 安装的，请确保登录 shell 能找到它：

```bash
zsh -lc 'which codex && codex --version'
```

## 在 AionUi 中选择 WSL Agent

1. 打开设置页的 Agent 管理区域。
2. 点击检测或刷新 CLI。
3. 在检测到的 Agent 列表中查找带有 `WSL` runtime badge 的条目。
4. 选择对应 WSL 行开始对话。

同一个 backend 可能同时存在 Windows 和 WSL 两行。请选择带有目标 distro 名称的 WSL 行。

## 路径说明

AionUi 运行在 Windows 桌面环境中，Agent 运行在 WSL 中。常见映射如下：

| Windows path                    | WSL path                     |
| ------------------------------- | ---------------------------- |
| `C:\Users\alice\project`        | `/mnt/c/Users/alice/project` |
| `D:\code\repo`                  | `/mnt/d/code/repo`           |
| `\\wsl$\Ubuntu\home\alice\repo` | `/home/alice/repo`           |

当 Agent 请求文件权限时，界面应尽量显示 runtime path 和 Windows host path，方便确认实际访问位置。

## `/mnt/c` 性能提示

在 WSL 中访问 `/mnt/c`、`/mnt/d` 等 Windows 挂载路径通常比访问 WSL 原生 Linux 文件系统慢。大型仓库或频繁文件操作建议放在 WSL 的 Linux 路径下，例如 `/home/<user>/repo`。

## 认证与登录

Windows 侧登录状态通常不会自动同步到 WSL。若 CLI 报认证错误，请进入同一个 distro 执行对应登录命令，例如：

```bash
codex login
claude login
qwen login
```

实际命令以对应 CLI 官方文档为准。

## 安全边界

WSL Agent 在 WSL distro 内运行，可能访问：

- WSL Linux 文件系统，例如 `/home/<user>`。
- 通过 `/mnt/c`、`/mnt/d` 暴露的 Windows 文件。
- 当前 workspace 以及已授权的附加目录。

授权文件读写前，请确认权限卡中的 runtime、agent path、runtime path 和 host path。

## 当前限制

当前已验证 Codex WSL 的核心消息和文件读写链路。完整的专用 WSL Runtime 设置页、首次启动确认和完整诊断面板仍在后续 Stable 工作范围内。
