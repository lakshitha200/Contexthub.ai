import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

/** pg's own default is 10. Tune with DB_POOL_MAX if the server allows more. */
const DEFAULT_POOL_MAX = 10;

/**
 * How long a transaction may wait for a free connection before giving up.
 *
 * Prisma's default is 2s, which is too tight for a managed Postgres over the
 * public internet: a single request here can hold connections for hundreds of
 * milliseconds at a time, so a short burst of traffic starves the pool and
 * transactions fail with "Unable to start a transaction in the given time"
 * while the database itself is perfectly healthy. Waiting is the right answer,
 * because the alternative is losing an answer the provider was already paid for.
 */
const TRANSACTION_MAX_WAIT_MS = 10_000;
const TRANSACTION_TIMEOUT_MS = 20_000;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
        max: Number(process.env.DB_POOL_MAX ?? DEFAULT_POOL_MAX),
        // Drop idle connections rather than holding them against the server's
        // own cap, which on hosted tiers is small and shared.
        idleTimeoutMillis: 30_000,
        // Fail a genuinely unreachable database quickly instead of hanging a
        // request until the client times out.
        connectionTimeoutMillis: 10_000,
      }),
      transactionOptions: {
        maxWait: TRANSACTION_MAX_WAIT_MS,
        timeout: TRANSACTION_TIMEOUT_MS,
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
