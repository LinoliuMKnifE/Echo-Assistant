import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { LumaApplicationService } from '@luma/core';
import { RpcRouter } from './rpc.js';

const roots: string[] = [];
const workspace = (): string => {
  const path = mkdtempSync(join(tmpdir(), 'luma-rpc-'));
  roots.push(path);
  return path;
};
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('RpcRouter setScheduleEnabled', () => {
  it('adds a schedule via core, toggles it disabled, and reflects the change in the snapshot', async () => {
    const root = workspace();
    const service = new LumaApplicationService({ databasePath: join(root, 'luma.db') });
    const router = new RpcRouter(service, undefined);
    const schedule = service.addSchedule({
      prompt: 'Weekly review',
      projectId: null,
      enabled: true,
      timezone: 'UTC',
      nextRunAt: '2030-01-01T09:00:00.000Z',
      recurrenceMs: 604_800_000,
      missedRun: 'run',
    });

    const toggle = await router.dispatch('setScheduleEnabled', { id: schedule.id, enabled: false });
    expect(toggle).toEqual({ ok: true, result: null });

    const snapshot = (await router.dispatch('load', {})) as {
      ok: true;
      result: { schedules: Array<{ id: string; enabled: boolean }> };
    };
    expect(snapshot.result.schedules.find((item) => item.id === schedule.id)).toMatchObject({
      enabled: false,
    });

    service.close();
  });

  it('returns an error for an unknown schedule id', async () => {
    const root = workspace();
    const service = new LumaApplicationService({ databasePath: join(root, 'luma.db') });
    const router = new RpcRouter(service, undefined);

    const result = await router.dispatch('setScheduleEnabled', { id: 'missing', enabled: true });
    expect(result).toEqual({ ok: false, error: 'Scheduled task not found' });

    service.close();
  });
});

describe('RpcRouter recordSkillEdit', () => {
  it('accumulates edits as skill evidence and proposes a revision on the third', async () => {
    const root = workspace();
    const service = new LumaApplicationService({ databasePath: join(root, 'luma.db') });
    const router = new RpcRouter(service, undefined);
    service.createSkill({
      name: 'Reply',
      description: 'Customer reply',
      scope: 'global',
      projectId: null,
      instructions: 'Reply helpfully.',
      triggers: ['reply'],
      inputSchema: {},
      outputSchema: {},
      requiredTools: [],
      requiredPermissions: [],
      confirmationRequirements: [],
      examples: [],
      tests: [],
      status: 'trusted',
      createdBy: 'user',
    });
    const before =
      'I am deeply sorry and sincerely apologize for this unfortunate problem. Here is a long explanation with several unnecessary details about everything that happened.';
    const after = 'Here is the update.';

    let last: unknown;
    for (let index = 0; index < 3; index++)
      last = await router.dispatch('recordSkillEdit', { skillName: 'Reply', before, after });

    expect(last).toMatchObject({
      ok: true,
      result: expect.objectContaining({ status: 'proposed' }),
    });

    service.close();
  });
});
