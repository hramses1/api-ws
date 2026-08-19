import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { timingSafeEqual } from 'crypto';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Global guard: every route requires the API key (`x-api-key` header) unless
 * marked with @Public(). If API_KEY env is unset the guard stays open (dev
 * mode) and warns once.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger('ApiKeyGuard');
  private warned = false;

  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const expected = this.config.get<string>('API_KEY');

    if (!expected) {
      if (!this.warned) {
        this.logger.warn(
          '⚠️ API_KEY not set — protected endpoints are UNPROTECTED. Set API_KEY in .env for production.',
        );
        this.warned = true;
      }
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.header('x-api-key') ?? '';

    if (!this.safeEqual(provided, expected)) {
      throw new UnauthorizedException('Invalid or missing x-api-key header');
    }

    return true;
  }

  /** Constant-time comparison to avoid leaking the key via timing. */
  private safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }
}
