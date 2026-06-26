/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentMetadata } from '@/renderer/utils/model/agentTypes';
import { isWslRuntime } from '@/renderer/utils/model/agentTypes';
import { Button, Switch, Tag, Typography } from '@arco-design/web-react';
import { Refresh } from '@icon-park/react';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

type WslRuntimeDiagnosticsProps = {
  agents: AgentMetadata[];
  loading?: boolean;
  error?: unknown;
  onRefresh: () => void;
  runtimeEnabled?: boolean;
  runtimeSupported?: boolean;
  runtimeUpdating?: boolean;
  onToggleRuntime?: (enabled: boolean) => void;
};

type WslDistroSummary = {
  distro: string;
  state?: string;
  version?: 1 | 2;
  probeModes: string[];
  cliPaths: string[];
  rows: AgentMetadata[];
};

function resolveDistroName(agent: AgentMetadata): string {
  if (isWslRuntime(agent.runtime) && agent.runtime.distro) return agent.runtime.distro;
  if (agent.runtime_display_name) return agent.runtime_display_name;
  if (agent.runtime_scope_id?.startsWith('wsl:')) return agent.runtime_scope_id.slice('wsl:'.length);
  return 'WSL';
}

function isWslAgent(agent: AgentMetadata): boolean {
  return isWslRuntime(agent.runtime) || agent.runtime_scope_id?.startsWith('wsl:') === true;
}

function buildWslSummaries(agents: AgentMetadata[]): WslDistroSummary[] {
  const summaries = new Map<string, WslDistroSummary>();

  for (const agent of agents.filter(isWslAgent)) {
    const runtime = isWslRuntime(agent.runtime) ? agent.runtime : undefined;
    const distro = resolveDistroName(agent);
    const summary =
      summaries.get(distro) ??
      ({
        distro,
        state: runtime?.state,
        version: runtime?.version,
        probeModes: [],
        cliPaths: [],
        rows: [],
      } satisfies WslDistroSummary);

    summary.rows.push(agent);
    summary.state ||= runtime?.state;
    summary.version ||= runtime?.version;
    if (runtime?.probeMode && !summary.probeModes.includes(runtime.probeMode)) {
      summary.probeModes.push(runtime.probeMode);
    }
    if (runtime?.cliPath && !summary.cliPaths.includes(runtime.cliPath)) {
      summary.cliPaths.push(runtime.cliPath);
    }
    summaries.set(distro, summary);
  }

  return [...summaries.values()].sort((a, b) => a.distro.localeCompare(b.distro));
}

function resolveRuntimeCliPath(agent: AgentMetadata): string | undefined {
  return isWslRuntime(agent.runtime) ? agent.runtime.cliPath : undefined;
}

function resolveRuntimeProbeMode(agent: AgentMetadata): string | undefined {
  return isWslRuntime(agent.runtime) ? agent.runtime.probeMode : undefined;
}

const WslRuntimeDiagnostics: React.FC<WslRuntimeDiagnosticsProps> = ({
  agents,
  loading,
  error,
  onRefresh,
  runtimeEnabled,
  runtimeSupported,
  runtimeUpdating,
  onToggleRuntime,
}) => {
  const { t } = useTranslation();
  const summaries = useMemo(() => buildWslSummaries(agents), [agents]);
  const wslRows = useMemo(() => agents.filter(isWslAgent), [agents]);
  const unavailableCount = wslRows.filter((agent) => agent.available === false || agent.enabled === false).length;

  if (runtimeSupported !== true) {
    return null;
  }

  return (
    <section
      className='mx-16px mt-8px rounded-8px border border-solid border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-12px'
      data-testid='wsl-runtime-diagnostics'
    >
      <div className='mb-10px flex flex-wrap items-center justify-between gap-8px'>
        <div className='min-w-0'>
          <Typography.Text className='block text-13px font-medium text-t-primary'>
            {t('settings.agentManagement.wslDiagnosticsTitle')}
          </Typography.Text>
          <div className='mt-6px flex flex-wrap gap-6px'>
            <Tag size='small' color={wslRows.length > 0 ? 'arcoblue' : 'gray'} data-testid='wsl-runtime-row-count'>
              {t('settings.agentManagement.wslDiagnosticsRows', { count: wslRows.length })}
            </Tag>
            <Tag size='small' color={summaries.length > 0 ? 'green' : 'gray'} data-testid='wsl-runtime-distro-count'>
              {t('settings.agentManagement.wslDiagnosticsDistros', { count: summaries.length })}
            </Tag>
            {unavailableCount > 0 && (
              <Tag size='small' color='orangered' data-testid='wsl-runtime-unavailable-count'>
                {t('settings.agentManagement.wslDiagnosticsUnavailable', { count: unavailableCount })}
              </Tag>
            )}
          </div>
        </div>
        <div className='flex flex-wrap items-center gap-10px'>
          <div className='flex items-center gap-8px' data-testid='wsl-runtime-toggle-row'>
            <Typography.Text className='text-12px text-t-secondary'>
              {t('settings.agentManagement.wslRuntimeEnabled')}
            </Typography.Text>
            <Switch
              size='small'
              checked={runtimeEnabled ?? false}
              loading={runtimeUpdating}
              disabled={runtimeEnabled === undefined || runtimeUpdating}
              onChange={(checked) => onToggleRuntime?.(checked)}
              data-testid='wsl-runtime-enabled-switch'
            />
          </div>
          <Button
            size='mini'
            type='secondary'
            icon={<Refresh size='12' className={loading ? 'animate-spin' : ''} />}
            loading={loading}
            onClick={onRefresh}
            data-testid='wsl-runtime-diagnostics-refresh'
          >
            {t('settings.agentManagement.refreshRuntimeDetection')}
          </Button>
        </div>
      </div>

      {error && (
        <Typography.Text type='secondary' className='mb-8px block text-12px' data-testid='wsl-runtime-error'>
          {t('settings.agentManagement.runtimeDetectionFailed')}
        </Typography.Text>
      )}

      {summaries.length === 0 ? (
        <Typography.Text type='secondary' className='block text-12px' data-testid='wsl-runtime-empty'>
          {t('settings.agentManagement.wslDiagnosticsEmpty')}
        </Typography.Text>
      ) : (
        <div className='flex flex-col gap-8px'>
          {summaries.map((summary) => (
            <div
              key={summary.distro}
              className='rounded-6px border border-solid border-[var(--color-border-1)] bg-[var(--color-fill-1)] p-10px'
              data-testid='wsl-runtime-distro'
            >
              <div className='flex flex-wrap items-center justify-between gap-8px'>
                <Typography.Text className='min-w-0 text-13px font-medium text-t-primary' ellipsis>
                  {summary.distro}
                </Typography.Text>
                <div className='flex flex-wrap gap-6px'>
                  {summary.state && (
                    <Tag size='small' color={summary.state === 'Running' ? 'green' : 'gray'}>
                      {summary.state}
                    </Tag>
                  )}
                  {summary.version && <Tag size='small'>WSL{summary.version}</Tag>}
                  <Tag size='small'>
                    {t('settings.agentManagement.wslDiagnosticsCliCount', { count: summary.rows.length })}
                  </Tag>
                </div>
              </div>
              {summary.probeModes.length > 0 && (
                <Typography.Text className='mt-6px block text-11px text-t-secondary' data-testid='wsl-runtime-probe'>
                  {t('settings.agentManagement.wslDiagnosticsProbeMode', {
                    mode: summary.probeModes.join(', '),
                  })}
                </Typography.Text>
              )}
              {summary.cliPaths.length > 0 && (
                <Typography.Text className='mt-4px block text-11px text-t-secondary' data-testid='wsl-runtime-cli-path'>
                  {t('settings.agentManagement.wslDiagnosticsCliPath', {
                    path: summary.cliPaths[0],
                  })}
                </Typography.Text>
              )}
              <div className='mt-8px flex flex-col gap-6px' data-testid='wsl-runtime-cli-list'>
                {summary.rows.map((agent) => {
                  const cliPath = resolveRuntimeCliPath(agent);
                  const probeMode = resolveRuntimeProbeMode(agent);
                  const isAvailable = agent.available !== false && agent.enabled !== false;

                  return (
                    <div
                      key={agent.id}
                      className='flex flex-col gap-4px rounded-4px bg-[var(--color-bg-2)] px-8px py-6px'
                      data-testid='wsl-runtime-cli-row'
                    >
                      <div className='flex flex-wrap items-center justify-between gap-6px'>
                        <Typography.Text className='min-w-0 text-12px text-t-primary' ellipsis>
                          {agent.name}
                        </Typography.Text>
                        <Tag size='small' color={isAvailable ? 'green' : 'orangered'}>
                          {isAvailable
                            ? t('settings.agentManagement.detected')
                            : t('settings.agentManagement.unavailable')}
                        </Tag>
                      </div>
                      {cliPath && (
                        <Typography.Text
                          className='block text-11px text-t-secondary'
                          data-testid='wsl-runtime-cli-row-path'
                        >
                          {t('settings.agentManagement.runtimeCliPath', { path: cliPath })}
                        </Typography.Text>
                      )}
                      {probeMode && (
                        <Typography.Text
                          className='block text-11px text-t-secondary'
                          data-testid='wsl-runtime-cli-row-probe'
                        >
                          {t('settings.agentManagement.wslDiagnosticsProbeMode', { mode: probeMode })}
                        </Typography.Text>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default WslRuntimeDiagnostics;
