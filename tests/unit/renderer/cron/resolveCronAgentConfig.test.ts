/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { resolveCronAgentConfig } from '@/renderer/pages/cron/ScheduledTasksPage/resolveCronAgentConfig';
import type { AgentMetadata } from '@/renderer/utils/model/agentTypes';

describe('resolveCronAgentConfig', () => {
  it('stores provider id for preset aionrs assistants instead of literal aionrs backend', () => {
    const result = resolveCronAgentConfig({
      agentValue: 'preset:assistant-1',
      conversationAgentType: 'acp',
      cliAgents: [],
      presetAssistants: [
        assistant({
          id: 'assistant-1',
          name: '文件规划助手',
          preset_agent_type: 'aionrs',
        }),
      ],
      selectedAionrsProvider: {
        id: 'provider-gemini',
        name: 'Gemini',
      },
      model_id: 'gemini-3.1-pro-preview',
      workspace: '/tmp/project',
      getMode: () => 'yolo',
      aionrsModelRequiredMessage: 'provider required',
    });

    expect(result).toEqual({
      resolvedAgentType: 'aionrs',
      agent_config: {
        backend: 'provider-gemini',
        name: '文件规划助手',
        is_preset: true,
        custom_agent_id: 'assistant-1',
        preset_agent_type: 'aionrs',
        mode: 'yolo',
        model_id: 'gemini-3.1-pro-preview',
        workspace: '/tmp/project',
      },
    });
  });

  it('keeps preset acp assistants on their backend slug', () => {
    const result = resolveCronAgentConfig({
      agentValue: 'preset:assistant-2',
      conversationAgentType: 'acp',
      cliAgents: [],
      presetAssistants: [
        assistant({
          id: 'assistant-2',
          name: 'Codex 助手',
          preset_agent_type: 'codex',
        }),
      ],
      config_options: { reasoning_effort: 'high' },
      getMode: (backend) => (backend === 'codex' ? 'full-access' : 'yolo'),
      aionrsModelRequiredMessage: 'provider required',
    });

    expect(result).toEqual({
      resolvedAgentType: 'acp',
      agent_config: {
        backend: 'codex',
        name: 'Codex 助手',
        is_preset: true,
        custom_agent_id: 'assistant-2',
        preset_agent_type: 'codex',
        mode: 'full-access',
        config_options: { reasoning_effort: 'high' },
        model_id: undefined,
        workspace: undefined,
      },
    });
  });

  it('resolves CLI agents by id when native and WSL rows share a backend', () => {
    const result = resolveCronAgentConfig({
      agentValue: 'cli:qwen-wsl-ubuntu',
      conversationAgentType: 'acp',
      cliAgents: [
        cliAgent({ id: 'qwen-native', name: 'Qwen', backend: 'qwen' }),
        cliAgent({
          id: 'qwen-wsl-ubuntu',
          name: 'Qwen (Ubuntu)',
          backend: 'qwen',
          runtime: {
            kind: 'wsl',
            distro: 'Ubuntu',
            version: 2,
            state: 'Running',
            cliPath: '/usr/bin/qwen',
          },
          runtime_scope_id: 'wsl:Ubuntu',
          runtime_display_name: 'Ubuntu',
        }),
      ],
      presetAssistants: [],
      config_options: { profile: 'work' },
      workspace: '/tmp/project',
      getMode: (backend) => (backend === 'qwen' ? 'yolo' : undefined),
      aionrsModelRequiredMessage: 'provider required',
    });

    expect(result).toEqual({
      resolvedAgentType: 'acp',
      agent_config: {
        backend: 'qwen',
        name: 'Qwen (Ubuntu)',
        agent_id: 'qwen-wsl-ubuntu',
        runtime_scope_id: 'wsl:Ubuntu',
        custom_agent_id: 'qwen-wsl-ubuntu',
        mode: 'yolo',
        model_id: undefined,
        config_options: { profile: 'work' },
        workspace: '/tmp/project',
      },
    });
  });
});

function assistant(overrides: Pick<Assistant, 'id' | 'name' | 'preset_agent_type'>): Assistant {
  return {
    id: overrides.id,
    source: 'user',
    name: overrides.name,
    name_i18n: {},
    description_i18n: {},
    enabled: true,
    sort_order: 0,
    preset_agent_type: overrides.preset_agent_type,
    enabled_skills: [],
    custom_skill_names: [],
    disabled_builtin_skills: [],
    context_i18n: {},
    prompts: [],
    prompts_i18n: {},
    models: [],
  };
}

function cliAgent(overrides: Pick<AgentMetadata, 'id' | 'name' | 'backend'> & Partial<AgentMetadata>): AgentMetadata {
  return {
    id: overrides.id,
    name: overrides.name,
    backend: overrides.backend,
    agent_type: overrides.agent_type ?? 'acp',
    agent_source: overrides.agent_source ?? 'builtin',
    enabled: true,
    available: true,
    ...overrides,
  };
}
