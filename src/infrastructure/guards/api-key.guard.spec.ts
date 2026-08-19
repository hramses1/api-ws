import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ApiKeyGuard } from './api-key.guard';

function contextWith(header?: string): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({ header: () => header }),
    }),
  } as unknown as ExecutionContext;
}

function guardWith(configured: string | undefined): ApiKeyGuard {
  const config = { get: () => configured } as unknown as ConfigService;
  const reflector = {
    getAllAndOverride: () => false,
  } as unknown as Reflector;
  return new ApiKeyGuard(config, reflector);
}

describe('ApiKeyGuard', () => {
  const saved = process.env.API_KEY;

  afterEach(() => {
    if (saved === undefined) {
      delete process.env.API_KEY;
    } else {
      process.env.API_KEY = saved;
    }
  });

  it('enforces the environment key even when .env resolves to blank', () => {
    // Regression: a blank `API_KEY=` in .env used to win, silently leaving
    // every endpoint open while the real key sat in the environment.
    process.env.API_KEY = 'environment-key-1234';
    const guard = guardWith('');

    expect(() => guard.canActivate(contextWith(undefined))).toThrow(
      UnauthorizedException,
    );
    expect(guard.canActivate(contextWith('environment-key-1234'))).toBe(true);
  });

  it('falls back to the configured key when the environment has none', () => {
    delete process.env.API_KEY;
    const guard = guardWith('dotenv-key-1234');

    expect(() => guard.canActivate(contextWith('wrong'))).toThrow(
      UnauthorizedException,
    );
    expect(guard.canActivate(contextWith('dotenv-key-1234'))).toBe(true);
  });

  it('stays open when no key is configured anywhere (dev mode)', () => {
    delete process.env.API_KEY;
    const guard = guardWith(undefined);

    expect(guard.canActivate(contextWith(undefined))).toBe(true);
  });

  it('rejects a key of a different length without leaking timing', () => {
    process.env.API_KEY = 'environment-key-1234';
    const guard = guardWith('');

    expect(() => guard.canActivate(contextWith('short'))).toThrow(
      UnauthorizedException,
    );
  });
});
