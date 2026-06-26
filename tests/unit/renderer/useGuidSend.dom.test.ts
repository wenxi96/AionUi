/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMcpServer } from '@/common/config/storage';
import { useGuidSend, type GuidSendDeps } from '@/renderer/pages/guid/hooks/useGuidSend';

const createConversationInvokeMock = vi.fn();
const swrMutateMock = vi.fn();
const modalConfirmMock = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      create: {
        invoke: (...args: unknown[]) => createConversationInvokeMock(...args),
      },
    },
  },
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: vi.fn(),
  },
}));

vi.mock('swr', () => ({
  mutate: (...args: unknown[]) => swrMutateMock(...args),
}));

vi.mock('@/renderer/utils/workspace/workspaceHistory', () => ({
  updateWorkspaceTime: vi.fn(),
}));

vi.mock('@arco-design/web-react', () => ({
  Checkbox: 'Checkbox',
  Message: {
    warning: vi.fn(),
    error: vi.fn(),
  },
  Modal: {
    confirm: (...args: unknown[]) => modalConfirmMock(...args),
  },
}));

const createDeps = (): GuidSendDeps => ({
  input: 'hello',
  setInput: vi.fn(),
  files: [],
  setFiles: vi.fn(),
  dir: '',
  setDir: vi.fn(),
  setLoading: vi.fn(),
  loading: false,
  selectedAgent: 'claude',
  selectedAgentKey: 'preset-claude',
  selectedAgentInfo: {
    id: 'meta-1',
    key: 'preset-claude',
    name: 'Claude',
    agent_type: 'claude',
    backend: 'claude',
    custom_agent_id: 'assistant-1',
    is_preset: true,
    isExtension: false,
  } as never,
  is_presetAgent: true,
  selectedMode: 'bypassPermissions',
  selectedAcpModel: 'claude-opus',
  currentAcpCachedModelInfo: null,
  current_model: undefined,
  findAgentByKey: vi.fn(),
  getEffectiveAgentType: vi.fn(() => ({
    agent_type: 'claude',
    isAvailable: true,
  })),
  resolveEnabledSkills: vi.fn(() => ['skill-a']),
  resolveDisabledBuiltinSkills: vi.fn(() => ['skill-b']),
  guidDisabledBuiltinSkills: undefined,
  guidEnabledSkills: undefined,
  assistantDefaultSkillIds: undefined,
  assistantDefaultDisabledBuiltinSkillIds: undefined,
  availableMcpServers: [{ id: 'mcp-user', name: 'User MCP', enabled: true, builtin: false } as IMcpServer],
  selectedMcpServerIds: ['mcp-user'],
  assistantDefaultMcpIds: undefined,
  currentEffectiveAgentInfo: {
    agent_type: 'claude',
    isAvailable: true,
  } as never,
  isGoogleAuth: false,
  setMentionOpen: vi.fn(),
  setMentionQuery: vi.fn(),
  setMentionSelectorOpen: vi.fn(),
  setMentionActiveIndex: vi.fn(),
  navigate: vi.fn(() => Promise.resolve()) as never,
  t: vi.fn((key: string, options?: { defaultValue?: string }) => options?.defaultValue || key) as never,
  localeKey: 'zh-CN',
});

describe('useGuidSend', () => {
  beforeEach(() => {
    createConversationInvokeMock.mockReset();
    createConversationInvokeMock.mockResolvedValue({ id: 'conv-1' });
    modalConfirmMock.mockReset();
    swrMutateMock.mockReset();
    swrMutateMock.mockResolvedValue(undefined);
    window.localStorage.clear();
  });

  it('passes selected mode into assistant conversation overrides when creating a preset ACP conversation', async () => {
    const { result } = renderHook(() => useGuidSend(createDeps()));

    await act(async () => {
      await result.current.handleSend();
    });

    expect(createConversationInvokeMock).toHaveBeenCalledTimes(1);
    const payload = createConversationInvokeMock.mock.calls[0][0];
    expect(payload.assistant?.conversation_overrides?.permission).toBe('bypassPermissions');
    expect(payload.assistant?.conversation_overrides?.model).toBe('claude-opus');
    expect(swrMutateMock).toHaveBeenCalledWith('guid.assistant.detail.assistant-1.zh-CN');
    expect(swrMutateMock).toHaveBeenCalledWith('assistants.list');
  });

  it('falls back to assistant default skill and MCP ids for preset conversations before local Guid overrides exist', async () => {
    const deps = createDeps();
    deps.guidEnabledSkills = undefined;
    deps.guidDisabledBuiltinSkills = undefined;
    deps.assistantDefaultSkillIds = ['assistant-skill'];
    deps.assistantDefaultDisabledBuiltinSkillIds = ['builtin-skill'];
    deps.selectedMcpServerIds = undefined;
    deps.assistantDefaultMcpIds = ['mcp-user'];

    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    const payload = createConversationInvokeMock.mock.calls[0][0];
    expect(payload.assistant?.conversation_overrides?.skill_ids).toEqual(['assistant-skill']);
    expect(payload.assistant?.conversation_overrides?.disabled_builtin_skill_ids).toEqual(['builtin-skill']);
    expect(payload.assistant?.conversation_overrides?.mcp_ids).toEqual(['mcp-user']);
    expect(payload.extra.selected_mcp_server_ids).toEqual(['mcp-user']);
  });

  it('preserves builtin MCP ids in assistant overrides while only sending user MCP ids to runtime selection', async () => {
    const deps = createDeps();
    deps.availableMcpServers = [
      { id: 'mcp-user', name: 'User MCP', enabled: true, builtin: false } as IMcpServer,
      { id: 'builtin-mcp', name: 'Builtin MCP', enabled: true, builtin: true } as IMcpServer,
    ];
    deps.selectedMcpServerIds = ['mcp-user', 'builtin-mcp'];

    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    const payload = createConversationInvokeMock.mock.calls[0][0];
    expect(payload.assistant?.conversation_overrides?.mcp_ids).toEqual(['mcp-user', 'builtin-mcp']);
    expect(payload.extra.selected_mcp_server_ids).toEqual(['mcp-user']);
    expect(payload.extra.selected_session_mcp_servers).toEqual([expect.objectContaining({ id: 'builtin-mcp' })]);
  });

  it('forwards local skill overrides for non-preset CLI agents through conversation extra', async () => {
    const deps = createDeps();
    deps.selectedAgent = 'claude';
    deps.selectedAgentKey = 'claude';
    deps.selectedAgentInfo = {
      id: 'meta-claude',
      key: 'claude',
      name: 'Claude',
      agent_type: 'claude',
      backend: 'claude',
      is_preset: false,
      isExtension: false,
      cli_path: '/usr/local/bin/claude',
    } as never;
    deps.is_presetAgent = false;
    deps.current_model = { provider_id: 'anthropic', model: 'claude-sonnet', use_model: 'claude-sonnet' } as never;
    deps.guidEnabledSkills = ['pdf-reader'];
    deps.guidDisabledBuiltinSkills = ['todo-tracker'];

    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    const payload = createConversationInvokeMock.mock.calls[0][0];
    expect(payload.assistant).toBeUndefined();
    expect(payload.extra.enabled_skills).toEqual(['pdf-reader']);
    expect(payload.extra.exclude_builtin_skills).toEqual(['todo-tracker']);
  });

  it('forwards local skill overrides for non-preset Aion CLI conversations', async () => {
    const deps = createDeps();
    deps.selectedAgent = 'aionrs';
    deps.selectedAgentKey = 'aionrs';
    deps.selectedAgentInfo = {
      id: 'meta-aionrs',
      key: 'aionrs',
      name: 'Aion CLI',
      agent_type: 'aionrs',
      backend: 'aionrs',
      is_preset: false,
      isExtension: false,
    } as never;
    deps.is_presetAgent = false;
    deps.current_model = { provider_id: 'openai', model: 'gemini-2.5-pro', use_model: 'gemini-2.5-pro' } as never;
    deps.guidEnabledSkills = ['pdf-reader'];
    deps.guidDisabledBuiltinSkills = ['todo-tracker'];

    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    const payload = createConversationInvokeMock.mock.calls[0][0];
    expect(payload.type).toBe('aionrs');
    expect(payload.assistant).toBeUndefined();
    expect(payload.extra.enabled_skills).toEqual(['pdf-reader']);
    expect(payload.extra.exclude_builtin_skills).toEqual(['todo-tracker']);
  });

  it('asks for confirmation before launching a WSL ACP agent and forwards runtime scope', async () => {
    const deps = createDeps();
    const wslAgent = {
      id: 'codex:wsl:ubuntu-24-04',
      key: 'codex:wsl:ubuntu-24-04',
      name: 'Codex CLI (Ubuntu-24.04)',
      agent_type: 'acp',
      backend: 'codex',
      is_preset: false,
      isExtension: false,
      runtime_scope_id: 'wsl:Ubuntu-24.04',
      runtime_display_name: 'Ubuntu-24.04',
      runtime: {
        kind: 'wsl',
        distro: 'Ubuntu-24.04',
        version: 2,
        state: 'Running',
        cliPath: '/home/cheng/.nvm/versions/node/v24.15.0/bin/codex',
        detectedAt: 1,
        probeMode: 'user-shell',
      },
    } as never;
    deps.selectedAgent = 'codex';
    deps.selectedAgentKey = 'codex:wsl:ubuntu-24-04';
    deps.selectedAgentInfo = wslAgent;
    deps.is_presetAgent = false;
    deps.current_model = { provider_id: 'openai', model: 'gpt-5', use_model: 'gpt-5' } as never;
    deps.dir = 'C:\\Users\\cheng\\project';
    deps.findAgentByKey = vi.fn(() => wslAgent);
    deps.getEffectiveAgentType = vi.fn(() => ({
      agent_type: 'codex',
      isAvailable: true,
      isFallback: false,
      originalType: 'codex',
    }));
    modalConfirmMock.mockImplementation((config) => {
      config.onOk();
      return vi.fn();
    });

    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    expect(modalConfirmMock).toHaveBeenCalledTimes(1);
    expect(createConversationInvokeMock).toHaveBeenCalledTimes(1);
    const payload = createConversationInvokeMock.mock.calls[0][0];
    expect(payload.extra.agent_id).toBe('codex:wsl:ubuntu-24-04');
    expect(payload.extra.runtime_scope_id).toBe('wsl:Ubuntu-24.04');
    expect(payload.extra.workspace).toBe('C:\\Users\\cheng\\project');
  });

  it('does not create a WSL ACP conversation when first-launch confirmation is cancelled', async () => {
    const deps = createDeps();
    deps.selectedAgent = 'codex';
    deps.selectedAgentKey = 'codex:wsl:ubuntu-24-04';
    deps.selectedAgentInfo = {
      id: 'codex:wsl:ubuntu-24-04',
      key: 'codex:wsl:ubuntu-24-04',
      name: 'Codex CLI (Ubuntu-24.04)',
      agent_type: 'acp',
      backend: 'codex',
      is_preset: false,
      isExtension: false,
      runtime_scope_id: 'wsl:Ubuntu-24.04',
      runtime: { kind: 'wsl', distro: 'Ubuntu-24.04' },
    } as never;
    deps.current_model = { provider_id: 'openai', model: 'gpt-5', use_model: 'gpt-5' } as never;
    deps.getEffectiveAgentType = vi.fn(() => ({
      agent_type: 'codex',
      isAvailable: true,
      isFallback: false,
      originalType: 'codex',
    }));
    modalConfirmMock.mockImplementation((config) => {
      config.onCancel();
      return vi.fn();
    });

    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    expect(modalConfirmMock).toHaveBeenCalledTimes(1);
    expect(createConversationInvokeMock).not.toHaveBeenCalled();
  });

  it('keeps the prompt text when WSL first-launch confirmation is cancelled from send handler', async () => {
    const deps = createDeps();
    const setInput = vi.fn();
    deps.setInput = setInput;
    deps.selectedAgent = 'codex';
    deps.selectedAgentKey = 'codex:wsl:ubuntu-24-04';
    deps.selectedAgentInfo = {
      id: 'codex:wsl:ubuntu-24-04',
      key: 'codex:wsl:ubuntu-24-04',
      name: 'Codex CLI (Ubuntu-24.04)',
      agent_type: 'acp',
      backend: 'codex',
      is_preset: false,
      isExtension: false,
      runtime_scope_id: 'wsl:Ubuntu-24.04',
      runtime: { kind: 'wsl', distro: 'Ubuntu-24.04' },
    } as never;
    deps.current_model = { provider_id: 'openai', model: 'gpt-5', use_model: 'gpt-5' } as never;
    deps.getEffectiveAgentType = vi.fn(() => ({
      agent_type: 'codex',
      isAvailable: true,
      isFallback: false,
      originalType: 'codex',
    }));
    modalConfirmMock.mockImplementation((config) => {
      config.onCancel();
      return vi.fn();
    });

    const { result } = renderHook(() => useGuidSend(deps));

    act(() => {
      result.current.sendMessageHandler();
    });

    await waitFor(() => expect(modalConfirmMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(deps.setLoading).toHaveBeenLastCalledWith(false));
    expect(createConversationInvokeMock).not.toHaveBeenCalled();
    expect(setInput).not.toHaveBeenCalled();
  });

  it('remembers a confirmed WSL distro and skips later first-launch confirmation', async () => {
    const deps = createDeps();
    deps.selectedAgent = 'codex';
    deps.selectedAgentKey = 'codex:wsl:Ubuntu';
    deps.selectedAgentInfo = {
      id: 'codex:wsl:Ubuntu',
      key: 'codex:wsl:Ubuntu',
      name: 'Codex CLI (Ubuntu)',
      agent_type: 'acp',
      backend: 'codex',
      is_preset: false,
      isExtension: false,
      runtime_scope_id: 'wsl:Ubuntu',
      runtime: { kind: 'wsl', distro: 'Ubuntu' },
    } as never;
    deps.current_model = { provider_id: 'openai', model: 'gpt-5', use_model: 'gpt-5' } as never;
    deps.getEffectiveAgentType = vi.fn(() => ({
      agent_type: 'codex',
      isAvailable: true,
      isFallback: false,
      originalType: 'codex',
    }));
    modalConfirmMock.mockImplementation((config) => {
      const checkbox = config.content.props.children.find((child: { type?: string }) => child.type === 'Checkbox');
      checkbox.props.onChange(true);
      config.onOk();
      return vi.fn();
    });

    const first = renderHook(() => useGuidSend(deps));
    await act(async () => {
      await first.result.current.handleSend();
    });

    createConversationInvokeMock.mockClear();
    const second = renderHook(() => useGuidSend(deps));
    await act(async () => {
      await second.result.current.handleSend();
    });

    expect(modalConfirmMock).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('aionui.guid.wslFirstLaunchConfirmed.wsl:Ubuntu')).toBe('true');
    expect(createConversationInvokeMock).toHaveBeenCalledTimes(1);
  });
});
