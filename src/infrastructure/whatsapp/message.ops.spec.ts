import { ConfigService } from '@nestjs/config';
import { ClientPool } from './client-pool';
import { MessageOps } from './message.ops';
import { WwebService } from '../services/wweb.service';

/**
 * Exercises the bulk aggregator against a fake client: sending itself is the
 * library's job, what matters here is ordering, deduplication and partial
 * failure handling.
 */
function build(sendMessage: jest.Mock) {
  const config = {
    get: (key: string) =>
      ({
        WWEB_MAX_CONCURRENCY: 5,
        WWEB_OP_TIMEOUT_MS: 5000,
        WWEB_BULK_MAX_RECIPIENTS: 3,
      })[key],
  } as unknown as ConfigService;

  const pool = new ClientPool(config);
  const wweb = {
    withClient: <T>(fn: (client: unknown) => Promise<T>) =>
      pool.run(() => fn({ sendMessage })),
  } as unknown as WwebService;

  return new MessageOps(wweb, pool, config);
}

describe('MessageOps.sendBulk', () => {
  it('sends to every recipient and reports each one', async () => {
    const sendMessage = jest.fn((chatId: string) =>
      Promise.resolve({ id: { _serialized: `msg_${chatId}` } }),
    );
    const ops = build(sendMessage);

    const result = await ops.sendBulk(['573001111111', '573002222222'], 'hola');

    expect(result).toEqual({
      total: 2,
      sent: 2,
      failed: 0,
      results: [
        {
          to: '573001111111@c.us',
          status: 'sent',
          messageId: 'msg_573001111111@c.us',
        },
        {
          to: '573002222222@c.us',
          status: 'sent',
          messageId: 'msg_573002222222@c.us',
        },
      ],
    });
  });

  it('keeps going when a recipient fails, and preserves the input order', async () => {
    const sendMessage = jest.fn((chatId: string) =>
      chatId.startsWith('573002')
        ? Promise.reject(new Error('Chat not found'))
        : Promise.resolve({ id: { _serialized: 'ok' } }),
    );
    const ops = build(sendMessage);

    const result = await ops.sendBulk(
      ['573001111111', '573002222222', '573003333333'],
      'hola',
    );

    expect(result.sent).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.results.map((r) => r.status)).toEqual([
      'sent',
      'failed',
      'sent',
    ]);
    expect(result.results[1].error).toContain('Chat not found');
  });

  it('reports an invalid number without ever reaching the client', async () => {
    const sendMessage = jest.fn(() =>
      Promise.resolve({ id: { _serialized: 'ok' } }),
    );
    const ops = build(sendMessage);

    const result = await ops.sendBulk(['573001111111', '123'], 'hola');

    expect(result.failed).toBe(1);
    expect(result.results[1].error).toContain('Invalid phone number');
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('collapses duplicates written in different formats', async () => {
    const sendMessage = jest.fn(() =>
      Promise.resolve({ id: { _serialized: 'ok' } }),
    );
    const ops = build(sendMessage);

    const result = await ops.sendBulk(
      ['573001111111', '+57 300 111 1111', '573001111111@c.us'],
      'hola',
    );

    expect(result.total).toBe(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('rejects a batch over the configured maximum', async () => {
    const ops = build(jest.fn());

    await expect(
      ops.sendBulk(
        ['573001111111', '573002222222', '573003333333', '573004444444'],
        'hola',
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
});
