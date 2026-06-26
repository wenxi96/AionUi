import { describe, expect, it } from 'vitest';

import { isWslRuntime } from '@/renderer/utils/model/agentRuntime';
import type { AgentMetadata } from '@/renderer/utils/model/agentTypes';

describe('Agent runtime metadata contract', () => {
  it('keeps legacy rows without runtime metadata valid', () => {
    const agent = {
      id: 'legacy-claude',
      name: 'Claude',
      backend: 'claude',
      agent_type: 'acp',
      agent_source: 'builtin',
      enabled: true,
      available: true,
    } satisfies AgentMetadata;

    expect(agent.runtime).toBeUndefined();
    expect(isWslRuntime(agent.runtime)).toBe(false);
  });

  it('detects WSL runtime rows only by runtime kind', () => {
    const agent = {
      id: 'wsl-ubuntu-claude',
      name: 'Claude on Ubuntu',
      backend: 'claude',
      agent_type: 'acp',
      agent_source: 'builtin',
      runtime: {
        kind: 'wsl',
        distro: 'Ubuntu',
        version: 2,
        state: 'Running',
        cliPath: '/usr/local/bin/claude',
        pathEnv: '/usr/local/bin:/usr/bin',
        detectedAt: 1782183123,
        probeMode: 'clean-bash',
      },
      runtime_scope_id: 'wsl:Ubuntu',
      runtime_display_name: 'Ubuntu',
      enabled: true,
      available: true,
    } satisfies AgentMetadata;

    expect(isWslRuntime(agent.runtime)).toBe(true);
    if (isWslRuntime(agent.runtime)) {
      expect(agent.runtime.distro).toBe('Ubuntu');
    }
  });

  it('accepts native runtime rows', () => {
    const agent = {
      id: 'native-claude',
      name: 'Claude',
      backend: 'claude',
      agent_type: 'acp',
      agent_source: 'builtin',
      runtime: {
        kind: 'native',
        platform: 'windows',
      },
      runtime_scope_id: 'native:windows',
      runtime_display_name: 'Windows',
      enabled: true,
      available: true,
    } satisfies AgentMetadata;

    expect(isWslRuntime(agent.runtime)).toBe(false);
  });

  it('accepts WSL custom runtime rows with unique row identity', () => {
    const agent = {
      id: 'custom-wsl-agent',
      name: 'Custom WSL Agent',
      backend: 'custom-cli',
      agent_type: 'acp',
      agent_source: 'custom',
      runtime: {
        kind: 'wsl',
        distro: 'Debian',
        version: 2,
        state: 'Stopped',
        cliPath: '/home/me/bin/custom-agent',
      },
      runtime_scope_id: 'wsl:Debian',
      runtime_display_name: 'Debian',
      enabled: true,
      available: false,
    } satisfies AgentMetadata;

    expect(agent.id).toBe('custom-wsl-agent');
    expect(isWslRuntime(agent.runtime)).toBe(true);
  });

  it('accepts user-shell WSL probe mode for nvm or zsh-installed CLIs', () => {
    const agent = {
      id: 'wsl-zsh-claude',
      name: 'Claude on Ubuntu via user shell',
      backend: 'claude',
      agent_type: 'acp',
      agent_source: 'builtin',
      runtime: {
        kind: 'wsl',
        distro: 'Ubuntu',
        probeMode: 'user-shell',
      },
      runtime_scope_id: 'wsl:Ubuntu',
      runtime_display_name: 'Ubuntu',
      enabled: true,
      available: true,
    } satisfies AgentMetadata;

    expect(isWslRuntime(agent.runtime)).toBe(true);
    if (isWslRuntime(agent.runtime)) {
      expect(agent.runtime.probeMode).toBe('user-shell');
    }
  });

  it('treats unknown future runtime kinds as non-WSL', () => {
    const agent = {
      id: 'container-claude',
      name: 'Claude in Container',
      backend: 'claude',
      agent_type: 'acp',
      agent_source: 'builtin',
      runtime: {
        kind: 'container',
        image: 'ghcr.io/example/claude:latest',
        version: '2026-preview',
      },
      enabled: true,
      available: true,
    } satisfies AgentMetadata;

    expect(isWslRuntime(agent.runtime)).toBe(false);
  });
});
