import { Logger } from '@nestjs/common';

/**
 * Lightweight env validation run at boot (no Joi dependency).
 * Fails fast on clearly-wrong values; warns on weak-but-usable config.
 */
/** Settings a real environment variable must always win over the .env file. */
const SETTINGS = [
  'PORT',
  'API_KEY',
  'WEBHOOK_URL',
  'WEBHOOK_SECRET',
  'WWEB_MAX_CONCURRENCY',
  'WWEB_OP_TIMEOUT_MS',
  'WWEB_BULK_MAX_RECIPIENTS',
  'THROTTLE_TTL',
  'THROTTLE_LIMIT',
] as const;

/**
 * A blank line in `.env` (e.g. the `API_KEY=` that ships in .env.example)
 * shadows the same variable exported in the real environment, so a deployment
 * that sets API_KEY through pm2/docker while keeping that file would read an
 * empty key — and the guard would fall back to its open dev mode, serving every
 * endpoint unauthenticated. The environment wins.
 */
function preferProcessEnv(config: Record<string, unknown>): void {
  for (const key of SETTINGS) {
    const fromEnvironment = process.env[key];
    if (fromEnvironment !== undefined && fromEnvironment !== '') {
      config[key] = fromEnvironment;
    }
  }
}

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const logger = new Logger('Config');

  preferProcessEnv(config);

  const rawPort = (config.PORT as string | undefined) ?? '3000';
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT "${rawPort}" — must be 1..65535.`);
  }

  const apiKey = config.API_KEY as string | undefined;
  if (apiKey && apiKey.length < 16) {
    logger.warn('⚠️ API_KEY is shorter than 16 chars — use a stronger key.');
  }

  const webhookUrl = config.WEBHOOK_URL as string | undefined;
  if (webhookUrl && !/^https?:\/\//.test(webhookUrl)) {
    throw new Error('WEBHOOK_URL must start with http:// or https://');
  }

  requireIntegerInRange(config, 'WWEB_MAX_CONCURRENCY', 5, 1, 20);
  requireIntegerInRange(config, 'WWEB_OP_TIMEOUT_MS', 30000, 1000, 120000);
  requireIntegerInRange(config, 'WWEB_BULK_MAX_RECIPIENTS', 50, 1, 100);
  requireIntegerInRange(config, 'THROTTLE_TTL', 60000, 1000, 600000);
  requireIntegerInRange(config, 'THROTTLE_LIMIT', 30, 1, 10000);

  return config;
}

/**
 * Fails fast on an out-of-range numeric setting. Absent values fall back to
 * the default, so the app still boots with an empty .env.
 */
function requireIntegerInRange(
  config: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number,
): void {
  const raw = config[key] as string | undefined;
  if (raw === undefined || raw === '') {
    config[key] = String(fallback);
    return;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(
      `Invalid ${key} "${raw}" — must be an integer ${min}..${max}.`,
    );
  }
}
