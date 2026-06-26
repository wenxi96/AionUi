/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import type { IMessageAcpPermission } from '@/common/chat/chatLib';
import MessageAcpPermission from '@renderer/pages/conversation/Messages/acp/MessageAcpPermission';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, options?: Record<string, unknown>) => `${k}${options?.distro ?? ''}` }),
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  conversation: {
    confirmMessage: {
      invoke: vi.fn(),
    },
  },
}));

const message: IMessageAcpPermission = {
  id: 'permission-1',
  conversation_id: 'conversation-1',
  type: 'acp_permission',
  position: 'left',
  content: {
    session_id: 'session-1',
    runtime_context: {
      runtime_kind: 'wsl',
      runtime_scope_id: 'wsl:Ubuntu-24.04',
      runtime_display_name: 'Ubuntu-24.04',
      distro: 'Ubuntu-24.04',
      agent_path: '/home/cheng/.local/bin/codex',
      workspace_host_path: 'D:\\code\\project',
      workspace_runtime_path: '/mnt/d/code/project',
    },
    tool_call: {
      tool_call_id: 'tool-1',
      title: 'Edit file',
      kind: 'edit',
      raw_input: {
        path: '/mnt/d/code/project/src/index.ts',
      },
      locations: [{ path: '/mnt/d/code/project/src/index.ts' }],
    },
    options: [{ option_id: 'allow_once', name: 'Allow once', kind: 'allow_once' }],
  },
};

describe('MessageAcpPermission', () => {
  it('shows WSL runtime context and both agent/runtime and host paths', () => {
    render(<MessageAcpPermission message={message} />);

    const context = screen.getByTestId('message-acp-permission-runtime-context');
    expect(context).toHaveTextContent('messages.permissionRuntime');
    expect(context).toHaveTextContent('messages.permissionRuntimeWslUbuntu-24.04');
    expect(context).toHaveTextContent('messages.permissionAgentPath');
    expect(context).toHaveTextContent('/mnt/d/code/project/src/index.ts');
    expect(context).toHaveTextContent('messages.permissionHostPath');
    expect(context).toHaveTextContent('D:\\code\\project');
    expect(context).toHaveTextContent('messages.permissionCliPath');
    expect(context).toHaveTextContent('/home/cheng/.local/bin/codex');
  });
});
