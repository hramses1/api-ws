import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Client, LocalAuth, Message } from 'whatsapp-web.js';
import * as QRCode from 'qrcode';
import { promises as fs } from 'fs';
import * as path from 'path';
import { ChatHistoryService } from './chat-history.service';
import { WebhookService } from './webhook.service';
import { ClientPool } from '../whatsapp/client-pool';
import { serializeMessageId } from '../whatsapp/message-id.util';

interface OutgoingWaiter {
  body: string;
  settle: (id: string) => void;
}

export type ConnectionStatus =
  | 'INITIALIZING'
  | 'QR_REQUIRED'
  | 'AUTHENTICATED'
  | 'READY'
  | 'DISCONNECTED'
  | 'AUTH_FAILURE';

@Injectable()
export class WwebService implements OnModuleInit, OnModuleDestroy {
  private client: Client;
  private logger = new Logger('WwebService');
  private status: ConnectionStatus = 'INITIALIZING';
  private lastQr: string | null = null;
  private lastQrPng: string | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  /** `@lid` chats already looked up, so we hit puppeteer once per contact. */
  private resolvedLids = new Set<string>();
  /** Callers waiting for the id of a message they just sent. */
  private outgoingWaiters: OutgoingWaiter[] = [];

  constructor(
    private readonly chatHistory: ChatHistoryService,
    private readonly webhook: WebhookService,
    private readonly pool: ClientPool,
  ) {}

  onModuleInit() {
    this.initClient();
  }

  private initClient() {
    // A new browser session invalidates the cached lookups.
    this.resolvedLids = new Set<string>();

    this.client = new Client({
      authStrategy: new LocalAuth(),
      puppeteer: {
        args: ['--no-sandbox'],
      },
    });

    this.registerEvents();

    this.client.initialize().catch((err) => {
      this.logger.error('❌ Failed to initialize WhatsApp client', err);
    });
  }

  private registerEvents(): void {
    this.client.on('qr', (qr) => {
      this.status = 'QR_REQUIRED';
      this.lastQr = qr;
      this.logger.log('👀🗿 QR ready. Refreshes every minute ⚡');
      void this.cacheQr(qr);
    });

    this.client.on('authenticated', () => {
      this.status = 'AUTHENTICATED';
      this.clearQr();
      this.logger.log('🔑 Authenticated');
    });

    this.client.on('ready', () => {
      this.status = 'READY';
      this.clearQr();
      this.logger.log('✅ WhatsApp client is ready');
    });

    this.client.on('auth_failure', () => {
      this.status = 'AUTH_FAILURE';
      this.logger.error('❌ Authentication failure');
    });

    this.client.on('disconnected', (reason) => {
      this.status = 'DISCONNECTED';
      this.logger.warn(`🧐 WhatsApp client disconnected: ${reason}`);
      this.scheduleReconnect();
    });

    // Captures every message (incoming and outgoing) into chat history.
    this.client.on('message_create', (message: Message) => {
      const chatId = message.fromMe ? message.to : message.from;

      const stored = {
        id: serializeMessageId(message.id) || `${Date.now()}`,
        chatId,
        from: message.from,
        to: message.to,
        body: message.body,
        fromMe: message.fromMe,
        timestamp: message.timestamp ?? Math.floor(Date.now() / 1000),
        hasMedia: message.hasMedia,
        type: message.type,
      };

      this.chatHistory.add(stored);
      this.linkLidAlias(chatId);

      if (message.fromMe) {
        this.resolveOutgoing(stored.body, stored.id);
      }

      if (!message.fromMe) {
        this.logger.log(`📥 Message from ${message.from}: ${message.body}`);
        this.webhook.notify(stored);
      }
    });
  }

  /**
   * Since WhatsApp's LID migration, chats are keyed by `<lid>@lid` instead of
   * the phone number, so history lookups by number would never match. Resolve
   * the number behind the lid once and register it as an alias. Fire-and-forget:
   * a failure only means that chat stays reachable by its `@lid` id.
   */
  private linkLidAlias(chatId: string | undefined): void {
    if (!chatId?.endsWith('@lid') || this.resolvedLids.has(chatId)) {
      return;
    }
    this.resolvedLids.add(chatId);

    this.client
      .getContactLidAndPhone([chatId])
      .then(([entry]) => {
        if (entry?.pn) {
          this.chatHistory.linkAlias(entry.pn, chatId);
        }
      })
      .catch((err) => {
        // Allow a later message from the same chat to retry.
        this.resolvedLids.delete(chatId);
        this.logger.warn(`Could not resolve phone number for ${chatId}`, err);
      });
  }

  /**
   * Reconnects after an unexpected disconnect. LocalAuth keeps the session, so
   * a fresh client re-pairs without a new QR (unless the session was revoked).
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }
    // Tear the old client down immediately instead of at reconnect time: after
    // a disconnect whatsapp-web.js keeps injecting into the page it is losing,
    // and those calls reject with "Attempted to use detached Frame" outside any
    // promise chain we own — which used to kill the process. Dropping the
    // listeners and destroying now closes that window.
    const dying = this.client;
    dying?.removeAllListeners();
    void dying?.destroy().catch(() => undefined);

    this.logger.log('🔄 Reconnecting in 5s...');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.initClient();
    }, 5000);
  }

  private clearQr(): void {
    this.lastQr = null;
    this.lastQrPng = null;
  }

  /** Caches the QR as a PNG data-URL (in memory) and an SVG file (legacy). */
  private async cacheQr(qr: string): Promise<void> {
    try {
      this.lastQrPng = await QRCode.toDataURL(qr);
      const svg = await QRCode.toString(qr, { type: 'svg' });
      const tmpPath = path.join(process.cwd(), 'tmp');
      await fs.mkdir(tmpPath, { recursive: true });
      await fs.writeFile(path.join(tmpPath, 'qr.svg'), svg, 'utf-8');
    } catch (err) {
      this.logger.error('❌ Error caching QR', err);
    }
  }

  /**
   * Destroys the puppeteer/Chrome instance on shutdown (incl. watch-mode
   * restarts). Without this the old Chrome keeps the LocalAuth session and
   * the next init crashes with "window['onQRChangedEvent'] already exists!".
   */
  async onModuleDestroy() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      this.logger.log('🛑 Destroying WhatsApp client...');
      await this.client?.destroy();
    } catch (err) {
      this.logger.error('❌ Error destroying WhatsApp client', err);
    }
  }

  getStatus(): { status: ConnectionStatus; qrAvailable: boolean } {
    return { status: this.status, qrAvailable: this.lastQr !== null };
  }

  getQr(): string | null {
    return this.lastQr;
  }

  /** QR as a PNG data-URL for rendering in a browser/<img>. */
  getQrPng(): string | null {
    return this.lastQrPng;
  }

  private assertReady(): void {
    if (this.status !== 'READY') {
      throw new ServiceUnavailableException(
        `WhatsApp client not ready (status: ${this.status}). Scan the QR (GET /api/whatsapp/qr) and wait for READY.`,
      );
    }
  }

  /**
   * The only way to reach the WhatsApp client. Guarantees the session is
   * READY, caps how many operations hit puppeteer at once and applies the
   * per-operation timeout. Every *Ops service goes through here.
   */
  async withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
    this.assertReady();
    return this.pool.run(() => fn(this.client));
  }

  /**
   * Claims the id of the next outgoing message whose body matches. Register it
   * BEFORE sending: whatsapp-web.js returns undefined from sendMessage on
   * current WhatsApp Web builds, so the `message_create` event is the only
   * place the real id shows up.
   *
   * Two identical bodies sent at the same instant could swap ids; that is the
   * accepted cost of matching on content, and it does not affect delivery.
   */
  expectOutgoingId(
    body: string,
    timeoutMs = 8000,
  ): { promise: Promise<string>; cancel: () => void } {
    let settle!: (id: string) => void;
    const promise = new Promise<string>((resolve) => {
      settle = resolve;
    });

    const waiter = { body, settle };
    this.outgoingWaiters.push(waiter);

    const timer = setTimeout(() => {
      this.dropWaiter(waiter);
      settle('');
    }, timeoutMs);

    const finish = () => {
      clearTimeout(timer);
      this.dropWaiter(waiter);
    };

    void promise.then(finish);

    return {
      promise,
      cancel: () => {
        finish();
        settle('');
      },
    };
  }

  private resolveOutgoing(body: string, id: string): void {
    const waiter = this.outgoingWaiters.find((w) => w.body === body);
    if (waiter) {
      this.dropWaiter(waiter);
      waiter.settle(id);
    }
  }

  private dropWaiter(waiter: OutgoingWaiter): void {
    const index = this.outgoingWaiters.indexOf(waiter);
    if (index >= 0) {
      this.outgoingWaiters.splice(index, 1);
    }
  }

  /** In-flight/queued operations, surfaced by the status endpoint. */
  getPoolStats(): { inFlight: number; queued: number; limit: number } {
    return this.pool.getStats();
  }

  getLoggedInUserInfo() {
    this.assertReady();
    const info = this.client.info;

    if (!info) {
      throw new ServiceUnavailableException('Client info not available');
    }

    return {
      number: info.wid?.user,
      pushname: info.pushname,
      platform: info.platform,
    };
  }

  /** Unlinks the session (removes device) and resets state. */
  async logout(): Promise<void> {
    await this.client.logout();
    this.status = 'DISCONNECTED';
    this.clearQr();
    this.logger.log('👋 Logged out');
  }
}
