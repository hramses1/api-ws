import { Logger } from '@nestjs/common';

/**
 * Lightweight env validation run at boot (no Joi dependency).
 * Fails fast on clearly-wrong values; warns on weak-but-usable config.
 */
export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const logger = new Logger('Config');

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
