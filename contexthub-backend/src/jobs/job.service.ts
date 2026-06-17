import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JobSignal } from './job-signal';

export type JobStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';

/** A job as returned by the atomic claim query. */
export interface ClaimedJob {
  id: string;
  type: string;
  payload: Prisma.JsonValue;
  attempts: number;
}

/**
 * Durable work queue over the generic `Job` table. Generic on purpose: the
 * `type` field decides what a worker does with it (today only 'ingest').
 * No Redis/BullMQ — Postgres + polling is enough at this scale and survives
 * restarts (work lives in the DB, not in memory).
 */
@Injectable()
export class JobService {
  private readonly logger = new Logger(JobService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly signal: JobSignal,
  ) {}

  /** Insert a PENDING job, then wake the worker (in-memory, no DB poll). */
  async enqueue(type: string, payload: Prisma.InputJsonValue): Promise<string> {
    const job = await this.prisma.job.create({
      data: { type, status: 'PENDING', payload },
      select: { id: true },
    });
    this.logger.log(`Enqueued job ${job.id} (${type})`);
    this.signal.notify();
    return job.id;
  }

  /**
   * Atomically claim the oldest PENDING job and mark it RUNNING.
   * `FOR UPDATE SKIP LOCKED` is the standard Postgres work-queue lock: if two
   * workers/instances poll at once, each grabs a different row — never the same.
   * `attempts` is incremented here so a hard crash mid-job still counts.
   */
  async claimNext(): Promise<ClaimedJob | null> {
    const rows = await this.prisma.$queryRaw<ClaimedJob[]>`
      UPDATE "Job"
         SET status = 'RUNNING', attempts = attempts + 1, "updatedAt" = now()
       WHERE id = (
         SELECT id FROM "Job"
          WHERE status = 'PENDING'
          ORDER BY "createdAt"
          FOR UPDATE SKIP LOCKED
          LIMIT 1
       )
      RETURNING id, type, payload, attempts;
    `;
    return rows[0] ?? null;
  }

  async markDone(id: string): Promise<void> {
    await this.prisma.job.update({
      where: { id },
      data: { status: 'DONE', errorMessage: null },
    });
  }

  /** Permanent failure — no more retries. */
  async markFailed(id: string, error: string): Promise<void> {
    await this.prisma.job.update({
      where: { id },
      data: { status: 'FAILED', errorMessage: truncate(error) },
    });
  }

  /** Transient failure — send back to the queue to be retried on a later poll. */
  async markForRetry(id: string, error: string): Promise<void> {
    await this.prisma.job.update({
      where: { id },
      data: { status: 'PENDING', errorMessage: truncate(error) },
    });
  }
}

function truncate(text: string, max = 1000): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
