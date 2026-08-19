import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  it('lets a real environment variable win over a blank .env entry', () => {
    // The security case: .env ships `API_KEY=` and the deployment exports the
    // real key. Reading the blank one would silently disable authentication.
    process.env.API_KEY = 'a-strong-key-value-123';

    const result = validateEnv({ API_KEY: '' });

    expect(result.API_KEY).toBe('a-strong-key-value-123');
  });

  it('keeps the .env value when the environment has none', () => {
    delete process.env.API_KEY;

    const result = validateEnv({ API_KEY: 'from-dotenv-file-1234' });

    expect(result.API_KEY).toBe('from-dotenv-file-1234');
  });

  it('applies defaults for the tuning settings', () => {
    delete process.env.WWEB_MAX_CONCURRENCY;
    delete process.env.THROTTLE_LIMIT;

    const result = validateEnv({});

    expect(result.WWEB_MAX_CONCURRENCY).toBe('5');
    expect(result.WWEB_OP_TIMEOUT_MS).toBe('30000');
    expect(result.WWEB_BULK_MAX_RECIPIENTS).toBe('50');
    expect(result.THROTTLE_TTL).toBe('60000');
    expect(result.THROTTLE_LIMIT).toBe('30');
  });

  it('rejects an out-of-range concurrency', () => {
    delete process.env.WWEB_MAX_CONCURRENCY;

    expect(() => validateEnv({ WWEB_MAX_CONCURRENCY: '99' })).toThrow(
      /WWEB_MAX_CONCURRENCY/,
    );
  });

  it('rejects an invalid port', () => {
    delete process.env.PORT;

    expect(() => validateEnv({ PORT: '0' })).toThrow(/PORT/);
  });

  it('rejects a webhook url without a scheme', () => {
    delete process.env.WEBHOOK_URL;

    expect(() => validateEnv({ WEBHOOK_URL: 'example.com/hook' })).toThrow(
      /WEBHOOK_URL/,
    );
  });
});
