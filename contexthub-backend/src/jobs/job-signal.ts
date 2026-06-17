import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';

/**
 * In-process "doorbell". Lets `enqueue()` tap the worker on the shoulder the
 * instant a job exists, instead of the worker polling the DB on a timer —
 * zero database operations while idle.
 *
 * Single-instance only. For multiple app instances, swap this for Postgres
 * LISTEN/NOTIFY so every instance hears the signal.
 */
@Injectable()
export class JobSignal extends EventEmitter {
  static readonly EVENT = 'job';

  notify(): void {
    this.emit(JobSignal.EVENT);
  }
}
