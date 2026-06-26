/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentMetadata } from '@/renderer/utils/model/agentTypes';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const value = options?.count ?? options?.mode ?? options?.path;
      return value === undefined ? key : `${key}:${value}`;
    },
    i18n: { language: 'en' },
  }),
}));

import WslRuntimeDiagnostics from '@renderer/pages/settings/AgentSettings/WslRuntimeDiagnostics';

const wslAgent = (overrides: Partial<AgentMetadata> = {}): AgentMetadata => ({
  id: 'codex-wsl',
  name: 'Codex CLI (Ubuntu-24.04)',
  agent_type: 'acp',
  agent_source: 'builtin',
  backend: 'codex',
  enabled: true,
  available: true,
  runtime_scope_id: 'wsl:Ubuntu-24.04',
  runtime_display_name: 'Ubuntu-24.04',
  runtime: {
    kind: 'wsl',
    distro: 'Ubuntu-24.04',
    version: 2,
    state: 'Running',
    cliPath: '/home/cheng/.bun/bin/codex',
    probeMode: 'user-shell',
  },
  ...overrides,
});

const nativeAgent = (): AgentMetadata => ({
  id: 'codex-native',
  name: 'Codex CLI',
  agent_type: 'acp',
  agent_source: 'builtin',
  backend: 'codex',
  enabled: true,
  available: true,
  runtime_scope_id: 'native:windows',
  runtime_display_name: 'Windows',
  runtime: { kind: 'native' },
});

describe('WslRuntimeDiagnostics', () => {
  it('summarizes WSL rows by distro and exposes runtime diagnostics', () => {
    const onRefresh = vi.fn();

    render(
      <WslRuntimeDiagnostics
        agents={[
          wslAgent(),
          wslAgent({ id: 'claude-wsl', name: 'Claude CLI (Ubuntu-24.04)', backend: 'claude', available: false }),
          nativeAgent(),
        ]}
        onRefresh={onRefresh}
        runtimeEnabled
        runtimeSupported
        onToggleRuntime={vi.fn()}
      />
    );

    expect(screen.getByTestId('wsl-runtime-row-count')).toHaveTextContent(
      'settings.agentManagement.wslDiagnosticsRows:2'
    );
    expect(screen.getByTestId('wsl-runtime-distro-count')).toHaveTextContent(
      'settings.agentManagement.wslDiagnosticsDistros:1'
    );
    expect(screen.getByTestId('wsl-runtime-unavailable-count')).toHaveTextContent(
      'settings.agentManagement.wslDiagnosticsUnavailable:1'
    );
    expect(screen.getByText('Ubuntu-24.04')).toBeTruthy();
    expect(screen.getByText('Running')).toBeTruthy();
    expect(screen.getByText('WSL2')).toBeTruthy();
    expect(screen.getByText('settings.agentManagement.wslDiagnosticsCliCount:2')).toBeTruthy();
    expect(screen.getByTestId('wsl-runtime-probe')).toHaveTextContent(
      'settings.agentManagement.wslDiagnosticsProbeMode:user-shell'
    );
    expect(screen.getByTestId('wsl-runtime-cli-path')).toHaveTextContent(
      'settings.agentManagement.wslDiagnosticsCliPath:/home/cheng/.bun/bin/codex'
    );
    expect(screen.getAllByTestId('wsl-runtime-cli-row')).toHaveLength(2);
    expect(screen.getByText('Codex CLI (Ubuntu-24.04)')).toBeTruthy();
    expect(screen.getByText('Claude CLI (Ubuntu-24.04)')).toBeTruthy();
    expect(screen.getByText('settings.agentManagement.detected')).toBeTruthy();
    expect(screen.getByText('settings.agentManagement.unavailable')).toBeTruthy();
    expect(screen.getAllByTestId('wsl-runtime-cli-row-path')[0]).toHaveTextContent(
      'settings.agentManagement.runtimeCliPath:/home/cheng/.bun/bin/codex'
    );
    expect(screen.getAllByTestId('wsl-runtime-cli-row-probe')[0]).toHaveTextContent(
      'settings.agentManagement.wslDiagnosticsProbeMode:user-shell'
    );

    fireEvent.click(screen.getByTestId('wsl-runtime-diagnostics-refresh'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('surfaces the runtime enable switch and forwards toggle changes', () => {
    const onToggleRuntime = vi.fn();

    render(
      <WslRuntimeDiagnostics
        agents={[wslAgent()]}
        onRefresh={vi.fn()}
        runtimeEnabled={false}
        runtimeSupported
        onToggleRuntime={onToggleRuntime}
      />
    );

    expect(screen.getByTestId('wsl-runtime-toggle-row')).toHaveTextContent(
      'settings.agentManagement.wslRuntimeEnabled'
    );

    fireEvent.click(screen.getByTestId('wsl-runtime-enabled-switch'));
    expect(onToggleRuntime).toHaveBeenCalledWith(true);
  });

  it('renders an empty state when no WSL agents are detected', () => {
    render(<WslRuntimeDiagnostics agents={[nativeAgent()]} onRefresh={vi.fn()} runtimeEnabled runtimeSupported />);

    expect(screen.getByTestId('wsl-runtime-row-count')).toHaveTextContent(
      'settings.agentManagement.wslDiagnosticsRows:0'
    );
    expect(screen.getByTestId('wsl-runtime-empty')).toHaveTextContent('settings.agentManagement.wslDiagnosticsEmpty');
  });

  it('shows WSL distro diagnostics even when no WSL CLI rows are detected', () => {
    render(
      <WslRuntimeDiagnostics
        agents={[nativeAgent()]}
        onRefresh={vi.fn()}
        runtimeEnabled
        runtimeSupported
        diagnostics={{
          wsl_available: true,
          status_lines: ['Default Distribution: Ubuntu-24.04'],
          version_lines: ['WSL version: 2.5.10'],
          distros: [{ name: 'Ubuntu-24.04', state: 'Running', version: 2 }],
          issues: [],
        }}
      />
    );

    expect(screen.getByTestId('wsl-runtime-row-count')).toHaveTextContent(
      'settings.agentManagement.wslDiagnosticsRows:0'
    );
    expect(screen.getByTestId('wsl-runtime-distro-count')).toHaveTextContent(
      'settings.agentManagement.wslDiagnosticsDistros:1'
    );
    expect(screen.getByTestId('wsl-runtime-status')).toHaveTextContent('settings.agentManagement.detected');
    expect(screen.getByTestId('wsl-runtime-base-info')).toHaveTextContent('WSL version: 2.5.10');
    expect(screen.getByText('Ubuntu-24.04')).toBeTruthy();
    expect(screen.getByText('Running')).toBeTruthy();
    expect(screen.getByText('WSL2')).toBeTruthy();
    expect(screen.getByText('settings.agentManagement.wslDiagnosticsCliCount:0')).toBeTruthy();
    expect(screen.queryByTestId('wsl-runtime-empty')).toBeNull();
  });

  it('does not render WSL diagnostics on unsupported hosts', () => {
    render(<WslRuntimeDiagnostics agents={[wslAgent()]} onRefresh={vi.fn()} runtimeEnabled runtimeSupported={false} />);

    expect(screen.queryByTestId('wsl-runtime-diagnostics')).toBeNull();
  });

  it('does not render WSL diagnostics before host support is known', () => {
    render(<WslRuntimeDiagnostics agents={[wslAgent()]} onRefresh={vi.fn()} runtimeEnabled />);

    expect(screen.queryByTestId('wsl-runtime-diagnostics')).toBeNull();
  });
});
