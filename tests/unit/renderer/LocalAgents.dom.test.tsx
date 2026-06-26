/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Render test for the LocalAgents settings surface. Its purpose is to lock in
 * that LocalAgents reads the management view (`useManagedAgents`) — the
 * include_disabled data path that keeps user-disabled agents listed — and
 * derives the detected/custom sections from it.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// t() echoes the key so section labels/buttons are assertable.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

// Controlled management-view data; assert LocalAgents consumes THIS hook.
const useManagedAgents = vi.fn();
vi.mock('@renderer/hooks/agent/useAgents', () => ({
  useManagedAgents: () => useManagedAgents(),
}));

const bridgeMocks = vi.hoisted(() => ({
  getWslRuntimeSettings: vi.fn().mockResolvedValue({ enabled: true, supported: true }),
  updateWslRuntimeSettings: vi.fn().mockResolvedValue({ enabled: false, supported: true }),
}));

// Bridge is only touched by user-action handlers, not on render — stub the
// shape the handlers reference so the import resolves.
vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      createCustomAgent: { invoke: vi.fn() },
      updateCustomAgent: { invoke: vi.fn() },
      deleteCustomAgent: { invoke: vi.fn() },
      setAgentEnabled: { invoke: vi.fn() },
      getWslRuntimeSettings: { invoke: bridgeMocks.getWslRuntimeSettings },
      updateWslRuntimeSettings: { invoke: bridgeMocks.updateWslRuntimeSettings },
    },
  },
}));

// Keep the test focused on LocalAgents' own logic — stub heavy children.
vi.mock('@/renderer/components/base/AionModal', () => ({ default: () => null }));
vi.mock('@renderer/pages/settings/AgentSettings/InlineAgentEditor', () => ({ default: () => null }));
vi.mock('@renderer/pages/settings/AgentSettings/AgentHubModal', () => ({ AgentHubModal: () => null }));

import LocalAgents from '@renderer/pages/settings/AgentSettings/LocalAgents';

const makeAgents = () => [
  { id: 'aionrs', name: 'Aion CLI', agent_type: 'aionrs', agent_source: 'internal', backend: 'aionrs' },
  { id: 'acp-claude', name: 'Claude Code', agent_type: 'acp', agent_source: 'builtin', backend: 'claude' },
  { id: 'custom-1', name: 'My Agent', agent_type: 'acp', agent_source: 'custom', command: 'sh', enabled: true },
];

const makeAgentsWithWsl = () => [
  ...makeAgents(),
  {
    id: 'acp-claude:wsl:ubuntu',
    name: 'Claude Code (Ubuntu)',
    agent_type: 'acp',
    agent_source: 'builtin',
    backend: 'claude',
    runtime_scope_id: 'wsl:Ubuntu',
    runtime_display_name: 'Ubuntu',
    runtime: { kind: 'wsl', distro: 'Ubuntu' },
    enabled: true,
    available: true,
  },
];

describe('LocalAgents', () => {
  beforeEach(() => {
    bridgeMocks.getWslRuntimeSettings.mockResolvedValue({ enabled: true, supported: true });
    bridgeMocks.updateWslRuntimeSettings.mockResolvedValue({ enabled: false, supported: true });
  });

  it('reads the managed-agents view and renders detected + custom sections', async () => {
    useManagedAgents.mockReturnValue({ agents: makeAgents(), revalidate: vi.fn() });

    render(<LocalAgents />);

    // Proves L30 (useManagedAgents) ran and fed the derived lists.
    expect(useManagedAgents).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('wsl-runtime-toggle-row')).toBeTruthy());
    expect(screen.getByText('Aion CLI')).toBeTruthy();
    expect(screen.getByText('Claude Code')).toBeTruthy();
    expect(screen.getByText('My Agent')).toBeTruthy();
  });

  it('shows the empty state when no detected agents are present', () => {
    useManagedAgents.mockReturnValue({ agents: [], revalidate: vi.fn() });

    render(<LocalAgents />);

    expect(screen.getByText('settings.agentManagement.localAgentsEmpty')).toBeTruthy();
  });

  it('hides WSL diagnostics and WSL-derived rows on unsupported hosts', async () => {
    bridgeMocks.getWslRuntimeSettings.mockResolvedValue({ enabled: false, supported: false });
    useManagedAgents.mockReturnValue({ agents: makeAgentsWithWsl(), revalidate: vi.fn() });

    render(<LocalAgents />);

    await waitFor(() => expect(screen.queryByTestId('wsl-runtime-diagnostics')).toBeNull());
    expect(screen.queryByText('Claude Code (Ubuntu)')).toBeNull();
    expect(screen.getByText('Claude Code')).toBeTruthy();
  });

  it('hides WSL-derived rows while host support is still loading', () => {
    bridgeMocks.getWslRuntimeSettings.mockReturnValue(new Promise(() => {}));
    useManagedAgents.mockReturnValue({ agents: makeAgentsWithWsl(), revalidate: vi.fn() });

    render(<LocalAgents />);

    expect(screen.queryByTestId('wsl-runtime-diagnostics')).toBeNull();
    expect(screen.queryByText('Claude Code (Ubuntu)')).toBeNull();
    expect(screen.getByText('Claude Code')).toBeTruthy();
  });
});
