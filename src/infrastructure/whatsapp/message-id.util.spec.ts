import { serializeMessageId } from './message-id.util';

describe('serializeMessageId', () => {
  it('prefers _serialized when whatsapp-web.js provides it', () => {
    expect(
      serializeMessageId({
        _serialized: 'true_573001234567@c.us_3EB0ABC123',
        fromMe: true,
        remote: '573001234567@c.us',
        id: '3EB0ABC123',
      }),
    ).toBe('true_573001234567@c.us_3EB0ABC123');
  });

  it('reads the minified key current WhatsApp Web builds use', () => {
    // Captured verbatim from a live session on 2026-08-18.
    expect(
      serializeMessageId({
        fromMe: true,
        remote: '11515360981145@lid',
        id: '3EB04D274BF3246377A7ED',
        self: 'out',
        $1: 'true_11515360981145@lid_3EB04D274BF3246377A7ED_out',
      }),
    ).toBe('true_11515360981145@lid_3EB04D274BF3246377A7ED_out');
  });

  it('rebuilds the id from its parts, keeping the self suffix', () => {
    expect(
      serializeMessageId({
        fromMe: true,
        remote: '11515360981145@lid',
        id: '3EB04D274BF3246377A7ED',
        self: 'out',
      }),
    ).toBe('true_11515360981145@lid_3EB04D274BF3246377A7ED_out');
  });

  it('rebuilds without a self suffix when there is none', () => {
    expect(
      serializeMessageId({
        fromMe: false,
        remote: '573001234567@c.us',
        id: '3EB0ABC123',
      }),
    ).toBe('false_573001234567@c.us_3EB0ABC123');
  });

  it('passes a string through untouched', () => {
    expect(serializeMessageId('true_x@c.us_ABC')).toBe('true_x@c.us_ABC');
  });

  it('returns an empty string when there is nothing usable', () => {
    expect(serializeMessageId(undefined)).toBe('');
    expect(serializeMessageId(null)).toBe('');
    expect(serializeMessageId({})).toBe('');
    expect(serializeMessageId({ fromMe: true })).toBe('');
  });
});
