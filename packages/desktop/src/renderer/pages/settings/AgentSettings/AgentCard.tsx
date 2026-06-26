/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Avatar, Button, Switch, Tag, Typography } from '@arco-design/web-react';
import { Delete, EditTwo, Robot } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { resolveAgentLogo } from '@/renderer/utils/model/agentLogo';
import { resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import { isWslRuntime, type AgentRuntimeWireMetadata } from '@/renderer/utils/model/agentTypes';

type DetectedAgent = {
  id?: string;
  agent_type: string;
  backend?: string;
  icon?: string;
  name: string;
  custom_agent_id?: string;
  isExtension?: boolean;
  avatar?: string;
  available?: boolean;
  runtime?: AgentRuntimeWireMetadata;
  runtime_scope_id?: string;
  runtime_display_name?: string;
};

/** Minimal custom-agent fields consumed by the 'custom' card variant. */
type CustomAgentCardData = {
  id: string;
  name: string;
  /** User-picked emoji or avatar URL (maps to `AgentMetadata.icon`). */
  icon?: string;
  /** Spawn command for the CLI. */
  command?: string;
  /** Launch arguments for the CLI. */
  args?: string[];
  enabled: boolean;
};

type AgentCardProps =
  | {
      type: 'detected';
      agent: DetectedAgent;
      onGoToChat: () => void;
    }
  | {
      type: 'custom';
      agent: CustomAgentCardData;
      onGoToChat: () => void;
      onEdit: () => void;
      onDelete: () => void;
      onToggle: (enabled: boolean) => void;
    };

function isImageLogoSource(value: string): boolean {
  return (
    /^data:image\//i.test(value) ||
    /^[a-z][a-z\d+.-]*:/i.test(value) ||
    value.startsWith('//') ||
    value.startsWith('/') ||
    /\.(?:svg|png|jpe?g|webp|gif)(?:[?#].*)?$/i.test(value)
  );
}

const AgentLogoAvatar: React.FC<{ logo: string | null; name: string; size: number }> = ({ logo, name, size }) => {
  const [imageFailed, setImageFailed] = React.useState(false);

  React.useEffect(() => {
    setImageFailed(false);
  }, [logo]);

  const showImage = Boolean(logo && isImageLogoSource(logo) && !imageFailed);

  return (
    <Avatar size={size} shape='square' style={{ flexShrink: 0, backgroundColor: 'transparent' }}>
      {showImage ? (
        <img
          src={logo ?? undefined}
          alt={name}
          className='h-full w-full object-contain'
          onError={() => setImageFailed(true)}
        />
      ) : logo && !isImageLogoSource(logo) ? (
        <span className='leading-none'>{logo}</span>
      ) : (
        <Robot theme='outline' size={size > 32 ? '22' : '18'} />
      )}
    </Avatar>
  );
};

const AgentCard: React.FC<AgentCardProps> = (props) => {
  const { t } = useTranslation();
  const goToChatButtonClassName = '!w-full !justify-center !rounded-10px !text-12px';

  if (props.type === 'detected') {
    const { agent, onGoToChat } = props;
    const runtime = agent.runtime;
    const isWsl = isWslRuntime(runtime);
    const runtimeLabel = isWsl
      ? t('settings.agentManagement.runtimeWsl', { distro: runtime.distro })
      : t('settings.agentManagement.runtimeWindows');
    const runtimeStatus = isWsl
      ? [runtime.state, runtime.version ? `WSL${runtime.version}` : undefined].filter(Boolean).join(' · ')
      : undefined;
    const extensionAvatar = resolveExtensionAssetUrl(agent.isExtension ? agent.avatar : undefined);
    const logo =
      extensionAvatar ||
      resolveAgentLogo({
        icon: agent.icon,
        backend: agent.backend || agent.agent_type,
        custom_agent_id: agent.custom_agent_id,
        isExtension: agent.isExtension,
      });

    return (
      <div className='flex min-h-[180px] flex-col rounded-12px border border-solid border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-12px transition-colors hover:border-[var(--color-border-3)]'>
        <div className='mb-10px flex justify-center'>
          <AgentLogoAvatar logo={logo} name={agent.name} size={40} />
        </div>

        <div className='mb-10px flex-1 text-center'>
          <Typography.Text className='block text-13px font-medium leading-18px line-clamp-2'>
            {agent.name}
          </Typography.Text>
          <div className='mt-6px flex justify-center'>
            <Tag size='small' color={isWsl ? 'arcoblue' : 'gray'} data-testid='agent-runtime-badge'>
              {runtimeLabel}
            </Tag>
          </div>
          {runtimeStatus && (
            <Typography.Text
              className='mt-4px block text-11px text-t-secondary'
              data-testid='agent-runtime-status'
              ellipsis
            >
              {runtimeStatus}
            </Typography.Text>
          )}
          {isWsl && runtime.cliPath && (
            <Typography.Text
              className='mt-4px block text-11px text-t-secondary'
              data-testid='agent-runtime-cli-path'
              ellipsis
            >
              {t('settings.agentManagement.runtimeCliPath', { path: runtime.cliPath })}
            </Typography.Text>
          )}
          <Typography.Text className='mt-4px block text-11px text-t-secondary'>
            {agent.available === false
              ? t('settings.agentManagement.unavailable')
              : t('settings.agentManagement.detected')}
          </Typography.Text>
        </div>

        <Button
          size='small'
          type='secondary'
          onClick={onGoToChat}
          className={goToChatButtonClassName}
          disabled={agent.available === false}
        >
          {t('settings.agentManagement.goToChat')}
        </Button>
      </div>
    );
  }

  const { agent, onGoToChat, onEdit, onDelete, onToggle } = props;
  const isDisabled = agent.enabled === false;

  return (
    <div className='flex items-center justify-between px-16px py-10px rd-8px bg-aou-1 hover:bg-aou-2'>
      <div className={`flex items-center gap-12px min-w-0 flex-1 ${isDisabled ? 'opacity-50' : ''}`}>
        <Avatar
          size={32}
          shape='square'
          style={{ flexShrink: 0, backgroundColor: agent.icon ? 'var(--color-fill-2)' : 'transparent', fontSize: 18 }}
        >
          {agent.icon || <Robot theme='outline' size='20' />}
        </Avatar>
        <div className='min-w-0 flex-1'>
          <Typography.Text className='font-medium text-14px'>{agent.name || 'Custom Agent'}</Typography.Text>
          <div className='text-12px text-t-secondary truncate'>
            {agent.command}
            {agent.args && agent.args.length > 0 ? ` ${agent.args.join(' ')}` : ''}
          </div>
        </div>
      </div>
      <div className='flex items-center gap-8px'>
        <Switch size='small' checked={agent.enabled !== false} onChange={onToggle} />
        <Button size='small' type='text' onClick={onGoToChat} disabled={agent.enabled === false}>
          {t('settings.agentManagement.goToChat')}
        </Button>
        <Button size='small' type='text' icon={<EditTwo theme='outline' size='14' />} onClick={onEdit} />
        <Button
          size='small'
          type='text'
          status='danger'
          icon={<Delete theme='outline' size='14' />}
          onClick={onDelete}
        />
      </div>
    </div>
  );
};

export default AgentCard;
