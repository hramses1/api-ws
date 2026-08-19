import { ConfigService } from '@nestjs/config';
import { ClientPool, mapWithConcurrency } from './client-pool';

/** Minimal ConfigService stand-in, so the pool can be built with fixed values. */
function poolWith(values: Record<string, string | number>): ClientPool {
  const config = {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
  return new ClientPool(config);
}

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe('ClientPool', () => {
  it('never runs more operations than the configured limit', async () => {
    const pool = poolWith({
      WWEB_MAX_CONCURRENCY: 2,
      WWEB_OP_TIMEOUT_MS: 5000,
    });
    let running = 0;
    let peak = 0;

    const task = async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 10));
      running -= 1;
    };

    await Promise.all(Array.from({ length: 6 }, () => pool.run(task)));

    expect(peak).toBe(2);
  });

  it('queues over the limit and drains in FIFO order', async () => {
    const pool = poolWith({
      WWEB_MAX_CONCURRENCY: 1,
      WWEB_OP_TIMEOUT_MS: 5000,
    });
    const first = deferred();
    const order: number[] = [];

    const inFlight = pool.run(async () => {
      order.push(0);
      await first.promise;
    });
    const second = pool.run(() => {
      order.push(1);
      return Promise.resolve();
    });
    const third = pool.run(() => {
      order.push(2);
      return Promise.resolve();
    });

    expect(pool.getStats().queued).toBe(2);

    first.resolve();
    await Promise.all([inFlight, second, third]);

    expect(order).toEqual([0, 1, 2]);
    expect(pool.getStats()).toEqual({ inFlight: 0, queued: 0, limit: 1 });
  });

  it('releases the slot when the operation throws', async () => {
    const pool = poolWith({
      WWEB_MAX_CONCURRENCY: 1,
      WWEB_OP_TIMEOUT_MS: 5000,
    });

    await expect(
      pool.run(() => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');

    expect(pool.getStats().inFlight).toBe(0);
    await expect(pool.run(() => Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('rejects with 504 on timeout and frees the slot', async () => {
    const pool = poolWith({ WWEB_MAX_CONCURRENCY: 1, WWEB_OP_TIMEOUT_MS: 20 });

    await expect(
      pool.run(() => new Promise((r) => setTimeout(r, 200))),
    ).rejects.toMatchObject({ status: 504 });

    expect(pool.getStats().inFlight).toBe(0);
  });
});

describe('mapWithConcurrency', () => {
  it('keeps the output aligned with the input order', async () => {
    const result = await mapWithConcurrency([30, 10, 20], 3, async (ms) => {
      await new Promise((r) => setTimeout(r, ms));
      return ms;
    });

    expect(result).toEqual([
      { ok: true, value: 30 },
      { ok: true, value: 10 },
      { ok: true, value: 20 },
    ]);
  });

  it('reports a failure in place without aborting the rest', async () => {
    const result = await mapWithConcurrency([1, 2, 3], 2, (n) => {
      if (n === 2) {
        return Promise.reject(new Error('nope'));
      }
      return Promise.resolve(n);
    });

    expect(result[0]).toEqual({ ok: true, value: 1 });
    expect(result[1]).toMatchObject({ ok: false });
    expect(result[2]).toEqual({ ok: true, value: 3 });
  });

  it('honours the concurrency limit', async () => {
    let running = 0;
    let peak = 0;

    await mapWithConcurrency(Array.from({ length: 8 }), 3, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running -= 1;
    });

    expect(peak).toBe(3);
  });
});
