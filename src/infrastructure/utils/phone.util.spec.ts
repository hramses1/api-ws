import { toChatId, toWhatsappId } from './phone.util';

describe('toWhatsappId', () => {
  it('appends @c.us to a plain number', () => {
    expect(toWhatsappId('573001234567')).toBe('573001234567@c.us');
  });

  it('strips +, spaces, dashes and parentheses', () => {
    expect(toWhatsappId('+57 (300) 123-4567')).toBe('573001234567@c.us');
  });

  it('passes through existing chat ids', () => {
    expect(toWhatsappId('573001234567@c.us')).toBe('573001234567@c.us');
    expect(toWhatsappId('123456@g.us')).toBe('123456@g.us');
  });

  it('throws on too-short numbers', () => {
    expect(() => toWhatsappId('123')).toThrow(/Invalid phone number/);
  });

  it('throws on too-long numbers', () => {
    expect(() => toWhatsappId('1234567890123456')).toThrow(
      /Invalid phone number/,
    );
  });
});

describe('toChatId', () => {
  it('normalizes a phone number', () => {
    expect(toChatId('+57 300 123 4567')).toBe('573001234567@c.us');
  });

  it('passes through every supported id kind', () => {
    expect(toChatId('573001234567@c.us')).toBe('573001234567@c.us');
    expect(toChatId('120363000000000000@g.us')).toBe('120363000000000000@g.us');
    expect(toChatId('12345@lid')).toBe('12345@lid');
    expect(toChatId('12345@newsletter', { allow: ['newsletter'] })).toBe(
      '12345@newsletter',
    );
  });

  it('rejects a newsletter id by default', () => {
    expect(() => toChatId('12345@newsletter')).toThrow(/expects/);
  });

  it('rejects a phone number where only a group is allowed', () => {
    expect(() => toChatId('573001234567', { allow: ['group'] })).toThrow(
      /@g\.us/,
    );
  });

  it('rejects a user id where only a group is allowed', () => {
    expect(() => toChatId('573001234567@c.us', { allow: ['group'] })).toThrow(
      /is a user id/,
    );
  });

  it('rejects an empty input', () => {
    expect(() => toChatId('  ')).toThrow(/required/);
  });
});
