import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobSignal } from '../jobs/job-signal';
import { ClaimedJob, JobService } from '../jobs/job.service';
import { IngestionService } from './ingestion.service';

const INGEST_JOB_TYPE = 'ingest';

/**
 * Event-driven worker — it does NOT poll the DB on a timer. It only queries the
 * database when there is actually work:
 *   - once at startup (to pick up jobs left PENDING from a previous run/crash)
 *   - whenever JobSignal fires (a new job was just enqueued)
 *
 * Result: zero DB operations while idle. Cost scales with documents, not time.
 */
@Injectable()
export class IngestionWorker implements OnApplicationBootstrap {
  private readonly logger = new Logger(IngestionWorker.name);
  private readonly maxAttempts: number;
  private draining = false;
  private wakeRequested = false;

  constructor(
    private readonly jobs: JobService,
    private readonly ingestion: IngestionService,
    private readonly signal: JobSignal,
    config: ConfigService,
  ) {
    this.maxAttempts = Number(config.get<string>('INGEST_MAX_ATTEMPTS', '3'));
  }

  onApplicationBootstrap(): void {
    // Wake whenever a job is enqueued.
    this.signal.on(JobSignal.EVENT, () => void this.drain());
    // Catch any jobs left PENDING from a previous run / crash.
    void this.drain();
  }

  /**
   * Process every currently PENDING job, then stop until the next signal.
   * `wakeRequested` closes the race where a job is enqueued in the instant
   * between the final empty claim and the loop exiting.
   */
  private async drain(): Promise<void> {
    if (this.draining) {
      this.wakeRequested = true;
      return;
    }
    this.draining = true;
    try {
      do {
        this.wakeRequested = false;
        let job: ClaimedJob | null;
        while ((job = await this.jobs.claimNext())) {
          await this.handle(job);
        }
      } while (this.wakeRequested);
    } catch (err) {
      // Never let an error kill the worker; the next signal wakes it again.
      this.logger.error(`Drain error: ${message(err)}`);
    } finally {
      this.draining = false;
    }
  }

  private async handle(job: ClaimedJob): Promise<void> {
    try {
      await this.dispatch(job);
      await this.jobs.markDone(job.id);
    } catch (err) {
      const msg = message(err);
      if (job.attempts >= this.maxAttempts) {
        await this.jobs.markFailed(job.id, msg);
        this.logger.error(
          `Job ${job.id} failed permanently after ${job.attempts} attempts: ${msg}`,
        );
      } else {
        await this.jobs.markForRetry(job.id, msg);
        this.logger.warn(
          `Job ${job.id} attempt ${job.attempts} failed, will retry: ${msg}`,
        );
        // Small backoff so a transient failure isn't re-claimed instantly.
        await delay(Math.min(job.attempts * 1000, 5000));
        this.wakeRequested = true; // ensure the retried job gets another pass
      }
    }
  }

  private async dispatch(job: ClaimedJob): Promise<void> {
    switch (job.type) {
      case INGEST_JOB_TYPE: {
        const documentId = (job.payload as { documentId?: string })?.documentId;
        if (!documentId) {
          throw new Error('ingest job payload missing documentId');
        }
        await this.ingestion.process(documentId);
        return;
      }
      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
