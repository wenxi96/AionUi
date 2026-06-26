import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getAgentKey,
  getPreferredThoughtLevel,
  savePreferredThoughtLevel,
} from '@/renderer/pages/guid/hooks/agentSelectionUtils';

const { configGetMock, configSetMock } = vi.hoisted(() => ({
  configGetMock: vi.fn(),
  configSetMock: vi.fn(),
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: configGetMock,
    set: configSetMock,
  },
}));

describe('ACP agent preference helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configSetMock.mockResolvedValue(undefined);
  });

  it('reads a trimmed preferred thought level for a backend', () => {
    configGetMock.mockReturnValue({
      codex: { preferredThoughtLevel: ' high ' },
    });

    expect(getPreferredThoughtLevel('codex')).toBe('high');
  });

  it('does not return empty preferred thought level values', () => {
    configGetMock.mockReturnValue({
      codex: { preferredThoughtLevel: '   ' },
    });

    expect(getPreferredThoughtLevel('codex')).toBeUndefined();
  });

  it('saves preferred thought level without dropping existing backend preferences', async () => {
    configGetMock.mockReturnValue({
      codex: { preferredMode: 'full-access', preferredModelId: 'gpt-5.5' },
    });

    await savePreferredThoughtLevel('codex', 'high');

    expect(configSetMock).toHaveBeenCalledWith('acp.config', {
      codex: {
        preferredMode: 'full-access',
        preferredModelId: 'gpt-5.5',
        preferredThoughtLevel: 'high',
      },
    });
  });

  it('uses row id for runtime-scoped builtin rows so native and WSL rows do not collide', () => {
    expect(
      getAgentKey({
        id: 'builtin-claude:wsl:ubuntu',
        agent_type: 'acp',
        agent_source: 'builtin',
        backend: 'claude',
        runtime_scope_id: 'wsl:Ubuntu',
      })
    ).toBe('builtin-claude:wsl:ubuntu');
  });

  it('keeps native builtin rows on the backend key', () => {
    expect(
      getAgentKey({
        id: 'builtin-claude',
        agent_type: 'acp',
        agent_source: 'builtin',
        backend: 'claude',
      })
    ).toBe('claude');
  });
});
