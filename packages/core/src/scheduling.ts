import { id, now } from './types.js';
export type Schedule = {
  id: string;
  prompt: string;
  projectId: string | null;
  enabled: boolean;
  timezone: string;
  nextRunAt: string;
  recurrenceMs: number | null;
  retryCount: number;
  missedRun: 'run' | 'skip';
  history: Array<{ at: string; status: 'success' | 'failed' | 'skipped'; error?: string }>;
};
export class Scheduler {
  readonly tasks = new Map<string, Schedule>();
  add(input: Omit<Schedule, 'id' | 'history'>): Schedule {
    Intl.DateTimeFormat(undefined, { timeZone: input.timezone }).format();
    const task = { ...input, id: id(), history: [] };
    this.tasks.set(task.id, task);
    return task;
  }
  async runDue(run: (task: Schedule) => Promise<void>, at = new Date()): Promise<void> {
    for (const task of this.tasks.values())
      if (task.enabled && new Date(task.nextRunAt) <= at) {
        if (task.missedRun === 'skip' && at.getTime() - Date.parse(task.nextRunAt) > 86_400_000)
          task.history.push({ at: now(), status: 'skipped' });
        else
          try {
            await run(task);
            task.history.push({ at: now(), status: 'success' });
            task.retryCount = 0;
          } catch (error) {
            task.history.push({
              at: now(),
              status: 'failed',
              error: error instanceof Error ? error.message : 'Unknown error',
            });
            task.retryCount++;
          }
        if (task.recurrenceMs)
          task.nextRunAt = new Date(at.getTime() + task.recurrenceMs).toISOString();
        else task.enabled = false;
      }
  }
}
