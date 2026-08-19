import { GatewayTimeoutException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Bounded concurrency gate for every call that reaches puppeteer.
 *
 * Each whatsapp-web.js call ends up in `pupPage.evaluate()`. Without a limit,
 * a burst of requests saturates the Chrome renderer, piles up timeouts and can
 * take the session down. This pool serves two purposes: it lets independent
 * operations (e.g. a bulk send) run genuinely in parallel, and it caps how many
 * hit the browser at once.
 */
@Injectable()
export class ClientPool {
  private readonly logger = new Logger('ClientPool');
  private readonly maxConcurrency: number;
  private readonly timeoutMs: number;

  private inFlight = 0;
  /** Waiters, drained FIFO as slots free up. */
  private readonly queue: Array<() => void> = [];

  constructor(config: ConfigService) {
    this.maxConcurrency = Number(config.get('WWEB_MAX_CONCURRENCY') ?? 5);
    this.timeoutMs = Number(config.get('WWEB_OP_TIMEOUT_MS') ?? 30000);
  }

  get limit(): number {
    return this.maxConcurrency;
  }

  getStats(): { inFlight: number; queued: number; limit: number } {
    return {
      inFlight: this.inFlight,
      queued: this.queue.length,
      limit: this.maxConcurrency,
    };
  }

  /**
   * Runs `fn` once a slot is free, rejecting with 504 if it outlives the
   * configured timeout. The slot is always released, including on throw or
   * timeout.
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await this.withTimeout(fn());
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.inFlight < this.maxConcurrency) {
      this.inFlight += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.inFlight += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.inFlight -= 1;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }

  /**
   * A timed-out operation keeps running inside the browser — we cannot cancel
   * it — so its rejection is swallowed to avoid an unhandled rejection, and its
   * slot is freed rather than held hostage by a hung page.
   */
  private withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout;

    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        this.logger.warn(`⏱️ Operation exceeded ${this.timeoutMs}ms`);
        reject(
          new GatewayTimeoutException(
            `WhatsApp operation timed out after ${this.timeoutMs}ms`,
          ),
        );
      }, this.timeoutMs);
    });

    promise.catch(() => undefined);

    return Promise.race([promise, timeout]).finally(() =>
      clearTimeout(timer),
    ) as Promise<T>;
  }
}

/**
 * Maps `items` through `fn` with at most `limit` running at once, keeping the
 * output aligned with the input order. Never rejects: each entry resolves to
 * the settled result so one failure cannot abort the batch.
 */
export async function mapWithConcurrency<TIn, TOut>(
  items: TIn[],
  limit: number,
  fn: (item: TIn, index: number) => Promise<TOut>,
): Promise<Array<{ ok: true; value: TOut } | { ok: false; error: unknown }>> {
  const results = new Array<
    { ok: true; value: TOut } | { ok: false; error: unknown }
  >(items.length);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = { ok: true, value: await fn(items[index], index) };
      } catch (error) {
        results[index] = { ok: false, error };
      }
    }
  };

  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    () => worker(),
  );
  await Promise.all(workers);

  return results;
}
