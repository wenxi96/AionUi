/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isWslRuntime, type AgentMetadata } from '@/renderer/utils/model/agentTypes';
import AionModal from '@/renderer/components/base/AionModal';
import { useManagedAgents } from '@/renderer/hooks/agent/useAgents';
import { Button, Typography } from '@arco-design/web-react';
import { Home, Plus, Refresh } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import AgentCard from './AgentCard';
import { AgentHubModal } from './AgentHubModal';
import InlineAgentEditor, { type CustomAgentDraft } from './InlineAgentEditor';
import { getAgentKey } from '@/renderer/pages/guid/hooks/agentSelectionUtils';
import WslRuntimeDiagnostics from './WslRuntimeDiagnostics';

const LocalAgents: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [hubModalVisible, setHubModalVisible] = useState(false);
  const [wslRuntimeEnabled, setWslRuntimeEnabled] = useState<boolean>();
  const [wslRuntimeSupported, setWslRuntimeSupported] = useState<boolean>();
  const [wslRuntimeUpdating, setWslRuntimeUpdating] = useState(false);
  const [wslRuntimeError, setWslRuntimeError] = useState<unknown>(null);

  // Management view: includes user-disabled custom agents so they stay
  // listed (greyed) with a working re-enable toggle. `revalidate` here
  // refreshes both the management cache and the shared detected cache, so
  // toggling an agent on/off is reflected in the pickers too.
  const {
    agents: allAgents,
    isLoading: agentsLoading,
    error: agentsError,
    revalidate: mutateAgents,
    refreshCustomAgents,
  } = useManagedAgents();

  const visibleAgents =
    wslRuntimeSupported === true
      ? allAgents
      : allAgents.filter(
          (agent) => !isWslRuntime(agent.runtime) && agent.runtime_scope_id?.startsWith('wsl:') !== true
        );

  const detectedAgents = visibleAgents.filter(
    (a) => (a.agent_type === 'acp' || a.agent_type === 'aionrs') && a.agent_source !== 'custom'
  );

  const customAgents: AgentMetadata[] = visibleAgents.filter((a) => a.agent_source === 'custom');

  const [editorVisible, setEditorVisible] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentMetadata | null>(null);

  useEffect(() => {
    let cancelled = false;
    ipcBridge.acpConversation.getWslRuntimeSettings
      .invoke()
      .then((settings) => {
        if (!cancelled) {
          setWslRuntimeEnabled(settings.enabled);
          setWslRuntimeSupported(settings.supported ?? true);
          setWslRuntimeError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setWslRuntimeError(err);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveCustomAgent = useCallback(
    async (draft: CustomAgentDraft) => {
      const body = {
        name: draft.name,
        command: draft.command,
        icon: draft.icon,
        args: draft.args,
        env: draft.env,
        advanced: draft.advanced,
      };
      try {
        if (editingAgent) {
          await ipcBridge.acpConversation.updateCustomAgent.invoke({ id: editingAgent.id, ...body });
        } else {
          await ipcBridge.acpConversation.createCustomAgent.invoke(body);
        }
        await mutateAgents();
        setEditorVisible(false);
        setEditingAgent(null);
      } catch (err) {
        // Surface backend rejection (e.g. cli_not_found / acp_init_failed) without crashing.
        console.error('save custom agent failed:', err);
      }
    },
    [editingAgent, mutateAgents]
  );

  const handleDeleteCustomAgent = useCallback(
    async (agentId: string) => {
      try {
        await ipcBridge.acpConversation.deleteCustomAgent.invoke({ id: agentId });
        await mutateAgents();
      } catch (err) {
        console.error('delete custom agent failed:', err);
      }
    },
    [mutateAgents]
  );

  const handleToggleCustomAgent = useCallback(
    async (agentId: string, enabled: boolean) => {
      try {
        await ipcBridge.acpConversation.setAgentEnabled.invoke({ id: agentId, enabled });
        await mutateAgents();
      } catch (err) {
        console.error('toggle custom agent failed:', err);
      }
    },
    [mutateAgents]
  );

  // Aion CLI first among detected agents
  const aionrsAgent = detectedAgents?.find((a) => a.agent_type === 'aionrs' || a.backend === 'aionrs');
  const otherDetected = detectedAgents?.filter((a) => a.agent_type !== 'aionrs' && a.backend !== 'aionrs') ?? [];

  const openCustomAgentEditor = useCallback(() => {
    setEditingAgent(null);
    setEditorVisible(true);
  }, []);

  const goToChatWithAgent = useCallback(
    (agent: AgentMetadata) => {
      navigate('/guid', { state: { selectedAgentKey: getAgentKey(agent) } });
    },
    [navigate]
  );

  const refreshDetectedAgents = useCallback(async () => {
    await refreshCustomAgents();
  }, [refreshCustomAgents]);

  const handleToggleWslRuntime = useCallback(
    async (enabled: boolean) => {
      setWslRuntimeUpdating(true);
      try {
        const settings = await ipcBridge.acpConversation.updateWslRuntimeSettings.invoke({ enabled });
        setWslRuntimeEnabled(settings.enabled);
        setWslRuntimeSupported(settings.supported ?? true);
        setWslRuntimeError(null);
        await mutateAgents();
      } catch (err) {
        setWslRuntimeError(err);
      } finally {
        setWslRuntimeUpdating(false);
      }
    },
    [mutateAgents]
  );

  return (
    <div className='flex flex-col gap-8px py-16px'>
      <div className='flex flex-wrap items-center justify-between gap-8px px-16px text-12px text-t-secondary'>
        <div>
          <span>{t('settings.agentManagement.localAgentsDescription')} </span>
          <Button
            type='text'
            size='mini'
            className='!h-auto !p-0 !align-baseline !text-12px !font-normal !text-primary-6 hover:!text-primary-7 hover:!underline underline-offset-2'
            onClick={openCustomAgentEditor}
          >
            {t('settings.agentManagement.detectCustomAgent')}
          </Button>
        </div>
        <Button
          size='mini'
          type='secondary'
          icon={<Refresh size='12' className={agentsLoading ? 'animate-spin' : ''} />}
          loading={agentsLoading}
          onClick={() => void refreshDetectedAgents()}
          data-testid='agent-runtime-refresh'
        >
          {t('settings.agentManagement.refreshRuntimeDetection')}
        </Button>
      </div>
      {agentsError && (
        <Typography.Text type='secondary' className='block px-16px text-12px'>
          {t('settings.agentManagement.runtimeDetectionFailed')}
        </Typography.Text>
      )}

      <WslRuntimeDiagnostics
        agents={visibleAgents}
        loading={agentsLoading}
        error={agentsError || wslRuntimeError}
        onRefresh={() => void refreshDetectedAgents()}
        runtimeEnabled={wslRuntimeEnabled}
        runtimeSupported={wslRuntimeSupported}
        runtimeUpdating={wslRuntimeUpdating}
        onToggleRuntime={(enabled) => void handleToggleWslRuntime(enabled)}
      />

      {process.env.NODE_ENV === 'development' && (
        <div className='px-16px mt-8px'>
          <div className='flex flex-col gap-14px rounded-16px border border-solid border-[rgba(var(--primary-6),0.18)] bg-[rgba(var(--primary-6),0.06)] p-16px md:flex-row md:items-center md:justify-between'>
            <div className='flex items-center gap-12px'>
              <div className='flex h-40px w-40px items-center justify-center leading-none rounded-12px border border-solid border-[rgba(var(--primary-6),0.12)] bg-[rgba(var(--primary-6),0.10)] text-primary-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]'>
                <Home theme='outline' size='20' strokeWidth={2} className='block' />
              </div>
              <div className='min-w-0'>
                <Typography.Text className='mb-4px block text-15px font-medium text-t-primary'>
                  {t('settings.agentManagement.installFromMarket')}
                </Typography.Text>
                <Typography.Text className='block text-12px leading-18px text-t-secondary'>
                  {t('settings.agentManagement.discoverMoreAgents')}
                </Typography.Text>
              </div>
            </div>

            <Button
              type='primary'
              size='small'
              icon={<Plus size='14' />}
              className='!rounded-10px md:!min-w-144px'
              onClick={() => setHubModalVisible(true)}
            >
              {t('settings.agentManagement.installFromMarket')}
            </Button>
          </div>
        </div>
      )}

      {/* Detected Agents section */}
      <div className='px-16px mt-8px'>
        <Typography.Text className='text-12px font-medium text-t-secondary mb-4px block'>
          {t('settings.agentManagement.detected')}
        </Typography.Text>
      </div>
      <div className='grid grid-cols-2 gap-10px px-16px md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'>
        {aionrsAgent && (
          <AgentCard type='detected' agent={aionrsAgent} onGoToChat={() => goToChatWithAgent(aionrsAgent)} />
        )}
        {otherDetected.map((agent) => (
          <AgentCard
            key={agent.id || agent.backend || agent.agent_type}
            type='detected'
            agent={agent}
            onGoToChat={() => goToChatWithAgent(agent)}
          />
        ))}
      </div>
      {(!detectedAgents || detectedAgents.length === 0) && (
        <Typography.Text type='secondary' className='block px-16px py-16px text-center text-12px'>
          {t('settings.agentManagement.localAgentsEmpty')}
        </Typography.Text>
      )}

      {/* Custom Agents section */}
      {(editorVisible || (customAgents && customAgents.length > 0)) && (
        <div className='px-16px mt-16px'>
          <Typography.Text className='text-12px font-medium text-t-secondary mb-4px block'>
            {t('settings.agentManagement.customAgents', { defaultValue: 'Custom Agents' })}
          </Typography.Text>
        </div>
      )}

      <AionModal
        visible={editorVisible}
        onCancel={() => {
          setEditorVisible(false);
          setEditingAgent(null);
        }}
        header={{
          title: editingAgent
            ? t('settings.agentManagement.editCustomAgent')
            : t('settings.agentManagement.detectCustomAgent'),
          showClose: true,
        }}
        footer={null}
        style={{ maxWidth: '92vw', borderRadius: 16 }}
        contentStyle={{
          background: 'var(--dialog-fill-0)',
          borderRadius: 16,
          padding: '20px 24px 16px',
          overflow: 'auto',
        }}
      >
        {/* Conditional mount + key unmounts the editor on close so the
            next `创建自定义 Agent` click always starts from a blank form.
            The inner useEffect([agent]) only resets when the `agent`
            reference changes; two consecutive `null` values would not
            retrigger it. */}
        {editorVisible && (
          <InlineAgentEditor
            key={editingAgent?.id ?? 'new'}
            agent={editingAgent}
            onSave={(agent) => void handleSaveCustomAgent(agent)}
            onCancel={() => {
              setEditorVisible(false);
              setEditingAgent(null);
            }}
          />
        )}
      </AionModal>

      <div className='flex flex-col gap-4px px-0'>
        {customAgents?.map((agent) => (
          <AgentCard
            key={agent.id}
            type='custom'
            agent={agent}
            onGoToChat={() => goToChatWithAgent(agent)}
            onEdit={() => {
              setEditingAgent(agent);
              setEditorVisible(true);
            }}
            onDelete={() => void handleDeleteCustomAgent(agent.id)}
            onToggle={(enabled) => void handleToggleCustomAgent(agent.id, enabled)}
          />
        ))}
      </div>

      {hubModalVisible && <AgentHubModal visible={hubModalVisible} onCancel={() => setHubModalVisible(false)} />}
    </div>
  );
};

export default LocalAgents;
