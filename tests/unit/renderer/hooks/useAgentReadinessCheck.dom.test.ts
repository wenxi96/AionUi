import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAgentReadinessCheck } from '@/renderer/hooks/agent/useAgentReadinessCheck';

const { checkAgentHealthInvoke, getAgentsMock } = vi.hoisted(() => ({
  checkAgentHealthInvoke: vi.fn(),
  getAgentsMock: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      checkAgentHealth: {
        invoke: checkAgentHealthInvoke,
      },
    },
  },
}));

vi.mock('@/renderer/hooks/agent/useAgents', () => ({
  getAgents: getAgentsMock,
}));

describe('useAgentReadinessCheck', () => {
  beforeEach(() => {
    checkAgentHealthInvoke.mockReset();
    getAgentsMock.mockReset();
  });

  it('passes runtime row identity when checking the selected agent', async () => {
    checkAgentHealthInvoke.mockResolvedValue({ available: true });

    const { result } = renderHook(() =>
      useAgentReadinessCheck({
        backend: 'claude',
        agent_id: 'builtin-claude:wsl:Ubuntu',
        runtime_scope_id: 'wsl:Ubuntu',
        conversation_type: 'acp',
      })
    );

    await act(async () => {
      await result.current.checkCurrentAgent();
    });

    expect(checkAgentHealthInvoke).toHaveBeenCalledWith({
      backend: 'claude',
      agent_id: 'builtin-claude:wsl:Ubuntu',
      runtime_scope_id: 'wsl:Ubuntu',
    });
  });

  it('keeps same-backend runtime variants as alternatives when current row id is known', async () => {
    checkAgentHealthInvoke.mockResolvedValue({ available: false, error: 'not ready' });
    getAgentsMock.mockResolvedValue([
      {
        id: 'builtin-claude:native',
        backend: 'claude',
        agent_type: 'acp',
        agent_source: 'builtin',
        name: 'Claude',
      },
      {
        id: 'builtin-claude:wsl:Ubuntu',
        backend: 'claude',
        agent_type: 'acp',
        agent_source: 'builtin',
        runtime_scope_id: 'wsl:Ubuntu',
        name: 'Claude on Ubuntu',
      },
    ]);

    const { result } = renderHook(() =>
      useAgentReadinessCheck({
        backend: 'claude',
        agent_id: 'builtin-claude:native',
        conversation_type: 'acp',
      })
    );

    await act(async () => {
      await result.current.findAlternatives();
    });

    expect(checkAgentHealthInvoke).toHaveBeenCalledWith({
      backend: 'claude',
      agent_id: 'builtin-claude:wsl:Ubuntu',
      runtime_scope_id: 'wsl:Ubuntu',
    });
  });
});
