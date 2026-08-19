/**
 * WhatsApp Web ships the serialized message id under a minified property name
 * that changes between builds: whatsapp-web.js documents it as `_serialized`,
 * but current builds deliver it as `$1` (and the next one may pick another
 * letter). Reading only `_serialized` yields undefined, which is what made
 * every id-based endpoint unusable.
 *
 * A serialized id looks like:
 *   true_11515360981145@lid_3EB04D274BF3246377A7ED_out
 *   <fromMe>_<remote>_<id>[_<self>]
 *
 * The `_out` suffix matters: without it getMessageById answers 404.
 */

interface RawMessageId {
  _serialized?: unknown;
  fromMe?: unknown;
  remote?: unknown;
  id?: unknown;
  self?: unknown;
  [key: string]: unknown;
}

const SERIALIZED_PATTERN = /^(true|false)_.+_[^_]+/;

export function serializeMessageId(raw: unknown): string {
  if (typeof raw === 'string') {
    return raw;
  }
  if (!raw || typeof raw !== 'object') {
    return '';
  }

  const id = raw as RawMessageId;

  if (typeof id._serialized === 'string' && id._serialized) {
    return id._serialized;
  }

  // Any property already holding the serialized form, whatever it is called.
  for (const value of Object.values(id)) {
    if (typeof value === 'string' && SERIALIZED_PATTERN.test(value)) {
      return value;
    }
  }

  // Last resort: rebuild from the parts. Keep `self` — dropping it produces an
  // id WhatsApp does not recognise.
  const { fromMe, remote, id: local, self } = id;
  if (typeof remote !== 'string' || typeof local !== 'string') {
    return '';
  }

  const parts = [String(Boolean(fromMe)), remote, local];
  if (typeof self === 'string' && self) {
    parts.push(self);
  }
  return parts.join('_');
}

/**
 * Same problem, different object: chat/contact ids (Wids) also lose
 * `_serialized` on some builds. Rebuilds `<user>@<server>` when needed.
 */
export function serializeWid(raw: unknown): string {
  if (typeof raw === 'string') {
    return raw;
  }
  if (!raw || typeof raw !== 'object') {
    return '';
  }

  const wid = raw as Record<string, unknown>;

  if (typeof wid._serialized === 'string' && wid._serialized) {
    return wid._serialized;
  }

  for (const value of Object.values(wid)) {
    if (typeof value === 'string' && value.includes('@')) {
      return value;
    }
  }

  const { user, server, device } = wid;
  if (typeof user !== 'string' || typeof server !== 'string') {
    return '';
  }
  const suffix =
    typeof device === 'string' || typeof device === 'number'
      ? `:${device}`
      : '';
  return `${user}${suffix}@${server}`;
}
