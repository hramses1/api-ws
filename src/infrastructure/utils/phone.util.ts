import { BadRequestException } from '@nestjs/common';

/** The kinds of chat id WhatsApp uses, keyed by their suffix. */
export type ChatIdKind = 'user' | 'group' | 'lid' | 'newsletter';

const SUFFIX_BY_KIND: Record<ChatIdKind, string> = {
  user: '@c.us',
  group: '@g.us',
  lid: '@lid',
  newsletter: '@newsletter',
};

const DEFAULT_ALLOWED: ChatIdKind[] = ['user', 'group', 'lid'];

/**
 * Normalizes a phone number into a WhatsApp chat id (`<digits>@c.us`).
 * Strips spaces, +, dashes and parentheses. Throws BadRequestException (→ 400)
 * on invalid input.
 */
export function toWhatsappId(input: string): string {
  if (input.endsWith('@c.us') || input.endsWith('@g.us')) {
    return input;
  }

  const digits = input.replace(/\D/g, '');

  if (digits.length < 8 || digits.length > 15) {
    throw new BadRequestException(
      `Invalid phone number "${input}". Use international format, e.g. 573001234567.`,
    );
  }

  return `${digits}@c.us`;
}

/**
 * Normalizes any input into a WhatsApp chat id, accepting either a phone
 * number or an already-formed id (`@c.us`, `@g.us`, `@lid`, `@newsletter`).
 *
 * `allow` restricts which kinds are acceptable, so a group endpoint given a
 * phone number fails with a 400 instead of an opaque puppeteer error. A bare
 * phone number only resolves when 'user' is allowed.
 */
export function toChatId(
  input: string,
  options: { allow?: ChatIdKind[] } = {},
): string {
  const allow = options.allow ?? DEFAULT_ALLOWED;
  const value = input?.trim();

  if (!value) {
    throw new BadRequestException('Chat id is required.');
  }

  const kind = (Object.keys(SUFFIX_BY_KIND) as ChatIdKind[]).find((k) =>
    value.endsWith(SUFFIX_BY_KIND[k]),
  );

  if (kind) {
    if (!allow.includes(kind)) {
      throw new BadRequestException(
        `"${input}" is a ${kind} id, but this endpoint expects: ${allow.join(', ')}.`,
      );
    }
    return value;
  }

  if (!allow.includes('user')) {
    throw new BadRequestException(
      `"${input}" is not a valid id. This endpoint expects: ${allow
        .map((k) => SUFFIX_BY_KIND[k])
        .join(', ')}.`,
    );
  }

  return toWhatsappId(value);
}
