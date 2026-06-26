/**
 * WSL runtime smoke tests.
 *
 * These tests use the real Electron app and `/api/agents`. The WSL-specific
 * assertions run only when the current backend exposes WSL runtime rows.
 */
import { test, expect } from '../fixtures';
import { AGENT_PILL, GUID_INPUT, goToGuid, httpGet } from '../helpers';
import type { Page } from '@playwright/test';

type RuntimeMetadata = {
  kind?: string;
  distro?: string;
};

type AgentMetadata = {
  id?: string;
  name: string;
  backend?: string;
  agent_type: string;
  runtime?: RuntimeMetadata;
  runtime_scope_id?: string;
};

function attr(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function isWslRow(agent: AgentMetadata): boolean {
  return agent.runtime?.kind === 'wsl' || agent.runtime_scope_id?.startsWith('wsl:') === true;
}

async function fetchAgents(page: Page): Promise<AgentMetadata[]> {
  return httpGet<AgentMetadata[]>(page, '/api/agents');
}

async function expectBackendPortReady(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const w = window as unknown as {
            __backendPort?: number;
            __backendPortState?: { getPort: () => number };
          };
          return w.__backendPortState?.getPort?.() ?? w.__backendPort ?? 0;
        }),
      {
        message: 'Electron backend port must be injected before WSL runtime smoke fetches /api/agents',
        timeout: 15_000,
      }
    )
    .toBeGreaterThan(0);
}

test.describe('WSL Runtime Smoke', () => {
  test('agent rows use unique UI selection keys', async ({ page }) => {
    await expectBackendPortReady(page);
    const agents = await fetchAgents(page);
    expect(agents.length).toBeGreaterThan(0);

    await goToGuid(page);
    const pills = page.locator(AGENT_PILL);
    await expect(pills.first()).toBeVisible({ timeout: 15_000 });

    const keys = await pills.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-agent-key')).filter((key): key is string => Boolean(key))
    );
    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('WSL runtime row is selectable by row id when available', async ({ page }, testInfo) => {
    await expectBackendPortReady(page);
    const agents = await fetchAgents(page);
    const wslRows = agents.filter(isWslRow);
    await testInfo.attach('wsl-runtime-agent-summary', {
      body: JSON.stringify(
        {
          totalAgents: agents.length,
          wslRows: wslRows.map((agent) => ({
            id: agent.id,
            backend: agent.backend,
            agent_type: agent.agent_type,
            runtime_scope_id: agent.runtime_scope_id,
            runtime: agent.runtime,
          })),
        },
        null,
        2
      ),
      contentType: 'application/json',
    });

    if (wslRows.length === 0) {
      test.skip(true, 'Current backend/environment did not expose WSL runtime rows.');
    }

    const target = wslRows[0];
    expect(target.id).toBeTruthy();
    expect(target.runtime_scope_id).toMatch(/^wsl:/);

    await goToGuid(page);
    const pill = page.locator(`${AGENT_PILL}[data-agent-key="${attr(target.id!)}"]`);
    await expect(pill).toBeVisible({ timeout: 15_000 });
    await expect(pill).toHaveAttribute('data-runtime-kind', 'wsl');
    await expect(pill).toHaveAttribute('data-runtime-scope-id', target.runtime_scope_id!);

    await pill.click();
    await expect(pill).toHaveAttribute('data-agent-selected', 'true');

    if (target.backend) {
      const sameBackendRows = page.locator(
        `${AGENT_PILL}[data-agent-backend="${attr(target.backend)}"]:not([data-agent-key="${attr(target.id!)}"])`
      );
      if ((await sameBackendRows.count()) > 0) {
        await expect(sameBackendRows.first()).toHaveAttribute('data-agent-selected', 'false');
      }
    }
  });

  test('first WSL launch asks for confirmation before creating a conversation', async ({ page }, testInfo) => {
    await expectBackendPortReady(page);
    const agents = await fetchAgents(page);
    const target = agents.find(isWslRow);
    if (!target?.id) {
      test.skip(true, 'Current backend/environment did not expose WSL runtime rows.');
    }

    await testInfo.attach('wsl-first-launch-target', {
      body: JSON.stringify(
        {
          id: target.id,
          name: target.name,
          backend: target.backend,
          runtime_scope_id: target.runtime_scope_id,
          runtime: target.runtime,
        },
        null,
        2
      ),
      contentType: 'application/json',
    });

    await page.evaluate(() => {
      for (const key of Object.keys(window.localStorage)) {
        if (key.startsWith('aionui.guid.wslFirstLaunchConfirmed.')) {
          window.localStorage.removeItem(key);
        }
      }
    });

    await goToGuid(page);
    const pill = page.locator(`${AGENT_PILL}[data-agent-key="${attr(target.id)}"]`);
    await expect(pill).toBeVisible({ timeout: 15_000 });
    await pill.click();
    await expect(pill).toHaveAttribute('data-agent-selected', 'true');

    const previousHash = await page.evaluate(() => window.location.hash);
    const textarea = page.locator(GUID_INPUT);
    await textarea.fill('WSL first launch confirmation smoke');
    await textarea.press('Enter');

    const modal = page.locator('.arco-modal').filter({ hasText: target.name });
    await expect(modal).toBeVisible({ timeout: 10_000 });
    await expect(modal).toContainText(target.runtime_scope_id?.replace(/^wsl:/, '') || target.runtime?.distro || 'WSL');
    await modal.getByRole('button', { name: /Cancel|取消/ }).click();
    await expect(modal).toBeHidden({ timeout: 5_000 });
    await expect
      .poll(() => page.evaluate(() => window.location.hash), {
        message: 'Cancelling the first WSL launch confirmation must not create a conversation',
        timeout: 2_000,
      })
      .toBe(previousHash);

    await textarea.press('Enter');
    const secondModal = page.locator('.arco-modal').filter({ hasText: target.name });
    await expect(secondModal).toBeVisible({ timeout: 10_000 });
    await secondModal.getByRole('button', { name: /Continue|继续|繼續/ }).click();
    await page.waitForFunction(
      (prevHash) => window.location.hash.includes('/conversation/') && window.location.hash !== prevHash,
      previousHash,
      { timeout: 15_000 }
    );
  });
});
