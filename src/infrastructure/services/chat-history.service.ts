import { BadRequestException, Injectable, Logger } from '@nestjs/common';

export interface ChatMessage {
  id: string;
  chatId: string;
  from: string;
  to: string;
  body: string;
  fromMe: boolean;
  timestamp: number;
  hasMedia?: boolean;
  type?: string;
}

/**
 * In-memory chat history store. Messages are grouped by chatId.
 * Note: history is lost on server restart.
 */
@Injectable()
export class ChatHistoryService {
  private readonly logger = new Logger('ChatHistoryService');
  private readonly history = new Map<string, ChatMessage[]>();
  /**
   * Alias id → real chatId. WhatsApp's LID migration means incoming messages
   * are keyed by `<lid>@lid`, while callers only know the phone number, so we
   * keep a `<digits>@c.us` → `<lid>@lid` index to make lookups by number work.
   */
  private readonly aliases = new Map<string, string>();
  private readonly maxPerChat = 500;

  add(message: ChatMessage): void {
    const list = this.history.get(message.chatId) ?? [];
    list.push(message);

    if (list.length > this.maxPerChat) {
      list.splice(0, list.length - this.maxPerChat);
    }

    this.history.set(message.chatId, list);
  }

  /** Records that `alias` (e.g. `593958652702@c.us`) points at `chatId`. */
  linkAlias(alias: string, chatId: string): void {
    if (!alias || !chatId || alias === chatId) {
      return;
    }
    this.aliases.set(alias, chatId);
  }

  getByChat(chatId: string): ChatMessage[] {
    return this.history.get(this.resolveKey(chatId)) ?? [];
  }

  getChats(): {
    chatId: string;
    phoneNumber?: string;
    lastMessage: ChatMessage;
    count: number;
  }[] {
    const phoneByChat = new Map<string, string>();
    for (const [alias, chatId] of this.aliases) {
      phoneByChat.set(chatId, alias);
    }

    return Array.from(this.history.entries()).map(([chatId, list]) => ({
      chatId,
      phoneNumber: phoneByChat.get(chatId),
      lastMessage: list[list.length - 1],
      count: list.length,
    }));
  }

  clear(): void {
    this.history.clear();
    this.aliases.clear();
    this.logger.log('Chat history cleared');
  }

  /**
   * Turns caller input into the key messages are stored under. Ids that already
   * carry a server suffix (`@c.us`, `@lid`, `@g.us`) are used as-is — appending
   * `@c.us` to them was what broke lookups of `@lid` chats. A real chat always
   * wins over an alias pointing elsewhere.
   */
  private resolveKey(input: string): string {
    if (typeof input !== 'string' || input.trim() === '') {
      throw new BadRequestException(
        'A chat id is required, e.g. ?cellPhone=573001234567.',
      );
    }

    const raw = input.trim();
    const key = raw.includes('@') ? raw : `${raw.replace(/\D/g, '')}@c.us`;

    if (this.history.has(key)) {
      return key;
    }

    return this.aliases.get(key) ?? key;
  }
}
