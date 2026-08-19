import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, Message } from 'whatsapp-web.js';
import { WwebService } from '../services/wweb.service';
import { ClientPool, mapWithConcurrency } from './client-pool';
import { resolveMedia, MediaSource } from './media.util';
import { toChatId } from '../utils/phone.util';
import {
  toWhatsappException,
  WhatsappException,
} from '../filters/whatsapp.exception';
import { BulkItemResult, BulkResult, MessageSummary } from './wweb.types';
import { serializeMessageId } from './message-id.util';

/** Everything that acts on a message: sending, editing, deleting, reacting. */
@Injectable()
export class MessageOps {
  private readonly logger = new Logger('MessageOps');
  private readonly bulkMaxRecipients: number;

  constructor(
    private readonly wweb: WwebService,
    private readonly pool: ClientPool,
    config: ConfigService,
  ) {
    this.bulkMaxRecipients = Number(
      config.get('WWEB_BULK_MAX_RECIPIENTS') ?? 50,
    );
  }

  async sendText(to: string, message: string): Promise<string> {
    const chatId = toChatId(to);
    return this.sendAndResolveId(chatId, message, (client) =>
      client.sendMessage(chatId, message),
    );
  }

  async sendMedia(
    to: string,
    source: MediaSource & { caption?: string },
  ): Promise<string> {
    const chatId = toChatId(to);
    const media = await resolveMedia(source);
    return this.sendAndResolveId(chatId, source.caption ?? '', (client) =>
      client.sendMessage(chatId, media, { caption: source.caption }),
    );
  }

  /**
   * Replies quoting an earlier message. quotedMessageId is the `_serialized`
   * id returned by the send endpoints and stored in chat history.
   */
  async reply(
    to: string,
    message: string,
    quotedMessageId: string,
  ): Promise<string> {
    const chatId = toChatId(to);
    return this.sendAndResolveId(chatId, message, (client) =>
      client.sendMessage(chatId, message, { quotedMessageId }),
    );
  }

  /**
   * Sends and returns the message id.
   *
   * Current WhatsApp Web builds make whatsapp-web.js resolve sendMessage to
   * undefined even though the message goes out, so when the returned model
   * carries no id we fall back to the `message_create` event, which does. The
   * waiter is registered before sending so a fast event cannot be missed.
   */
  private async sendAndResolveId(
    chatId: string,
    matchBody: string,
    send: (client: Client) => Promise<Message | undefined>,
  ): Promise<string> {
    const waiter = this.wweb.expectOutgoingId(matchBody);

    let sent: Message | undefined;
    try {
      sent = await this.wweb.withClient(send);
    } catch (error) {
      waiter.cancel();
      throw toWhatsappException(error, `Could not send message to ${chatId}`);
    }

    const direct = serializeMessageId(sent?.id);
    if (direct) {
      waiter.cancel();
      return direct;
    }

    const fromEvent = await waiter.promise;
    if (!fromEvent) {
      this.logger.warn(
        `Message to ${chatId} was sent but WhatsApp returned no id for it`,
      );
    }
    return fromEvent;
  }

  /**
   * Sends the same text to many recipients in parallel. A recipient that fails
   * (invalid number, unknown chat) is reported in place instead of aborting
   * the batch, and results keep the input order.
   */
  async sendBulk(
    recipients: string[],
    message: string,
    concurrency?: number,
  ): Promise<BulkResult> {
    return this.runBulk(recipients, concurrency, (chatId) =>
      this.sendText(chatId, message),
    );
  }

  /** Same contract as sendBulk, for media. */
  async sendMediaBulk(
    recipients: string[],
    source: MediaSource & { caption?: string },
    concurrency?: number,
  ): Promise<BulkResult> {
    return this.runBulk(recipients, concurrency, (chatId) =>
      this.sendMedia(chatId, source),
    );
  }

  private async runBulk(
    recipients: string[],
    concurrency: number | undefined,
    send: (chatId: string) => Promise<string>,
  ): Promise<BulkResult> {
    if (recipients.length > this.bulkMaxRecipients) {
      throw WhatsappException.conflict(
        `Too many recipients (${recipients.length}). Max is ${this.bulkMaxRecipients}.`,
      );
    }

    // Normalize first so duplicates written in different formats collapse, and
    // an invalid entry is reported without ever reaching the browser.
    const targets = dedupe(
      recipients.map((raw) => {
        try {
          return { raw, chatId: toChatId(raw) };
        } catch (error) {
          return {
            raw,
            chatId: raw,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );

    const limit = Math.max(
      1,
      Math.min(concurrency ?? this.pool.limit, this.pool.limit),
    );

    const settled = await mapWithConcurrency(targets, limit, async (target) => {
      if (target.error) {
        throw new Error(target.error);
      }
      return send(target.chatId);
    });

    const results: BulkItemResult[] = settled.map((outcome, index) => {
      const to = targets[index].chatId;
      if (outcome.ok) {
        return { to, status: 'sent', messageId: outcome.value };
      }
      const error = outcome.error;
      return {
        to,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    });

    const sent = results.filter((r) => r.status === 'sent').length;
    this.logger.log(`📤 Bulk: ${sent}/${results.length} sent (limit ${limit})`);

    return {
      total: results.length,
      sent,
      failed: results.length - sent,
      results,
    };
  }

  async getMessage(messageId: string): Promise<MessageSummary> {
    const message = await this.fetch(messageId);
    return toSummary(message);
  }

  /**
   * Deletes a message. `everyone` revokes it for all participants — WhatsApp
   * only allows that for your own messages within its time window (group
   * admins may also revoke others'), so a rejection surfaces as 409.
   */
  async deleteMessage(
    messageId: string,
    everyone: boolean,
    clearMedia: boolean,
  ): Promise<void> {
    const message = await this.fetch(messageId);

    if (everyone && !message.fromMe) {
      this.logger.warn(
        `Revoking a message that is not ours (${messageId}); requires group admin`,
      );
    }

    try {
      await this.wweb.withClient(() => message.delete(everyone, clearMedia));
    } catch (error) {
      throw toWhatsappException(
        error,
        everyone
          ? 'Could not delete for everyone (only your own messages, within the time window WhatsApp allows)'
          : 'Could not delete message',
      );
    }
  }

  async editMessage(messageId: string, content: string): Promise<void> {
    const message = await this.fetch(messageId);
    try {
      await this.wweb.withClient(() => message.edit(content));
    } catch (error) {
      // whatsapp-web.js dereferences the result of its injected editMessage
      // helper, which current WhatsApp Web builds resolve to undefined even
      // when the edit lands. Check the stored message before calling it a
      // failure — otherwise a successful edit reports an error.
      if (await this.bodyMatches(messageId, content)) {
        return;
      }
      throw toWhatsappException(
        error,
        'Could not edit message (only your own, within the time window WhatsApp allows)',
      );
    }
  }

  private async bodyMatches(
    messageId: string,
    expected: string,
  ): Promise<boolean> {
    try {
      const current = await this.fetch(messageId);
      return current.body === expected;
    } catch {
      return false;
    }
  }

  /** An empty reaction removes the existing one. */
  async react(messageId: string, reaction: string): Promise<void> {
    const message = await this.fetch(messageId);
    try {
      await this.wweb.withClient(() => message.react(reaction));
    } catch (error) {
      throw toWhatsappException(error, 'Could not react to message');
    }
  }

  async forward(messageId: string, to: string): Promise<void> {
    const message = await this.fetch(messageId);
    const chatId = toChatId(to);
    try {
      await this.wweb.withClient(() => message.forward(chatId));
    } catch (error) {
      throw toWhatsappException(
        error,
        `Could not forward message to ${chatId}`,
      );
    }
  }

  async star(messageId: string, starred: boolean): Promise<void> {
    const message = await this.fetch(messageId);
    try {
      await this.wweb.withClient(() =>
        starred ? message.star() : message.unstar(),
      );
    } catch (error) {
      throw toWhatsappException(error, 'Could not star message');
    }
  }

  /** durationSeconds is ignored when unpinning. */
  async pin(
    messageId: string,
    pinned: boolean,
    durationSeconds: number,
  ): Promise<boolean> {
    const message = await this.fetch(messageId);
    try {
      return await this.wweb.withClient(() =>
        pinned ? message.pin(durationSeconds) : message.unpin(),
      );
    } catch (error) {
      throw toWhatsappException(error, 'Could not pin message');
    }
  }

  /**
   * getMessageById only resolves while the message is still in WhatsApp Web's
   * cache; anything older reads as not found.
   */
  private async fetch(messageId: string): Promise<Message> {
    let message: Message | null = null;
    try {
      message = await this.wweb.withClient((client) =>
        client.getMessageById(messageId),
      );
    } catch (error) {
      throw toWhatsappException(error, `Message ${messageId}`);
    }

    if (!message) {
      throw WhatsappException.notFound(`Message ${messageId}`);
    }
    return hydrateId(message);
  }
}

function dedupe<T extends { chatId: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.chatId)) {
      return false;
    }
    seen.add(item.chatId);
    return true;
  });
}

/**
 * whatsapp-web.js sends `message.id._serialized` into the browser for delete,
 * edit, star, pin, forward and react. Current WhatsApp Web builds do not set
 * that property (the value arrives under a minified key), so the library
 * shipped `undefined` into the page and every one of those calls failed with a
 * minified error — react even reported success while doing nothing. Filling
 * the property in makes the library work unmodified.
 */
function hydrateId(message: Message): Message {
  const id = message.id as unknown as { _serialized?: string } | undefined;
  if (!id) {
    return message;
  }

  const serialized = serializeMessageId(message.id);
  if (serialized && !id._serialized) {
    id._serialized = serialized;
  }
  return message;
}

function toSummary(message: Message): MessageSummary {
  return {
    id: serializeMessageId(message.id),
    chatId: message.fromMe ? message.to : message.from,
    from: message.from,
    to: message.to,
    body: message.body,
    fromMe: message.fromMe,
    timestamp: message.timestamp,
    hasMedia: message.hasMedia,
    type: message.type,
    isStarred: message.isStarred,
    isForwarded: message.isForwarded,
  };
}
