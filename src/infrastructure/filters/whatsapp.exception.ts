import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Domain error for anything that fails inside whatsapp-web.js. Extends
 * HttpException, so AllExceptionsFilter renders it with the usual JSON shape
 * and no puppeteer stack ever reaches the caller.
 */
export class WhatsappException extends HttpException {
  constructor(message: string, status: HttpStatus) {
    super(message, status);
  }

  static notFound(what: string): WhatsappException {
    return new WhatsappException(`${what} not found`, HttpStatus.NOT_FOUND);
  }

  static forbidden(message: string): WhatsappException {
    return new WhatsappException(message, HttpStatus.FORBIDDEN);
  }

  static conflict(message: string): WhatsappException {
    return new WhatsappException(message, HttpStatus.CONFLICT);
  }

  static unavailable(message: string): WhatsappException {
    return new WhatsappException(message, HttpStatus.SERVICE_UNAVAILABLE);
  }
}

/**
 * Translates a raw library/puppeteer error into an HTTP-shaped one.
 * Already-typed HttpExceptions pass through untouched.
 *
 * whatsapp-web.js has no error codes: it throws plain evaluation errors whose
 * message is the only signal available, hence the string matching.
 */
export function toWhatsappException(
  error: unknown,
  context: string,
): HttpException {
  if (error instanceof HttpException) {
    return error;
  }

  const raw = error instanceof Error ? error.message : String(error);
  const message = raw.toLowerCase();

  if (
    message.includes('not found') ||
    message.includes('no such') ||
    message.includes('cannot read properties of undefined')
  ) {
    // Keep the library's wording: it is the only clue about what was missing.
    return new WhatsappException(`${context}: ${raw}`, HttpStatus.NOT_FOUND);
  }

  if (
    message.includes('not admin') ||
    message.includes('admin') ||
    message.includes('forbidden') ||
    message.includes('not authorized')
  ) {
    return WhatsappException.forbidden(
      `${context}: this action requires group admin permissions`,
    );
  }

  if (
    message.includes('already') ||
    message.includes('revoked') ||
    message.includes('expired')
  ) {
    return WhatsappException.conflict(`${context}: ${raw}`);
  }

  return new HttpException(
    `${context}: ${raw}`,
    HttpStatus.INTERNAL_SERVER_ERROR,
  );
}
