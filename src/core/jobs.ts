import type { Job } from './types';

export interface JobStore {
  claim(workerId: string, leaseSeconds: number): Promise<Job | null>;
  succeed(jobId: string, result: unknown): Promise<void>;
  fail(jobId: string, error: string, retryAt?: Date): Promise<void>;
}

export type JobHandler = (job: Job) => Promise<unknown>;

export class JobRunner {
  constructor(private readonly store: JobStore, private readonly handlers: Record<string, JobHandler>) {}

  async runOne(workerId: string): Promise<'idle'|'succeeded'|'failed'> {
    const job = await this.store.claim(workerId, 120);
    if (!job) return 'idle';
    const handler = this.handlers[job.type];
    if (!handler) {
      await this.store.fail(job.id, `UNKNOWN_JOB_TYPE:${job.type}`);
      return 'failed';
    }
    try {
      const result = await handler(job);
      await this.store.succeed(job.id, result);
      return 'succeeded';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'UNKNOWN_JOB_ERROR';
      const retry = job.attempts + 1 < job.maxAttempts;
      const retryAt = retry ? new Date(Date.now() + Math.min(60_000 * 2 ** job.attempts, 30 * 60_000)) : undefined;
      await this.store.fail(job.id, message, retryAt);
      return 'failed';
    }
  }
}
