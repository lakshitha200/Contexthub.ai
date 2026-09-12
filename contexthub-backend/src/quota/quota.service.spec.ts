import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { QuotaExceededException } from './quota-exceeded.exception';
import { QuotaService } from './quota.service';

type Row = { tokens: number; calls: number } | null;

function makeService(overrides: Record<string, string> = {}, row: Row = null) {
  const config = {
    get: (key: string, fallback?: string) => overrides[key] ?? fallback,
  } as unknown as ConfigService;

  const upsert = jest.fn().mockResolvedValue(undefined);
  const findUnique = jest.fn().mockResolvedValue(row);
  const prisma = {
    usageCounter: { findUnique, upsert },
  } as unknown as PrismaService;

  return { service: new QuotaService(prisma, config), upsert, findUnique };
}

describe('QuotaService', () => {
  describe('summary()', () => {
    it('reports a fresh account as fully available', async () => {
      const { service } = makeService({ QUOTA_DAILY_TOKENS: '1000' });

      const summary = await service.summary('u1');

      expect(summary).toMatchObject({
        used: 0,
        limit: 1000,
        remaining: 1000,
        percentUsed: 0,
        allowed: true,
      });
    });

    it('reports partial usage', async () => {
      const { service } = makeService(
        { QUOTA_DAILY_TOKENS: '1000' },
        { tokens: 250, calls: 3 },
      );

      const summary = await service.summary('u1');

      expect(summary).toMatchObject({
        used: 250,
        remaining: 750,
        percentUsed: 25,
        calls: 3,
        allowed: true,
      });
    });

    it('never reports negative remaining when a call overshoots', async () => {
      // The last call of a window is allowed to exceed the limit, because a
      // call's true cost is only known once the provider has answered.
      const { service } = makeService(
        { QUOTA_DAILY_TOKENS: '1000' },
        { tokens: 1400, calls: 9 },
      );

      const summary = await service.summary('u1');

      expect(summary.remaining).toBe(0);
      expect(summary.percentUsed).toBe(100);
      expect(summary.allowed).toBe(false);
    });

    it('resets at the next UTC midnight', async () => {
      const { service } = makeService({ QUOTA_DAILY_TOKENS: '1000' });

      const summary = await service.summary(
        'u1',
        new Date('2026-09-11T13:45:00.000Z'),
      );

      expect(summary.resetsAt).toBe('2026-09-12T00:00:00.000Z');
    });
  });

  describe('assertWithinQuota()', () => {
    it('passes while the account has room', async () => {
      const { service } = makeService(
        { QUOTA_DAILY_TOKENS: '1000' },
        { tokens: 999, calls: 1 },
      );

      await expect(service.assertWithinQuota('u1')).resolves.toBeUndefined();
    });

    it('throws once the allowance is spent', async () => {
      const { service } = makeService(
        { QUOTA_DAILY_TOKENS: '1000' },
        { tokens: 1000, calls: 1 },
      );

      await expect(service.assertWithinQuota('u1')).rejects.toBeInstanceOf(
        QuotaExceededException,
      );
    });

    it('carries the numbers the client needs to explain itself', async () => {
      const { service } = makeService(
        { QUOTA_DAILY_TOKENS: '1000' },
        { tokens: 1200, calls: 4 },
      );

      await expect(service.assertWithinQuota('u1')).rejects.toMatchObject({
        details: { used: 1200, limit: 1000 },
      });
    });

    it('enforces nothing when quotas are switched off', async () => {
      const { service, findUnique } = makeService(
        { QUOTA_ENABLED: 'false', QUOTA_DAILY_TOKENS: '1' },
        { tokens: 99999, calls: 1 },
      );

      await expect(service.assertWithinQuota('u1')).resolves.toBeUndefined();
      expect(findUnique).not.toHaveBeenCalled();
    });
  });

  describe('record()', () => {
    it('increments rather than overwriting, so concurrent calls both count', async () => {
      const { service, upsert } = makeService();

      await service.record('u1', 120);

      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ tokens: 120, calls: 1 }),
          update: {
            tokens: { increment: 120 },
            calls: { increment: 1 },
          },
        }),
      );
    });

    it('ignores non-positive token counts', async () => {
      const { service, upsert } = makeService();

      await service.record('u1', 0);
      await service.record('u1', -5);

      expect(upsert).not.toHaveBeenCalled();
    });

    it('swallows write failures: work already done must not fail on accounting', async () => {
      const { service, upsert } = makeService();
      upsert.mockRejectedValueOnce(new Error('connection reset'));

      await expect(service.record('u1', 50)).resolves.toBeUndefined();
    });

    it('records nothing when quotas are switched off', async () => {
      const { service, upsert } = makeService({ QUOTA_ENABLED: 'false' });

      await service.record('u1', 500);

      expect(upsert).not.toHaveBeenCalled();
    });
  });
});
