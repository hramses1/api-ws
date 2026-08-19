import { BadRequestException } from '@nestjs/common';
import { ChatHistoryService, ChatMessage } from './chat-history.service';

function msg(chatId: string, body: string): ChatMessage {
  return {
    id: `${chatId}-${body}`,
    chatId,
    from: chatId,
    to: 'me@c.us',
    body,
    fromMe: false,
    timestamp: 1719500000,
  };
}

describe('ChatHistoryService', () => {
  let service: ChatHistoryService;

  beforeEach(() => {
    service = new ChatHistoryService();
  });

  describe('getByChat', () => {
    it('rejects a missing chat id instead of crashing', () => {
      expect(() => service.getByChat(undefined as unknown as string)).toThrow(
        BadRequestException,
      );
      expect(() => service.getByChat('')).toThrow(BadRequestException);
      expect(() => service.getByChat('   ')).toThrow(BadRequestException);
    });

    it('appends @c.us to a plain phone number', () => {
      service.add(msg('573001234567@c.us', 'hola'));
      expect(service.getByChat('573001234567')).toHaveLength(1);
      expect(service.getByChat('+57 300 123 4567')).toHaveLength(1);
    });

    // Regression: ids that already carry a server suffix were getting @c.us
    // appended (`...@lid@c.us`), so they never matched a stored chat.
    it('looks up ids that already carry a server suffix as-is', () => {
      service.add(msg('40935350079535@lid', 'desde lid'));
      service.add(msg('120363000000000000@g.us', 'desde grupo'));

      expect(service.getByChat('40935350079535@lid')).toHaveLength(1);
      expect(service.getByChat('120363000000000000@g.us')).toHaveLength(1);
    });

    it('returns an empty list for an unknown chat', () => {
      expect(service.getByChat('573009999999')).toEqual([]);
    });
  });

  describe('linkAlias', () => {
    // WhatsApp's LID migration means incoming messages are keyed by `@lid`,
    // but callers only know the phone number.
    it('resolves a phone number to the @lid chat it belongs to', () => {
      service.add(msg('40935350079535@lid', 'desde lid'));
      service.linkAlias('593958652702@c.us', '40935350079535@lid');

      expect(service.getByChat('593958652702')).toHaveLength(1);
      expect(service.getByChat('593958652702@c.us')).toHaveLength(1);
    });

    it('never lets an alias shadow a real chat', () => {
      service.add(msg('593958652702@c.us', 'directo'));
      service.add(msg('40935350079535@lid', 'desde lid'));
      service.linkAlias('593958652702@c.us', '40935350079535@lid');

      expect(service.getByChat('593958652702')[0].body).toBe('directo');
    });

    it('ignores empty or self-referencing aliases', () => {
      service.add(msg('40935350079535@lid', 'desde lid'));
      service.linkAlias('', '40935350079535@lid');
      service.linkAlias('40935350079535@lid', '40935350079535@lid');

      expect(service.getByChat('40935350079535@lid')).toHaveLength(1);
    });
  });

  describe('getChats', () => {
    it('exposes the phone number behind a @lid chat when known', () => {
      service.add(msg('40935350079535@lid', 'desde lid'));
      service.linkAlias('593958652702@c.us', '40935350079535@lid');

      const [chat] = service.getChats();
      expect(chat.chatId).toBe('40935350079535@lid');
      expect(chat.phoneNumber).toBe('593958652702@c.us');
      expect(chat.count).toBe(1);
    });

    it('leaves phoneNumber undefined when there is no alias', () => {
      service.add(msg('573001234567@c.us', 'hola'));
      expect(service.getChats()[0].phoneNumber).toBeUndefined();
    });
  });
});
