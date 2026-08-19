import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { ChatMessage } from './chat-history.service';

/**
 * Forwards incoming WhatsApp messages to a configured HTTP webhook.
 * Set WEBHOOK_URL to enable. If WEBHOOK_SECRET is set, the payload is signed
 * with HMAC-SHA256 and sent in the `x-webhook-signature` header so the
 * receiver can verify authenticity.
 *
 * No-op when WEBHOOK_URL is unset, so existing setups are unaffected.
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger('WebhookService');
  private readonly url?: string;
  private readonly secret?: string;

  constructor(config: ConfigService) {
    this.url = config.get<string>('WEBHOOK_URL');
    this.secret = config.get<string>('WEBHOOK_SECRET');
    if (this.url) {
      this.logger.log(`🔔 Webhook enabled → ${this.url}`);
    }
  }

  get enabled(): boolean {
    return Boolean(this.url);
  }

  /** Fire-and-forget POST of an incoming message. Never throws. */
  notify(message: ChatMessage): void {
    if (!this.url) {
      return;
    }

    const body = JSON.stringify({ event: 'message', data: message });
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (this.secret) {
      headers['x-webhook-signature'] = createHmac('sha256', this.secret)
        .update(body)
        .digest('hex');
    }

    void this.post(this.url, body, headers);
  }

  private async post(
    url: string,
    body: string,
    headers: Record<string, string>,
  ): Promise<void> {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        this.logger.warn(`Webhook responded ${res.status}`);
      }
    } catch (err) {
      this.logger.warn(`Webhook delivery failed: ${(err as Error).message}`);
    }
  }
}
