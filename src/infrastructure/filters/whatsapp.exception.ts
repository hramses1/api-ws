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

  // A malformed id is the caller's mistake, not a missing resource.
  if (message.includes('invalid serialized')) {
    return new WhatsappException(
      `${context}: malformed message id. Use the id returned by the send endpoints, e.g. true_573001234567@c.us_3EB0ABC123_out.`,
      HttpStatus.BAD_REQUEST,
    );
  }

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

  // whatsapp-web.js lets minified errors from the page through: their message
  // is a single letter, useless to a caller. Report the operation instead.
  if (raw.length <= 2) {
    return new WhatsappException(
      `${context}: WhatsApp rejected the operation (no reason given).`,
      HttpStatus.CONFLICT,
    );
  }

  return new HttpException(
    `${context}: ${raw}`,
    HttpStatus.INTERNAL_SERVER_ERROR,
  );
}
