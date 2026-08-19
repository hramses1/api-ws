import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Message } from 'whatsapp-web.js';
import { WwebService } from '../services/wweb.service';
import { ClientPool, mapWithConcurrency } from './client-pool';
import { resolveMedia, MediaSource } from './media.util';
import { toChatId } from '../utils/phone.util';
import {
  toWhatsappException,
  WhatsappException,
} from '../filters/whatsapp.exception';
import { BulkItemResult, BulkResult, MessageSummary } from './wweb.types';

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
    try {
      return await this.wweb.withClient(async (client) => {
        const sent = await client.sendMessage(chatId, message);
        return sent.id?._serialized ?? '';
      });
    } catch (error) {
      throw toWhatsappException(error, `Could not send message to ${chatId}`);
    }
  }

  async sendMedia(
    to: string,
    source: MediaSource & { caption?: string },
  ): Promise<string> {
    const chatId = toChatId(to);
    const media = await resolveMedia(source);
    try {
      return await this.wweb.withClient(async (client) => {
        const sent = await client.sendMessage(chatId, media, {
          caption: source.caption,
        });
        return sent.id?._serialized ?? '';
      });
    } catch (error) {
      throw toWhatsappException(error, `Could not send media to ${chatId}`);
    }
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
    try {
      return await this.wweb.withClient(async (client) => {
        const sent = await client.sendMessage(chatId, message, {
          quotedMessageId,
        });
        return sent.id?._serialized ?? '';
      });
    } catch (error) {
      throw toWhatsappException(error, `Could not reply in ${chatId}`);
    }
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
      throw toWhatsappException(
        error,
        'Could not edit message (only your own, within the time window WhatsApp allows)',
      );
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
    return message;
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

function toSummary(message: Message): MessageSummary {
  return {
    id: message.id?._serialized ?? '',
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
